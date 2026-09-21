import type { CalendarSnapshot, SyncRequest } from '../shared';
import { generateCalendar, normalizeCourses } from './calendar';
import { ApiFailure, fetchRegisteredCourses, sha256 } from './vergil';

export interface Env { DB: D1Database; ASSETS: Fetcher; PUBLIC_APP_URL?: string }
interface CalendarRow { id: string; management_hash: string; subject_hash: string; snapshot: string; ics: string; etag: string; revision: number }
const securityHeaders = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { ...securityHeaders, 'Cache-Control': 'no-store' } });
}
function secret() { return [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function invalidInput() { return new ApiFailure(400, 'INVALID_INPUT', 'Provide both tokens, a valid term, and valid calendar settings.'); }

async function readInput(request: Request): Promise<SyncRequest> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiFailure(415, 'CONTENT_TYPE', 'Send a JSON request.');
  if (Number(request.headers.get('Content-Length') ?? 0) > 32_768) throw new ApiFailure(413, 'BODY_TOO_LARGE', 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw invalidInput();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 32_768) { await reader.cancel(); throw new ApiFailure(413, 'BODY_TOO_LARGE', 'The request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: any;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw invalidInput(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidInput();
  for (const key of ['accessToken', 'refreshToken']) {
    if (typeof value[key] !== 'string' || !value[key].length || value[key].length > 16_384 || /\s|[\x00-\x1f\x7f]/.test(value[key])) throw invalidInput();
  }
  if (typeof value.term !== 'string' || !/^20\d{2}[123]$/.test(value.term)) throw invalidInput();
  if (value.title !== undefined && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || /[\x00-\x1f\x7f]/.test(value.title))) throw invalidInput();
  if (value.excludedDates !== undefined && (!Array.isArray(value.excludedDates) || value.excludedDates.length > 366)) throw invalidInput();
  for (const date of value.excludedDates ?? []) {
    if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw invalidInput();
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken, term: value.term, title: value.title?.trim(), excludedDates: [...new Set<string>(value.excludedDates ?? [])].sort() };
}
async function managed(request: Request, env: Env, id: string): Promise<CalendarRow> {
  const bearer = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') ?? '');
  if (!bearer) throw new ApiFailure(401, 'MANAGEMENT_AUTH', 'The calendar management key is missing or invalid.');
  const row = await env.DB.prepare('SELECT * FROM calendars WHERE id = ? AND management_hash = ?').bind(id, await sha256(bearer[1]!)).first<CalendarRow>();
  if (!row) throw new ApiFailure(401, 'MANAGEMENT_AUTH', 'The calendar management key is missing or invalid.');
  return row;
}
function snapshot(row: CalendarRow, origin: string): CalendarSnapshot {
  return { ...JSON.parse(row.snapshot), id: row.id, feedUrl: `${origin}/calendar/${row.id}.ics` };
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = env.PUBLIC_APP_URL ? new URL(env.PUBLIC_APP_URL).origin : url.origin;
  const path = url.pathname;
  if (path.startsWith('/api/') && ['POST', 'DELETE', 'PUT', 'PATCH'].includes(request.method)) {
    const suppliedOrigin = request.headers.get('Origin');
    if (suppliedOrigin && suppliedOrigin !== origin) throw new ApiFailure(403, 'ORIGIN', 'This request must come from the calendar application.');
  }
  const api = /^\/api\/calendars\/([a-f0-9]{64})(\/sync)?$/.exec(path);
  const create = path === '/api/calendars' && request.method === 'POST';
  const sync = api?.[2] === '/sync' && request.method === 'POST';
  if (create || sync) {
    // Check calendar control before reading or forwarding the school credentials.
    const existing = sync ? await managed(request, env, api![1]!) : undefined;
    const input = await readInput(request);
    const fetched = await fetchRegisteredCourses(input, existing?.subject_hash);
    const id = existing?.id ?? secret();
    const managementToken = existing ? undefined : secret();
    let normalized: ReturnType<typeof normalizeCourses>;
    let generated: ReturnType<typeof generateCalendar>;
    const title = input.title ?? 'Columbia classes';
    const previousTime = existing ? Date.parse(JSON.parse(existing.snapshot).updatedAt) : 0;
    const updatedAt = new Date(Math.max(Date.now(), previousTime + 1_000)).toISOString();
    try {
      normalized = normalizeCourses(fetched.rawCourses, fetched.registeredIds);
      generated = generateCalendar({ calendarId: id, title, courses: normalized.courses, excludedDates: input.excludedDates ?? [], updatedAt });
    } catch { throw new ApiFailure(502, 'UPSTREAM_DATA', 'Could not interpret the complete class schedule. The saved calendar was not changed.'); }
    const stored = {
      title, term: input.term, updatedAt, courseCount: normalized.courses.length, eventCount: generated.eventCount,
      courses: normalized.courses, excludedDates: input.excludedDates ?? [], warnings: normalized.warnings,
    };
    const etag = `"${await sha256(generated.ics)}"`;
    const serialized = JSON.stringify(stored);
    if (existing) {
      const result = await env.DB.prepare('UPDATE calendars SET snapshot = ?, ics = ?, etag = ?, revision = revision + 1 WHERE id = ? AND management_hash = ? AND revision = ?')
        .bind(serialized, generated.ics, etag, id, existing.management_hash, existing.revision).run();
      if (result.meta.changes !== 1) throw new ApiFailure(409, 'SYNC_CONFLICT', 'The calendar changed during this sync. Reload it and try again.');
    } else {
      await env.DB.prepare('INSERT INTO calendars (id, management_hash, subject_hash, snapshot, ics, etag) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, await sha256(managementToken!), fetched.subjectHash, serialized, generated.ics, etag).run();
    }
    return json({ ...stored, id, feedUrl: `${origin}/calendar/${id}.ics`, ...(managementToken ? { managementToken } : {}), refreshed: fetched.refreshed }, create ? 201 : 200);
  }
  if (api && !api[2] && ['GET', 'DELETE'].includes(request.method)) {
    const row = await managed(request, env, api[1]!);
    if (request.method === 'GET') return json(snapshot(row, origin));
    await env.DB.prepare('DELETE FROM calendars WHERE id = ? AND management_hash = ?').bind(row.id, row.management_hash).run();
    return new Response(null, { status: 204, headers: { ...securityHeaders, 'Cache-Control': 'no-store' } });
  }
  const feed = /^\/calendar\/([a-f0-9]{64})\.ics$/.exec(path);
  if (feed && ['GET', 'HEAD'].includes(request.method)) {
    const row = await env.DB.prepare('SELECT * FROM calendars WHERE id = ?').bind(feed[1]!).first<CalendarRow>();
    if (!row) throw new ApiFailure(404, 'NOT_FOUND', 'Calendar not found.');
    const headers = { ...securityHeaders, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="classes.ics"', 'Cache-Control': 'private, no-cache', ETag: row.etag };
    const tags = request.headers.get('If-None-Match')?.split(',').map((tag) => tag.trim().replace(/^W\//, '')) ?? [];
    if (tags.includes(row.etag) || tags.includes('*')) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : row.ics, { headers });
  }
  if (path === '/api' || path.startsWith('/api/') || path.startsWith('/calendar/')) throw new ApiFailure(404, 'NOT_FOUND', 'Not found.');
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return new Response(asset.body, { status: asset.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await route(request, env); }
    catch (error) {
      if (error instanceof ApiFailure) return json({ error: error.message, code: error.code }, error.status);
      return json({ error: 'The request could not be completed. The saved calendar was not changed.', code: 'INTERNAL_ERROR' }, 500);
    }
  },
};
