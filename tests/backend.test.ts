import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import worker, { type Env } from '../src/server';
import { fetchRegisteredCourses } from '../src/server/vergil';

const input = { accessToken: 'synthetic-access-token', refreshToken: 'synthetic-refresh-token', term: '20263' };
const rawCourse = { course_identifier2: 'TEST1001', course_official_title: 'Synthetic course', class_data: { classes: [
  { id: 101, section_code: '001', meeting_details: [{ id: 1, begin_date: '2026-09-08', end_date: '2026-12-15', meeting_pattern: { meetingpatterndetail_set: [{ id: 11, week_day: 'Tu', from_time: '10:10:00', to_time: '11:25:00' }] }, room: { room_code: '101', building: { building_name: 'Example Hall' } } }] },
] } };
let db: Database;
let env: Env;
let subject: string;
let failAuth: boolean;
let accessExpired: boolean;
let refreshCount: number;
let calls: { url: string; headers: Headers; body: string }[];
let savedFetch: typeof fetch;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_calendars.sql', import.meta.url), 'utf8'));
  env = { DB: { prepare(sql: string) { return { bind(...values: any[]) { return {
    async first() { return db.query(sql).get(...values); },
    async run() { const result = db.query(sql).run(...values); return { success: true, meta: { changes: result.changes } }; },
  }; } }; } } as unknown as D1Database, ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher };
  subject = 'abc1234'; failAuth = false; accessExpired = false; refreshCount = 0; calls = [];
  savedFetch = globalThis.fetch;
  globalThis.fetch = mock(async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(resource));
    const headers = new Headers(init?.headers);
    calls.push({ url: url.href, headers, body: String(init?.body ?? '') });
    expect(init?.redirect).toBe('manual');
    expect(init?.cache).toBe('no-store');
    // Mirror the live JSON:API renderer, including requests retried after refresh.
    if (url.hostname.endsWith('.api.columbia.edu') && !headers.get('Accept')?.split(',').map(value => value.trim()).includes('application/vnd.api+json')) {
      return new Response('', { status: 406 });
    }
    if (url.pathname === '/as/token.oauth2') {
      refreshCount++;
      expect(new URLSearchParams(String(init?.body)).get('scope')).toBeNull();
      expect(new URLSearchParams(String(init?.body)).get('refresh_token')).toBe(input.refreshToken);
      return failAuth ? new Response('', { status: 400 }) : Response.json({ access_token: 'synthetic-rotated-access', refresh_token: 'synthetic-rotated-refresh' });
    }
    if (failAuth || (accessExpired && headers.get('Authorization') === `Bearer ${input.accessToken}`)) return new Response('', { status: 401 });
    if (url.pathname === '/idp/userinfo.openid') return Response.json({ sub: subject });
    if (url.pathname === '/v1/personrolestatuses') return Response.json({ data: [{ relationships: { person: { data: { type: 'Person', id: '12' } } } }], included: [{ type: 'Person', id: '12', attributes: { uni: subject.split('@')[0], is_active: true } }] });
    if (url.pathname === '/v1/studentclasses') return Response.json({ data: [
      { attributes: { student_pk: 12, year: 2026, class_id: 101 }, relationships: { term: { data: { type: 'Term', id: '3' } } } },
      { attributes: { student_pk: 12, year: 2025, class_id: 102 }, relationships: { term: { data: { type: 'Term', id: '3' } } } },
    ], included: [{ type: 'Term', id: '3', attributes: { term_code: '3' } }], links: { next: null } });
    if (url.pathname === '/v1/course_and_class_search') { expect(url.searchParams.get('class.id__in')).toBe('101'); return Response.json({ data: { courses: [rawCourse], total_count: 1 } }); }
    throw new Error('Unexpected synthetic endpoint');
  }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = savedFetch; db.close(); });
function request(path = '/api/calendars', body: unknown = input, managementToken?: string, method = 'POST') {
  return new Request(`https://calendar.example${path}`, { method, headers: { 'Content-Type': 'application/json', ...(managementToken ? { Authorization: `Bearer ${managementToken}` } : {}) }, ...(body === undefined || method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body) }) });
}
async function create() { const response = await worker.fetch(request(), env); expect(response.status).toBe(201); return response.json() as Promise<any>; }
function stored() { return JSON.stringify(db.query('SELECT * FROM calendars').all()); }

