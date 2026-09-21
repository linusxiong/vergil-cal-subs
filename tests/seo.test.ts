import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import worker, { type Env } from '../src/server';
import en from '../src/locales/en.json';
import zh from '../src/locales/zh-CN.json';
import { pageSeo, publicContent, seoHead, sitemap } from '../src/seo';

const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const env = {
  DB: { prepare() { throw new Error('Public pages must not read private calendar data'); } },
  ASSETS: { fetch: async (request: Request) => new URL(request.url).pathname === '/assets/app.js'
    ? new Response('export {}', { headers: { 'Content-Type': 'application/javascript' } })
    : new Response(shell, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"shell"' } }) },
} as unknown as Env;
const get = (path: string, options: Partial<Env> = {}) => worker.fetch(new Request(`https://fork.example${path}`), { ...env, ...options });

test('all public languages ship crawlable HTML, unique metadata and reciprocal alternatives without JavaScript', async () => {
  const titles = new Set<string>();
  for (const path of ['/', '/guide']) for (const language of ['en', 'zh-CN']) {
    const suffix = language === 'zh-CN' ? '?lang=zh-CN' : '';
    const response = await get(`${path}${suffix}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<html lang="${language}">`);
    expect(html).toContain('<h1');
    expect(html).toContain(language === 'en' ? en.seo.content.privacyTitle : zh.seo.content.privacyTitle);
    expect(html).toContain(`rel="canonical" href="https://fork.example${path}${suffix}"`);
    expect(html).toContain(`hreflang="en" href="https://fork.example${path}"`);
    expect(html).toContain(`hreflang="zh-CN" href="https://fork.example${path}?lang=zh-CN"`);
    expect(html).toContain('https://fork.example/og-image.png');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html.match(/<title\b/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).not.toContain('noindex');
    expect(response.headers.get('ETag')).toBeNull();
    titles.add(html.match(/<title[^>]*>([^<]+)<\/title>/)![1]!);
    const schema = JSON.parse(html.match(/type="application\/ld\+json">([^<]+)<\/script>/)![1]!);
    expect(schema['@type']).toBe('WebApplication');
    expect(schema.inLanguage).toBe(language);
    expect(schema.aggregateRating).toBeUndefined();
  }
  expect(titles.size).toBe(4);
});

test('canonical origin is portable, strips tracking, and allows an explicit deployment URL', async () => {
  const html = await (await get('/guide?lang=zh-CN&utm_source=example', { PUBLIC_APP_URL: 'https://vergilcal.xsy.app/' })).text();
  expect(html).toContain('rel="canonical" href="https://vergilcal.xsy.app/guide?lang=zh-CN"');
  expect(html).not.toContain('utm_source');
  expect(html).not.toContain('fork.example');
  expect(seoHead(pageSeo(new URL('https://fork.example/?lang=en')))).toContain('rel="canonical" href="https://fork.example/"');
});

test('sitemap lists only the two public pages in both languages and robots allows noindex discovery', async () => {
  const response = await get('/sitemap.xml');
  expect(response.headers.get('Content-Type')).toContain('application/xml');
  const xml = await response.text();
  expect(xml.match(/<loc>/g)).toHaveLength(4);
  expect(xml).toContain('https://fork.example/guide?lang=zh-CN');
  expect(xml).not.toMatch(/manage|calendar\/|api\/|lastmod/);
  expect(sitemap('https://custom.example')).toContain('https://custom.example/');
  expect(await (await get('/robots.txt')).text()).toBe('User-agent: *\nAllow: /\nSitemap: https://fork.example/sitemap.xml\n');
});

test('private management, API failures and unknown pages cannot be indexed or leak IDs in metadata', async () => {
  const id = 'a'.repeat(64);
  const response = await get(`/manage/${id}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const html = await response.text();
  const head = html.split('</head>')[0]!;
  expect(head).toContain('name="robots" content="noindex, nofollow, noarchive"');
  expect(head).not.toContain(id);
  expect(head).not.toMatch(/og:|twitter:|rel="canonical"|application\/ld\+json/);
  for (const path of ['/missing', '/manage/not-an-id', '/api/missing', '/calendar/missing.ics']) {
    const missing = await get(path);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('X-Robots-Tag')).toContain('noindex');
  }
  expect(await (await get('/missing')).text()).toContain('Page not found.');
});

test('head requests, real assets and permanent duplicate redirects retain their HTTP semantics', async () => {
  const response = await worker.fetch(new Request('https://fork.example/guide?lang=zh-CN', { method: 'HEAD' }), env);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('');
  const asset = await get('/assets/app.js');
  expect(asset.headers.get('Content-Type')).toBe('application/javascript');
  expect(await asset.text()).toBe('export {}');
  for (const [path, target] of [['/index.html?lang=zh-CN', '/?lang=zh-CN'], ['/guide/', '/guide']]) {
    const redirect = await get(path!);
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get('Location')).toBe(target!);
  }
});


test('HTML shell fetches ignore client validators so metadata cannot turn into an empty 304', async () => {
  const assets = { fetch: async (request: Request) => {
    expect(new URL(request.url).pathname).toBe('/');
    expect(request.headers.get('If-None-Match')).toBeNull();
    expect(request.headers.get('If-Modified-Since')).toBeNull();
    return new Response(shell, { headers: { 'Content-Type': 'text/html', ETag: '"shell"', 'Last-Modified': 'Mon, 21 Sep 2026 00:00:00 GMT' } });
  } } as unknown as Fetcher;
  const response = await worker.fetch(new Request('https://fork.example/guide', { headers: { 'If-None-Match': '"shell"', 'If-Modified-Since': 'Mon, 21 Sep 2026 00:00:00 GMT' } }), { ...env, ASSETS: assets });
  expect(response.status).toBe(200);
  expect(response.headers.get('Last-Modified')).toBeNull();
  expect(await response.text()).toContain('Columbia course calendar subscription guide');
});


test('SSR metadata and page content remain isolated across interleaved request languages', async () => {
  const english = pageSeo(new URL('https://fork.example/guide'));
  const chinese = pageSeo(new URL('https://fork.example/guide?lang=zh-CN'));
  expect(seoHead(english)).toContain(en.seo.meta.guideTitle);
  expect(seoHead(chinese)).toContain(zh.seo.meta.guideTitle);
  expect(publicContent(english)).toContain(en.seo.content.guideTitle);
  expect(publicContent(chinese)).toContain(zh.seo.content.guideTitle);
  const responses = await Promise.all(['zh-CN', 'en', 'zh-CN', 'en'].map(async lang => {
    const response = await get(`/guide?lang=${lang}`);
    return { lang, html: await response.text() };
  }));
  for (const { lang, html } of responses) expect(html).toContain(lang === 'en' ? en.seo.meta.guideTitle : zh.seo.meta.guideTitle);
  expect(publicContent(english)).not.toContain(zh.seo.content.guideTitle);
});
