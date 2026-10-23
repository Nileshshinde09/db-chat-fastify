import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { parse } from 'csv-parse';
import ExcelJS from 'exceljs';
import type { AttachmentKind, SheetPreview } from '../models/attachment.model';

const SAMPLE_ROWS = 5;
const MAX_COLUMNS = 200;
const MAX_SHEETS = 10;
const MAX_CELL_CHARS = 200;

export class FilePreviewError extends Error {
  constructor(
    public readonly code: 'EMPTY_FILE' | 'UNREADABLE_FILE' | 'INVALID_FILE_TYPE',
    message: string,
  ) {
    super(message);
    this.name = 'FilePreviewError';
  }
}

async function readHead(file: string, bytes = 4096): Promise<Buffer> {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Extension is user-controlled, so also check the actual bytes. */
async function assertContentMatchesKind(file: string, kind: AttachmentKind): Promise<void> {
  const head = await readHead(file);
  if (head.length === 0) throw new FilePreviewError('EMPTY_FILE', 'The file is empty');
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (kind === 'xlsx' && !isZip) {
    throw new FilePreviewError('INVALID_FILE_TYPE', 'This does not look like a valid .xlsx file');
  }
  if (kind === 'csv' && (isZip || head.includes(0))) {
    throw new FilePreviewError('INVALID_FILE_TYPE', 'This does not look like a text CSV file');
  }
}

function clean(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v.length > MAX_CELL_CHARS ? `${v.slice(0, MAX_CELL_CHARS)}…` : v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return clean(o.result); // formula cell
    if (Array.isArray(o.richText)) return clean(o.richText.map((t: { text?: string }) => t.text ?? '').join(''));
    if ('text' in o) return clean(String(o.text)); // hyperlink cell
    if ('error' in o) return String(o.error);
    return clean(String(v));
  }
  return v;
}

function headerName(v: unknown, index: number): string {
  const s = v === null || v === undefined ? '' : String(clean(v)).trim();
  return s || `column_${index + 1}`;
}

function sniffDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

async function previewCsv(file: string): Promise<SheetPreview[]> {
  const head = (await readHead(file)).toString('utf8').replace(/^\uFEFF/, '');
  const delimiter = sniffDelimiter(head.split(/\r?\n/)[0] ?? '');
  const input = createReadStream(file);
  const parser = input.pipe(
    parse({ delimiter, bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true }),
  );

  let columns: string[] | null = null;
  const sampleRows: unknown[][] = [];
  let rowCount = 0;
  try {
    for await (const record of parser as AsyncIterable<string[]>) {
      if (!columns) {
        columns = record.slice(0, MAX_COLUMNS).map(headerName);
        continue;
      }
      rowCount++;
      if (sampleRows.length < SAMPLE_ROWS) sampleRows.push(record.slice(0, columns.length).map(clean));
    }
  } finally {
    input.destroy();
  }
  if (!columns) throw new FilePreviewError('EMPTY_FILE', 'The CSV file has no rows');
  return [{ name: 'Sheet1', columns, rowCount, sampleRows }];
}

async function previewXlsx(file: string): Promise<SheetPreview[]> {
  // Streaming reader: memory stays flat even for large sheets.
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    worksheets: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'cache',
    entries: 'ignore',
  });

  const sheets: SheetPreview[] = [];
  let sheetIndex = 0;
  for await (const sheet of reader) {
    sheetIndex++;
    const ws = sheet as unknown as AsyncIterable<{ values: unknown[] }> & { name?: string };
    let columns: string[] | null = null;
    const sampleRows: unknown[][] = [];
    let rowCount = 0;
    // Every worksheet must be fully consumed or the zip stream stalls.
    for await (const row of ws) {
      const values = Array.from(row.values as unknown[]).slice(1); // exceljs rows are 1-indexed
      if (values.every((v) => v === null || v === undefined || v === '')) continue;
      if (!columns) {
        columns = values.slice(0, MAX_COLUMNS).map(headerName);
        continue;
      }
      rowCount++;
      if (sampleRows.length < SAMPLE_ROWS) sampleRows.push(values.slice(0, columns.length).map(clean));
    }
    if (columns && sheets.length < MAX_SHEETS) {
      sheets.push({ name: ws.name || `Sheet${sheetIndex}`, columns, rowCount, sampleRows });
    }
  }
  if (sheets.length === 0) throw new FilePreviewError('EMPTY_FILE', 'The workbook has no data');
  return sheets;
}

export async function buildPreview(file: string, kind: AttachmentKind): Promise<{ sheets: SheetPreview[] }> {
  await assertContentMatchesKind(file, kind);
  try {
    const sheets = kind === 'csv' ? await previewCsv(file) : await previewXlsx(file);
    return { sheets };
  } catch (err) {
    if (err instanceof FilePreviewError) throw err;
    throw new FilePreviewError('UNREADABLE_FILE', `The file could not be read: ${(err as Error).message}`);
  }
}