test('creation, stable subscription, management isolation, and deletion never store school credentials', async () => {
  accessExpired = true;
  const created = await create();
  expect(created.refreshed).toBe(true); expect(refreshCount).toBe(1);
  expect(created.courseCount).toBe(1); expect(created.eventCount).toBe(15);
  expect(created.id).toMatch(/^[a-f0-9]{64}$/); expect(created.managementToken).not.toBe(created.id);
  const persisted = stored();
  for (const secret of [input.accessToken, input.refreshToken, 'synthetic-rotated-access', 'synthetic-rotated-refresh', created.managementToken, subject]) expect(persisted).not.toContain(secret);
  expect(JSON.stringify(created)).not.toContain(input.accessToken);
  const feed = await worker.fetch(new Request(created.feedUrl), env);
  expect(feed.headers.get('Content-Type')).toContain('text/calendar');
  expect(feed.headers.get('X-Robots-Tag')).toContain('noindex');
  expect(await feed.text()).toContain('BEGIN:VEVENT');
  const cached = await worker.fetch(new Request(created.feedUrl, { headers: { 'If-None-Match': feed.headers.get('ETag')! } }), env);
  expect(cached.status).toBe(304);
  expect(cached.headers.get('X-Robots-Tag')).toContain('noindex');
  const denied = await worker.fetch(request(`/api/calendars/${created.id}`, undefined, created.id, 'GET'), env);
  expect(denied.status).toBe(401);
  const read = await worker.fetch(request(`/api/calendars/${created.id}`, undefined, created.managementToken, 'GET'), env);
  expect(read.headers.get('X-Robots-Tag')).toContain('noindex');
  expect(read.status).toBe(200); expect(read.headers.get('Cache-Control')).toBe('no-store');
  expect(JSON.stringify(await read.json())).not.toContain(created.managementToken);
  const deleted = await worker.fetch(request(`/api/calendars/${created.id}`, undefined, created.managementToken, 'DELETE'), env);
  expect(deleted.status).toBe(204); expect((await worker.fetch(new Request(created.feedUrl), env)).status).toBe(404);
});

test('failed authentication refreshes once and preserves the previous snapshot exactly', async () => {
  const created = await create(); const previous = stored();
  failAuth = true;
  const result = await worker.fetch(request(`/api/calendars/${created.id}/sync`, input, created.managementToken), env);
  expect(result.status).toBe(401); expect(refreshCount).toBe(1); expect(stored()).toBe(previous);
  expect(await result.text()).not.toContain(input.refreshToken);
});

test('same-owner validation and management authorization happen before school data can be replaced', async () => {
  const created = await create(); const previous = stored();
  const before = calls.length;
  expect((await worker.fetch(request(`/api/calendars/${created.id}/sync`, input, created.id), env)).status).toBe(401);
  expect(calls.length).toBe(before);
  subject = 'different123';
  expect((await worker.fetch(request(`/api/calendars/${created.id}/sync`, input, created.managementToken), env)).status).toBe(403);
  expect(calls.length).toBe(before + 1); expect(stored()).toBe(previous);
});

test('successful update preserves the feed and uses a compare-and-swap revision', async () => {
  const created = await create();
  const updated = await worker.fetch(request(`/api/calendars/${created.id}/sync`, { ...input, title: 'Updated', excludedDates: ['2026-09-15'] }, created.managementToken), env);
  expect(updated.status).toBe(200);
  const body = await updated.json() as any;
  expect(body.feedUrl).toBe(created.feedUrl); expect(body.managementToken).toBeUndefined();
  expect(Date.parse(body.updatedAt) - Date.parse(created.updatedAt)).toBeGreaterThanOrEqual(1_000);
  expect(db.query('SELECT revision FROM calendars').get()).toEqual({ revision: 2 });
  expect(body.eventCount).toBe(14);
  expect(stored()).not.toContain('DTSTART:20260915');
});

test('a stream exceeding 32 KB and a foreign Origin are rejected before upstream calls', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32_769)); controller.close(); } });
  const oversized = new Request('https://calendar.example/api/calendars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
  expect((await worker.fetch(oversized, env)).status).toBe(413);
  const foreign = request(); foreign.headers.set('Origin', 'https://other.example');
  expect((await worker.fetch(foreign, env)).status).toBe(403); expect(calls.length).toBe(0);
});

test('pagination cannot send bearer credentials to a different host', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = mock(async (resource: RequestInfo | URL, init?: RequestInit) => {
    if (String(resource).includes('/v1/studentclasses')) return Response.json({ data: [], included: [], links: { next: 'https://attacker.example/steal' } });
    return original(resource, init);
  }) as unknown as typeof fetch;
  await expect(fetchRegisteredCourses(input)).rejects.toMatchObject({ code: 'UPSTREAM_DATA' });
  expect(calls.every((call) => !call.url.includes('attacker'))).toBe(true);
});

