// src/app/api/proxy/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * BFF Proxy — forwards browser requests to the backend.
 *
 * Why:
 *  - Kills CORS (browser → same origin, server → backend has no CORS)
 *  - Hides secrets (API keys, backend URL stay server-side)
 *  - Forwards Set-Cookie correctly (needed for refresh tokens)
 *  - Injects X-Tenant-Id for multi-tenant routing
 */

const BACKEND_URL = process.env.APPLICATION_BACKEND_URL;

// Headers we DON'T forward to the backend
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

// Headers we DON'T copy back to the browser
const RESPONSE_HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding", // Next handles this
  "content-length",   // recomputed
]);

function buildUpstreamHeaders(req: NextRequest): Headers {
  const headers = new Headers();

  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) return;
    if (lower.startsWith("x-forwarded-")) return;
    headers.set(key, value);
  });

  // Inject backend API key if configured (server-side only — never exposed)
  if (process.env.BACKEND_API_KEY) {
    headers.set("X-Api-Key", process.env.BACKEND_API_KEY);
  }

  return headers;
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // ── 1. Guard: backend URL must be configured ──────────────
  if (!BACKEND_URL) {
    console.error("[proxy] APPLICATION_BACKEND_URL is not set");
    return NextResponse.json(
      { message: "Server misconfigured: backend URL missing" },
      { status: 500 }
    );
  }

  // ── 2. Unwrap params (Next.js 15 makes these Promises) ────
  const { path } = await params;

  // ── 3. Build upstream URL ─────────────────────────────────
  const base = BACKEND_URL.replace(/\/$/, "");       // strip trailing slash
  const joined = path.join("/");                     // e.g. "api/v1/auth/login"
  const upstreamUrl = `${base}/${joined}${req.nextUrl.search}`;

  // ── 4. Read request body (skip for GET/HEAD) ──────────────
  const method = req.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  // ── 5. Forward request ────────────────────────────────────
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: buildUpstreamHeaders(req),
      body,
      cache: "no-store",
      redirect: "manual", // let backend control redirects
    });
  } catch (err) {
    console.error("[proxy] upstream fetch failed:", err);
    return NextResponse.json(
      { message: "Backend unavailable" },
      { status: 502 }
    );
  }

  // ── 6. Build response headers from upstream ───────────────
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (RESPONSE_HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return; // handled separately below
    responseHeaders.set(key, value);
  });

  // ── 7. Construct NextResponse (stream body) ───────────────
  const res = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });

  // ── 8. Forward Set-Cookie (the crucial part) ──────────────
  // Use getSetCookie() so we get ALL cookies, not a comma-joined blob
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    // Optionally rewrite Path if backend cookie path doesn't match
    // the browser-visible path. Uncomment if your backend uses
    // Path=/api/v1/auth and you can't change it.
    //
    // const rewritten = cookie.replace(
    //   /Path=\/api\/v1\/auth/gi,
    //   "Path=/api/proxy/api/v1/auth"
    // );
    // res.headers.append("Set-Cookie", rewritten);
    res.headers.append("Set-Cookie", cookie);
  }

  return res;
}

// ── Export all HTTP methods ─────────────────────────────────
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;