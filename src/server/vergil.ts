import type { CalendarLookupRequest, SyncRequest } from '../shared';

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const invalidUpstream = () => new ApiFailure(502, 'UPSTREAM_DATA', 'Columbia returned an unsupported or incomplete response. The saved calendar was not changed.');
const OAUTH = 'https://oauth.cc.columbia.edu';
const PERSONS = 'https://prod2-sas-persons.api.columbia.edu';
const RECORDS = 'https://prod2-sas-studentrecords.api.columbia.edu';
type ObjectValue = Record<string, any>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidUpstream();
  return value as ObjectValue;
}
function identityUni(value: unknown): string {
  if (typeof value !== 'string') throw invalidUpstream();
  const match = /^([a-z][a-z0-9]{1,31})(?:@columbia\.edu)?$/i.exec(value);
  if (!match) throw invalidUpstream();
  return match[1]!.toLowerCase();
}
function identifier(value: unknown): string {
  if (!/^[1-9]\d{0,19}$/.test(String(value))) throw invalidUpstream();
  return String(value);
}

// A request-scoped session; no token is returned or persisted.
export async function authenticateColumbia(input: CalendarLookupRequest) {
  let accessToken = input.accessToken;
  let refreshed = false;
  let authenticatedSubject: string | undefined;
  const deadline = Date.now() + 90_000;
  async function fetchJson(url: string, init: RequestInit = {}): Promise<{ status: number; value?: ObjectValue }> {
    if (Date.now() >= deadline) throw new ApiFailure(504, 'UPSTREAM_TIMEOUT', 'Columbia took too long to respond. Try again.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(15_000, deadline - Date.now()));
    try {
      // workerd supports manual/follow only; reject 3xx below without forwarding credentials.
      const response = await fetch(url, { ...init, redirect: 'manual', cache: 'no-store', signal: controller.signal });
      if (!response.ok) { await response.body?.cancel(); return { status: response.status }; }
      // Bound upstream payloads as well as the incoming credentials request.
      const reader = response.body?.getReader();
      if (!reader) throw invalidUpstream();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); throw invalidUpstream(); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { status: response.status, value: object(JSON.parse(new TextDecoder().decode(bytes))) };
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (controller.signal.aborted) throw new ApiFailure(504, 'UPSTREAM_TIMEOUT', 'Columbia took too long to respond. Try again.');
      throw new ApiFailure(502, 'UPSTREAM_UNAVAILABLE', `Could not read Columbia data at ${new URL(url).pathname} (${error instanceof SyntaxError ? 'invalid JSON' : 'network error'}). The saved calendar was not changed.`);
    } finally { clearTimeout(timer); }
  }
  async function get(url: string): Promise<ObjectValue> {
    // Columbia's JSON:API endpoints return 406 for application/json alone.
    const accept = new URL(url).origin === OAUTH ? 'application/json' : 'application/vnd.api+json, application/json';
    let response = await fetchJson(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: accept } });
    if (response.status === 401 && !refreshed && input.refreshToken) {
      refreshed = true;
      const token = await fetchJson(`${OAUTH}/as/token.oauth2`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: 'sis_oauth_client', refresh_token: input.refreshToken }).toString(),
      });
      const next = token.value?.access_token;
      if (token.status !== 200 || typeof next !== 'string' || !next.length || next.length > 16_384 || /\s/.test(next)) {
        throw new ApiFailure(401, 'COLUMBIA_AUTH', 'Columbia rejected these credentials. Paste a fresh Access Token. Refresh Token is optional.');
      }
      accessToken = next;
      if (authenticatedSubject) {
        const refreshedIdentity = await fetchJson(`${OAUTH}/idp/userinfo.openid`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
        if (!refreshedIdentity.value || identityUni(refreshedIdentity.value.sub) !== authenticatedSubject) {
          throw new ApiFailure(401, 'COLUMBIA_AUTH', 'The Access Token and Refresh Token must belong to the same Columbia account.');
        }
      }
      response = await fetchJson(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: accept } });
    }
    if (response.status === 401 || response.status === 403) throw new ApiFailure(401, 'COLUMBIA_AUTH', 'Columbia rejected these credentials. Paste a fresh Access Token. Refresh Token is optional.');
    if (!response.value) throw new ApiFailure(502, 'UPSTREAM_UNAVAILABLE', `Columbia returned HTTP ${response.status} at ${new URL(url).pathname}. The saved calendar was not changed.`);
    return response.value;
  }
  const identity = await get(`${OAUTH}/idp/userinfo.openid`);
  const uni = identityUni(identity.sub);
  authenticatedSubject = uni;
  const subjectHash = await sha256(uni);
  return { uni, subjectHash, get, get refreshed() { return refreshed; } };
}

export async function verifyColumbiaIdentity(input: CalendarLookupRequest) {
  const session = await authenticateColumbia(input);
  return { subjectHash: session.subjectHash, refreshed: session.refreshed };
}

