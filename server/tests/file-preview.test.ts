import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPreview } from '../src/services/file-preview';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'preview-'));
});
const file = (name: string, content: string | Buffer) => {
  const p = path.join(dir, name);
  writeFileSync(p, content);
  return p;
};

describe('csv preview', () => {
  it('reads columns, counts rows and samples the first five', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => `${i + 1},name${i + 1}`).join('\n');
    const { sheets } = await buildPreview(file('a.csv', `id,name\n${rows}\n`), 'csv');
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.columns).toEqual(['id', 'name']);
    expect(sheets[0]!.rowCount).toBe(8);
    expect(sheets[0]!.sampleRows).toHaveLength(5);
  });

  it('handles BOM, semicolon delimiters, blank lines and blank headers', async () => {
    const { sheets } = await buildPreview(file('b.csv', '\uFEFFname;age;\nAda;36;x\n\nGrace;45;y\n'), 'csv');
    expect(sheets[0]!.columns).toEqual(['name', 'age', 'column_3']);
    expect(sheets[0]!.rowCount).toBe(2);
  });

  it('handles quoted fields containing delimiters and newlines', async () => {
    const { sheets } = await buildPreview(file('c.csv', 'id,note\n1,"hello, world"\n2,"line1\nline2"\n'), 'csv');
    expect(sheets[0]!.rowCount).toBe(2);
    expect(sheets[0]!.sampleRows[0]).toEqual(['1', 'hello, world']);
  });

  it('truncates very long cells in the preview', async () => {
    const { sheets } = await buildPreview(file('d.csv', `t\n${'x'.repeat(5000)}\n`), 'csv');
    expect(String(sheets[0]!.sampleRows[0]![0]).length).toBeLessThanOrEqual(201);
  });
});

describe('xlsx preview', () => {
  it('reads every sheet with names, ISO dates and formula results', async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet('Sales');
    s1.addRow(['region', 'revenue', 'when', 'doubled']);
    s1.addRow(['EU', 100, new Date('2026-01-02T00:00:00Z'), { formula: 'B2*2', result: 200 }]);
    s1.addRow(['US', 250, new Date('2026-02-03T00:00:00Z'), { formula: 'B3*2', result: 500 }]);
    const s2 = wb.addWorksheet('Targets');
    s2.addRow(['region', 'target']);
    s2.addRow(['EU', 90]);
    const p = path.join(dir, 'book.xlsx');
    await wb.xlsx.writeFile(p);

    const { sheets } = await buildPreview(p, 'xlsx');
    expect(sheets.map((s) => s.name)).toEqual(['Sales', 'Targets']);
    expect(sheets[0]!.rowCount).toBe(2);
    expect(sheets[0]!.sampleRows[0]).toEqual(['EU', 100, '2026-01-02T00:00:00.000Z', 200]);
    expect(sheets[1]!.columns).toEqual(['region', 'target']);
  });
});

describe('content validation', () => {
  it('rejects empty files', async () => {
    await expect(buildPreview(file('empty.csv', ''), 'csv')).rejects.toMatchObject({ code: 'EMPTY_FILE' });
    await expect(buildPreview(file('hdr-only.csv', ''), 'csv')).rejects.toMatchObject({ code: 'EMPTY_FILE' });
  });

  it('rejects content that does not match the extension', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('S').addRow(['a']);
    const x = path.join(dir, 'real.xlsx');
    await wb.xlsx.writeFile(x);
    await expect(buildPreview(x, 'csv')).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
    await expect(buildPreview(file('text.xlsx', 'a,b\n1,2\n'), 'xlsx')).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
    await expect(buildPreview(file('bin.csv', Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0x01])), 'csv')).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('reports corrupt workbooks as unreadable', async () => {
    const p = file('corrupt.xlsx', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('not really a zip')]));
    await expect(buildPreview(p, 'xlsx')).rejects.toMatchObject({ code: 'UNREADABLE_FILE' });
  });
});
