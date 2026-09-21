import type { CalendarLookupRequest, CalendarSemester, CalendarSnapshot, SyncRequest } from '../shared';
import { isManagementPage, isPublicPage, noIndex, pageSeo, publicContent, seoHead, sitemap } from '../seo';
import { generateSemesterCalendar, normalizeCourses } from './calendar';
import { ApiFailure, authenticateColumbia, fetchRegisteredCourses, sha256, verifyColumbiaIdentity } from './vergil';

export interface Env { DB: D1Database; ASSETS: Fetcher; PUBLIC_APP_URL?: string }
interface CalendarRow { id: string; feed_id: string; management_hash: string; subject_hash: string; snapshot: string; ics: string; etag: string; revision: number }
const securityHeaders = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { ...securityHeaders, 'Cache-Control': 'no-store', 'X-Robots-Tag': noIndex } });
}
function secret() { return [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function invalidInput() { return new ApiFailure(400, 'INVALID_INPUT', 'Provide an Access Token, a valid term, and valid calendar settings. Refresh Token is optional.'); }

async function readCredentials(request: Request): Promise<CalendarLookupRequest & Record<string, any>> {
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
    if (key === 'refreshToken' && (value[key] === undefined || value[key] === '')) continue;
    if (typeof value[key] !== 'string' || !value[key].length || value[key].length > 16_384 || /\s|[\x00-\x1f\x7f]/.test(value[key])) throw invalidInput();
  }
  return { ...value, refreshToken: value.refreshToken || undefined };
}
async function readInput(request: Request): Promise<SyncRequest> {
  const value = await readCredentials(request);
  if (typeof value.term !== 'string' || !/^20\d{2}[123]$/.test(value.term)) throw invalidInput();
  if (value.title !== undefined && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || /[\x00-\x1f\x7f]/.test(value.title))) throw invalidInput();
  if (value.excludedDates !== undefined && (!Array.isArray(value.excludedDates) || value.excludedDates.length > 366)) throw invalidInput();
  for (const date of value.excludedDates ?? []) {
    if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw invalidInput();
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken || undefined, term: value.term, title: value.title?.trim(), excludedDates: [...new Set<string>(value.excludedDates ?? [])].sort() };
}
async function managed(request: Request, env: Env, id: string): Promise<CalendarRow> {
  const bearer = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') ?? '');
  if (!bearer) throw new ApiFailure(401, 'MANAGEMENT_AUTH', 'The calendar management key is missing or invalid.');
  const row = await env.DB.prepare('SELECT * FROM calendars WHERE id = ? AND management_hash = ?').bind(id, await sha256(bearer[1]!)).first<CalendarRow>();
  if (!row) throw new ApiFailure(401, 'MANAGEMENT_AUTH', 'The calendar management key is missing or invalid.');
  return row;
}
function snapshot(row: CalendarRow, origin: string): CalendarSnapshot {
  const stored = JSON.parse(row.snapshot);
  const semesters: CalendarSemester[] = stored.semesters ?? [{ term: stored.term, updatedAt: stored.updatedAt, courses: stored.courses, excludedDates: stored.excludedDates, warnings: stored.warnings }];
  return { ...stored, semesters, id: row.id, feedUrl: `${origin}/calendar/${row.feed_id}.ics` };
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = env.PUBLIC_APP_URL ? new URL(env.PUBLIC_APP_URL).origin : url.origin;
  const path = url.pathname;
  if (path.startsWith('/api/') && ['POST', 'DELETE', 'PUT', 'PATCH'].includes(request.method)) {
    const suppliedOrigin = request.headers.get('Origin');
    if (suppliedOrigin && suppliedOrigin !== origin) throw new ApiFailure(403, 'ORIGIN', 'This request must come from the calendar application.');
  }
  const api = /^\/api\/calendars\/([a-f0-9]{64})(\/sync|\/rotate)?$/.exec(path);
  const create = path === '/api/calendars' && request.method === 'POST';
  const sync = api?.[2] === '/sync' && request.method === 'POST';
  if (path === '/api/calendars/lookup' && request.method === 'POST') {
    const identity = await verifyColumbiaIdentity(await readCredentials(request));
    const rows = await env.DB.prepare("SELECT * FROM calendars WHERE subject_hash = ? ORDER BY json_extract(snapshot, '$.updatedAt') DESC, id").bind(identity.subjectHash).all<CalendarRow>();
    return json({ calendars: rows.results.map(row => snapshot(row, origin)), refreshed: identity.refreshed });
  }
  if (create || sync) {
    // A supplied management key must be valid; without one, verified school identity authorizes the update below.
    let existing = sync ? (request.headers.has('Authorization')
      ? await managed(request, env, api![1]!)
      : await env.DB.prepare('SELECT * FROM calendars WHERE id = ?').bind(api![1]!).first<CalendarRow>()) : undefined;
    if (sync && !existing) throw new ApiFailure(404, 'NOT_FOUND', 'Calendar not found.');
    const input = await readInput(request);
    const school = await authenticateColumbia(input);
    if (create) existing = await env.DB.prepare('SELECT * FROM calendars WHERE subject_hash = ?').bind(school.subjectHash).first<CalendarRow>();
    const fetched = await fetchRegisteredCourses(input, existing?.subject_hash, school);
    const id = existing?.id ?? secret();
    const managementToken = existing ? undefined : secret();
    let normalized: ReturnType<typeof normalizeCourses>;
    let generated: ReturnType<typeof generateSemesterCalendar>;
    const previous = existing ? snapshot(existing, origin) : undefined;
    const title = input.title ?? previous?.title ?? 'Columbia classes';
    const previousTime = existing ? Date.parse(JSON.parse(existing.snapshot).updatedAt) : 0;
    const updatedAt = new Date(Math.max(Date.now(), previousTime + 1_000)).toISOString();
    let semesters: CalendarSemester[];
    try {
      normalized = normalizeCourses(fetched.rawCourses, fetched.registeredIds);
      semesters = [...(previous?.semesters ?? []).filter(semester => semester.term !== input.term), { term: input.term, updatedAt, courses: normalized.courses, excludedDates: input.excludedDates ?? [], warnings: normalized.warnings }].sort((a, b) => b.term.localeCompare(a.term));
      generated = generateSemesterCalendar(id, title, semesters);
    } catch { throw new ApiFailure(502, 'UPSTREAM_DATA', 'Could not interpret the complete class schedule. The saved calendar was not changed.'); }
    const stored = {
      title, term: input.term, updatedAt, courseCount: semesters.reduce((count, semester) => count + semester.courses.length, 0), eventCount: generated.eventCount,
      courses: semesters.flatMap(semester => semester.courses), excludedDates: input.excludedDates ?? [], warnings: [...new Set(semesters.flatMap(semester => semester.warnings))], semesters,
    };
    const etag = `"${await sha256(generated.ics)}"`;
    const serialized = JSON.stringify(stored);
    if (existing) {
      const result = await env.DB.prepare('UPDATE calendars SET snapshot = ?, ics = ?, etag = ?, revision = revision + 1 WHERE id = ? AND management_hash = ? AND revision = ?')
        .bind(serialized, generated.ics, etag, id, existing.management_hash, existing.revision).run();
      if (result.meta.changes !== 1) throw new ApiFailure(409, 'SYNC_CONFLICT', 'The calendar changed during this sync. Reload it and try again.');
    } else {
      const result = await env.DB.prepare('INSERT INTO calendars (id, feed_id, management_hash, subject_hash, snapshot, ics, etag) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(subject_hash) DO NOTHING')
        .bind(id, id, await sha256(managementToken!), fetched.subjectHash, serialized, generated.ics, etag).run();
      if (result.meta.changes !== 1) throw new ApiFailure(409, 'SYNC_CONFLICT', 'A calendar was created for this account while this request was running. Find your calendar and try again.');
    }
    return json({ ...stored, id, feedUrl: `${origin}/calendar/${existing?.feed_id ?? id}.ics`, ...(managementToken ? { managementToken } : {}), refreshed: fetched.refreshed }, existing ? 200 : 201);
  }
  if (api?.[2] === '/rotate' && request.method === 'POST') {
    const row = request.headers.has('Authorization') ? await managed(request, env, api[1]!) : await env.DB.prepare('SELECT * FROM calendars WHERE id = ?').bind(api[1]!).first<CalendarRow>();
    if (!row) throw new ApiFailure(404, 'NOT_FOUND', 'Calendar not found.');
    if (!request.headers.has('Authorization')) {
      const identity = await verifyColumbiaIdentity(await readCredentials(request));
      if (identity.subjectHash !== row.subject_hash) throw new ApiFailure(403, 'OWNER_MISMATCH', 'Use the Columbia account that created this calendar.');
    }
    const feedId = secret();
    const result = await env.DB.prepare('UPDATE calendars SET feed_id = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(feedId, row.id, row.revision).run();
    if (result.meta.changes !== 1) throw new ApiFailure(409, 'SYNC_CONFLICT', 'The calendar changed. Reload it and try again.');
    return json(snapshot({ ...row, feed_id: feedId }, origin));
  }
  if (api && !api[2] && ['GET', 'DELETE'].includes(request.method)) {
    const row = await managed(request, env, api[1]!);
    if (request.method === 'GET') return json(snapshot(row, origin));
    await env.DB.prepare('DELETE FROM calendars WHERE id = ? AND management_hash = ?').bind(row.id, row.management_hash).run();
    return new Response(null, { status: 204, headers: { ...securityHeaders, 'Cache-Control': 'no-store', 'X-Robots-Tag': noIndex } });
  }
  const feed = /^\/calendar\/([a-f0-9]{64})\.ics$/.exec(path);
  if (feed && ['GET', 'HEAD'].includes(request.method)) {
    const row = await env.DB.prepare('SELECT * FROM calendars WHERE feed_id = ?').bind(feed[1]!).first<CalendarRow>();
    if (!row) throw new ApiFailure(404, 'NOT_FOUND', 'Calendar not found.');
    const headers = { ...securityHeaders, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="classes.ics"', 'Cache-Control': 'private, no-cache', 'X-Robots-Tag': noIndex, ETag: row.etag };
    const tags = request.headers.get('If-None-Match')?.split(',').map((tag) => tag.trim().replace(/^W\//, '')) ?? [];
    if (tags.includes(row.etag) || tags.includes('*')) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : row.ics, { headers });
  }
  if (path === '/api' || path.startsWith('/api/') || path.startsWith('/calendar/')) throw new ApiFailure(404, 'NOT_FOUND', 'Not found.');
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...securityHeaders, Allow: 'GET, HEAD', 'X-Robots-Tag': noIndex } });
  if (path === '/robots.txt' || path === '/sitemap.xml') {
    // Allow crawlers to see noindex on private URLs; robots exclusions would hide it.
    const body = path === '/robots.txt' ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n` : sitemap(origin);
    return new Response(request.method === 'HEAD' ? null : body, { headers: { ...securityHeaders, 'Content-Type': path === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  }
  if (path === '/index.html' || path === '/guide/' || /^\/manage\/[a-f0-9]{64}\/$/.test(path)) {
    url.pathname = path === '/index.html' ? '/' : path.slice(0, -1);
    return new Response(null, { status: 308, headers: { ...securityHeaders, Location: `${url.pathname}${url.search}` } });
  }
  const knownPage = isPublicPage(path) || isManagementPage(path);
  // Fetch the app shell explicitly; missing assets must not inherit SPA fallback's 200.
  const assetRequest = new Request(knownPage ? new URL('/', url) : url, { method: 'GET', headers: knownPage ? undefined : request.headers });
  const asset = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const html = asset.headers.get('Content-Type')?.includes('text/html');
  if (knownPage || html) {
    const page = pageSeo(url, origin);
    headers.set('Cache-Control', isPublicPage(path) ? 'public, max-age=0, must-revalidate' : 'no-store');
    headers.delete('ETag');
    headers.delete('Last-Modified');
    headers.delete('Content-Length');
    headers.set('Content-Type', 'text/html; charset=utf-8');
    if (!page.publicPage) headers.set('X-Robots-Tag', noIndex);
    const rewritten = new HTMLRewriter()
      .on('html', { element(element) { element.setAttribute('lang', page.locale); } })
      .on('[data-seo]', { element(element) { element.remove(); } })
      .on('head', { element(element) { element.append(seoHead(page), { html: true }); } })
      .on('#root', { element(element) { element.setInnerContent(publicContent(page), { html: true }); } })
      .transform(new Response(asset.body, { status: knownPage ? asset.status : 404, headers }));
    return request.method === 'HEAD' ? new Response(null, { status: rewritten.status, headers: rewritten.headers }) : rewritten;
  }
  if (asset.status >= 400) headers.set('X-Robots-Tag', noIndex);
  return new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, headers });
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