export async function fetchRegisteredCourses(input: SyncRequest, expectedSubjectHash?: string, authenticated?: Awaited<ReturnType<typeof authenticateColumbia>>) {
  const session = authenticated ?? await authenticateColumbia(input);
  const { get, uni, subjectHash } = session;
  if (expectedSubjectHash && subjectHash !== expectedSubjectHash) throw new ApiFailure(403, 'OWNER_MISMATCH', 'Use the Columbia account that created this calendar.');
  // Only page parameters may change; pagination cannot move credentials to another host/path or student.
  async function pages(url: URL, read: (page: ObjectValue) => number): Promise<void> {
    const initial = new URL(url);
    const seen = new Set<string>();
    let count = 0;
    for (let index = 0; index < 20; index++) {
      if (seen.has(url.href)) throw invalidUpstream();
      seen.add(url.href);
      const page = await get(url.href);
      count += read(page);
      if (count > 6_000) throw invalidUpstream();
      const next = page.links?.next;
      const totalPages = page.meta?.pagination?.pages;
      const totalCount = page.meta?.pagination?.count;
      if ((totalPages !== undefined && (!Number.isInteger(totalPages) || totalPages < 0 || totalPages > 20)) ||
          (totalCount !== undefined && (!Number.isInteger(totalCount) || totalCount < 0 || totalCount > 6_000))) throw invalidUpstream();
      if (!next) {
        if (typeof totalPages === 'number' && totalPages > index + 1) {
          url = new URL(initial); url.searchParams.set('page[number]', String(index + 2)); continue;
        }
        if (typeof totalCount === 'number' && totalCount > count) throw invalidUpstream();
        return;
      }
      const href = typeof next === 'string' ? next : next?.href;
      if (typeof href !== 'string') throw invalidUpstream();
      const candidate = new URL(href, url);
      if (candidate.origin !== initial.origin || candidate.pathname !== initial.pathname || candidate.username || candidate.password || candidate.hash) throw invalidUpstream();
      for (const [key, value] of initial.searchParams) {
        if (!/^page\[(number|offset|cursor)\]$/.test(key) && candidate.searchParams.get(key) !== value) throw invalidUpstream();
      }
      for (const key of candidate.searchParams.keys()) {
        if (!initial.searchParams.has(key) && !/^page\[(number|offset|cursor)\]$/.test(key)) throw invalidUpstream();
      }
      url = candidate;
    }
    throw invalidUpstream();
  }
  const personUrl = new URL('/v1/personrolestatuses', PERSONS);
  personUrl.search = new URLSearchParams({ include: 'person', 'filter[person__uni]': uni, 'filter[person__is_active]': 'True', 'page[size]': '1' }).toString();
  const personPage = await get(personUrl.href);
  if (!Array.isArray(personPage.data) || personPage.data.length !== 1) throw invalidUpstream();
  const personRef = object(object(personPage.data[0]).relationships?.person?.data);
  const personId = identifier(personRef.id);
  if (personPage.included !== undefined) {
    if (!Array.isArray(personPage.included)) throw invalidUpstream();
    const person = personPage.included.find((entry: ObjectValue) => String(entry.id) === personId && entry.type === personRef.type);
    if (!person || typeof person.attributes?.uni !== 'string' || person.attributes.uni.toLowerCase() !== uni || person.attributes.is_active === false) throw invalidUpstream();
  }
  const registrations = new URL('/v1/studentclasses', RECORDS);
  registrations.search = new URLSearchParams({ 'page[size]': '300', include: 'term', 'filter[student_pk]': personId }).toString();
  const registeredIds = new Set<string>();
  await pages(registrations, (page) => {
    if (!Array.isArray(page.data) || !Array.isArray(page.included ?? [])) throw invalidUpstream();
    const terms = new Map<string, string>();
    for (const term of page.included ?? []) {
      if (term.attributes?.term_code !== undefined) terms.set(`${term.type}:${term.id}`, String(term.attributes.term_code));
    }
    for (const record of page.data) {
      const attrs = object(object(record).attributes);
      if (String(attrs.student_pk) !== personId) throw invalidUpstream();
      const term = object(record.relationships?.term?.data);
      const code = terms.get(`${term.type}:${term.id}`);
      if (!/^[123]$/.test(code ?? '') || !/^\d{4}$/.test(String(attrs.year))) throw invalidUpstream();
      if (`${attrs.year}${code}` === input.term && attrs.for_deletion !== true) registeredIds.add(identifier(attrs.class_id));
    }
    return page.data.length;
  });
  if (registeredIds.size > 500) throw invalidUpstream();
  const rawCourses: unknown[] = [];
  // Batches bound URL length and stay below the documented 500-class response limit.
  const ids = [...registeredIds];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const search = new URL('/v1/course_and_class_search', RECORDS);
    search.search = new URLSearchParams({ term: input.term, 'page[size]': '500', 'page[classes.size]': '500', schedule: 'true', 'class.id__in': ids.slice(offset, offset + 100).join(',') }).toString();
    let received = 0;
    await pages(search, (page) => {
      if (!Array.isArray(page.data?.courses)) throw invalidUpstream();
      rawCourses.push(...page.data.courses);
      received += page.data.courses.length;
      if (!page.links?.next && Number(page.data.total_count ?? received) > received) throw invalidUpstream();
      return page.data.courses.length;
    });
  }
  return { rawCourses, registeredIds, subjectHash, refreshed: session.refreshed };
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