test('upstream redirects are rejected without forwarding credentials or saving a calendar', async () => {
  let attempts = 0;
  globalThis.fetch = mock(async (_resource: RequestInfo | URL, init?: RequestInit) => {
    attempts++;
    expect(init?.redirect).toBe('manual');
    return new Response(null, { status: 302, headers: { Location: 'https://attacker.example/private' } });
  }) as unknown as typeof fetch;
  const response = await worker.fetch(request(), env);
  expect(response.status).toBe(502);
  const body = await response.text();
  expect(body).toContain('HTTP 302');
  for (const value of [input.accessToken, input.refreshToken, 'attacker.example']) expect(body).not.toContain(value);
  expect(attempts).toBe(1);
  expect(stored()).toBe('[]');
});

test('a racing update rejects the stale sync without overwriting its stored snapshot', async () => {
  const created = await create(); const previous = db.query('SELECT snapshot FROM calendars').get();
  const original = globalThis.fetch;
  globalThis.fetch = mock(async (resource: RequestInfo | URL, init?: RequestInit) => {
    if (String(resource).includes('/course_and_class_search')) db.query('UPDATE calendars SET revision = revision + 1').run();
    return original(resource, init);
  }) as unknown as typeof fetch;
  const response = await worker.fetch(request(`/api/calendars/${created.id}/sync`, { ...input, title: 'Cannot commit' }, created.managementToken), env);
  expect(response.status).toBe(409); expect(db.query('SELECT snapshot FROM calendars').get()).toEqual(previous);
});

test('a refresh token for another account cannot switch identity midway through a sync', async () => {
  const created = await create(); const previous = stored();
  const original = globalThis.fetch;
  globalThis.fetch = mock(async (resource: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (String(resource).includes('/personrolestatuses') && headers.get('Authorization') === `Bearer ${input.accessToken}`) return new Response('', { status: 401 });
    if (String(resource).includes('/idp/userinfo.openid') && headers.get('Authorization') === 'Bearer synthetic-rotated-access') return Response.json({ sub: 'someoneelse123' });
    return original(resource, init);
  }) as unknown as typeof fetch;
  const response = await worker.fetch(request(`/api/calendars/${created.id}/sync`, input, created.managementToken), env);
  expect(response.status).toBe(401); expect(refreshCount).toBe(1); expect(stored()).toBe(previous);
});

test('401 after successful refresh does not attempt a second refresh', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = mock(async (resource: RequestInfo | URL, init?: RequestInit) => {
    if (String(resource).includes('/idp/userinfo.openid')) return new Response('', { status: 401 });
    return original(resource, init);
  }) as unknown as typeof fetch;
  expect((await worker.fetch(request(), env)).status).toBe(401); expect(refreshCount).toBe(1); expect(stored()).toBe('[]');
});

test('all registration pages are fetched before generating a snapshot', async () => {
  const original = globalThis.fetch;
  let registrationPages = 0;
  globalThis.fetch = mock(async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(resource));
    if (url.pathname === '/v1/studentclasses') {
      registrationPages++;
      const page = await (await original(resource, init)).json() as any;
      const next = new URL(url); next.searchParams.set('page[number]', '2');
      page.data = url.searchParams.has('page[number]') ? [page.data[0]] : [page.data[1]];
      page.links.next = url.searchParams.has('page[number]') ? null : next.href;
      page.meta = { pagination: { pages: 2, count: 2 } };
      return Response.json(page);
    }
    return original(resource, init);
  }) as unknown as typeof fetch;
  const created = await create();
  expect(registrationPages).toBe(2); expect(created.courseCount).toBe(1);
});

test('Columbia email subjects and bare UNIs resolve to the same owner, including mid-sync refresh', async () => {
  subject = 'ABC1234@columbia.edu';
  const created = await create();
  const personCall = calls.find((call) => call.url.includes('/personrolestatuses'))!;
  expect(new URL(personCall.url).searchParams.get('filter[person__uni]')).toBe('abc1234');
  const original = globalThis.fetch;
  globalThis.fetch = mock(async (resource: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (String(resource).includes('/personrolestatuses') && headers.get('Authorization') === `Bearer ${input.accessToken}`) return new Response('', { status: 401 });
    if (String(resource).includes('/idp/userinfo.openid') && headers.get('Authorization') === 'Bearer synthetic-rotated-access') return Response.json({ sub: 'abc1234' });
    return original(resource, init);
  }) as unknown as typeof fetch;
  const refreshed = await worker.fetch(request(`/api/calendars/${created.id}/sync`, input, created.managementToken), env);
  expect(refreshed.status).toBe(200); expect(refreshCount).toBe(1);
  globalThis.fetch = original;
  subject = 'abc1234';
  expect((await worker.fetch(request(`/api/calendars/${created.id}/sync`, input, created.managementToken), env)).status).toBe(200);
});

test('userinfo subjects with unrelated domains are rejected before person lookup', async () => {
  subject = 'abc1234@attacker.example';
  expect((await worker.fetch(request(), env)).status).toBe(502);
  expect(calls.length).toBe(1); expect(stored()).toBe('[]');
});
