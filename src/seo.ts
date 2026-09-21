import type { Locale } from './locale';

export const noIndex = 'noindex, nofollow, noarchive';
export const isPublicPage = (path: string) => path === '/' || path === '/guide';
export const isManagementPage = (path: string) => /^\/manage\/[a-f0-9]{64}$/.test(path);
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const localeUrl = (origin: string, path: string, locale: Locale) => `${origin}${path}${locale === 'zh-CN' ? '?lang=zh-CN' : ''}`;

export function pageSeo(url: URL, publicOrigin = url.origin) {
  const locale: Locale = url.searchParams.get('lang') === 'zh-CN' ? 'zh-CN' : 'en';
  const zh = locale === 'zh-CN';
  const publicPage = isPublicPage(url.pathname);
  const guide = url.pathname === '/guide';
  const title = !publicPage
    ? (isManagementPage(url.pathname) ? (zh ? '管理私密日历' : 'Manage private calendar') : (zh ? '页面不存在' : 'Page not found')) + ' | Vergil Calendar'
    : guide ? (zh ? 'Columbia 课程日历订阅指南 | Vergil Calendar' : 'Columbia Calendar Subscription Guide | Vergil Calendar')
      : (zh ? 'Columbia Vergil 课程日历订阅 | Vergil Calendar' : 'Columbia Vergil Course Calendar Subscription | Vergil Calendar');
  const description = !publicPage ? (zh ? '私密日历管理与订阅。' : 'Private calendar management and subscriptions.')
    : guide ? (zh ? '了解如何获取 Vergil Token，将 Columbia 课表订阅到 Apple、Google 或 Outlook 日历，并安全更新或撤销订阅。' : 'Learn how to get Vergil tokens, subscribe to your Columbia schedule in Apple, Google, or Outlook Calendar, and safely update or revoke your subscription.')
      : (zh ? '将 Columbia Vergil 课表转换为 Apple、Google 和 Outlook 日历可订阅的链接。按需更新课程，学校 Token 不会被保存。独立开源工具。' : 'Turn your Columbia Vergil course schedule into an Apple, Google, or Outlook calendar subscription. Update courses on demand; university tokens are never stored.');
  return { locale, title, description, publicPage, canonical: publicPage ? localeUrl(publicOrigin, url.pathname, locale) : undefined, origin: publicOrigin, path: url.pathname };
}

export function seoHead(page: ReturnType<typeof pageSeo>) {
  const meta = (name: string, value: string, property = false) => `<meta data-seo ${property ? 'property' : 'name'}="${name}" content="${escape(value)}">`;
  let html = `<title data-seo>${escape(page.title)}</title>${meta('description', page.description)}${meta('robots', page.publicPage ? 'index, follow, max-image-preview:large' : noIndex)}${meta('app-origin', page.origin)}`;
  if (!page.publicPage) return html;
  html += `<link data-seo rel="canonical" href="${escape(page.canonical!)}">`;
  for (const language of ['en', 'zh-CN', 'x-default']) html += `<link data-seo rel="alternate" hreflang="${language}" href="${escape(localeUrl(page.origin, page.path, language === 'zh-CN' ? 'zh-CN' : 'en'))}">`;
  for (const [name, value] of Object.entries({ 'og:type': 'website', 'og:site_name': 'Vergil Calendar', 'og:title': page.title, 'og:description': page.description, 'og:url': page.canonical!, 'og:locale': page.locale === 'en' ? 'en_US' : 'zh_CN', 'og:locale:alternate': page.locale === 'en' ? 'zh_CN' : 'en_US', 'og:image': `${page.origin}/og-image.png`, 'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': 'Vergil Calendar — Columbia course calendar subscriptions' })) html += meta(name, value, true);
  for (const [name, value] of Object.entries({ 'twitter:card': 'summary_large_image', 'twitter:title': page.title, 'twitter:description': page.description, 'twitter:image': `${page.origin}/og-image.png`, 'twitter:image:alt': 'Vergil Calendar — Columbia course calendar subscriptions' })) html += meta(name, value);
  const structured = { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Vergil Calendar', url: localeUrl(page.origin, '/', page.locale), description: page.description, applicationCategory: 'EducationalApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and a modern web browser.', inLanguage: page.locale, image: `${page.origin}/og-image.png`, featureList: ['Columbia Vergil course calendar subscriptions', 'Apple Calendar, Google Calendar, and Outlook support', 'Manual schedule updates without storing university tokens'], isAccessibleForFree: true };
  html += `<script data-seo type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>`;
  return html;
}

// Readable initial HTML for everyone, including browsers with JavaScript disabled.
// React replaces this public introduction with the interactive application.
export function publicContent(page: ReturnType<typeof pageSeo>) {
  const t = (en: string, zh: string) => page.locale === 'en' ? en : zh;
  const home = localeUrl('', '/', page.locale);
  const guide = localeUrl('', '/guide', page.locale);
  const link = (href: string, label: string) => `<a href="${escape(href)}">${escape(label)}</a>`;
  let content = `<h1 class="mb-6 text-3xl font-semibold">${escape(!page.publicPage ? (isManagementPage(page.path) ? t('Private calendar', '私密日历') : t('Page not found.', '这个页面不存在。')) : page.path === '/guide' ? t('Columbia course calendar subscription guide', 'Columbia 课程日历订阅指南') : t('Your Columbia courses, in your calendar.', '让 Columbia 课程，融入你的日历。'))}</h1>`;
  if (!page.publicPage && !isManagementPage(page.path)) content += `<p>${link(home, t('Back to home', '返回首页'))}</p>`;
  else if (!page.publicPage) content += `<p>${t('Open your complete private management link and enable JavaScript to manage your subscription.', '请打开完整的私密管理链接并启用 JavaScript，以管理日历订阅。')}</p>`;
  else {
    content += `<p>${escape(page.description)}</p>`;
    const sections = page.path === '/guide' ? [
      [t('1. Get your Vergil tokens', '1. 获取 Vergil Token'), `${t('Sign in to', '登录')} ${link('https://vergil.columbia.edu', 'Vergil')}${t(' with your university account and complete Duo verification. In browser developer tools, open Application → Local Storage → https://vergil.columbia.edu. Copy the complete access_token and refresh_token values without adding quotes. If absent, sign in again with the Network panel open and inspect the token.oauth2 response.', '，完成学校账号登录和 Duo 验证。在浏览器开发者工具中打开 Application → Local Storage → https://vergil.columbia.edu，复制 access_token 和 refresh_token 的完整值，不要添加引号。如果没有这两项，可打开 Network 后重新登录，查看 token.oauth2 响应。')}`],
      [t('2. Create your subscription', '2. 创建日历订阅'), t('Return to the create page, select a term, and enter both tokens. Add any holidays or canceled class dates under “Skip dates without classes,” one YYYY-MM-DD date per line. Create the subscription and save the private management link.', '回到创建页面，选择学期并填写两项 Token。如有假期或停课，在“跳过不上课的日期”中每行填写一个 YYYY-MM-DD 日期。创建订阅后，私密保存管理链接。')],
      [t('3. Add to your calendar app', '3. 添加到日历 App'), `<ul><li><strong>Apple Calendar:</strong> ${t('Use “Open in calendar app,” or File → New Calendar Subscription on Mac.', '使用“在日历 App 中打开”，或在 Mac 日历中选择“文件 → 新建日历订阅”。')}</li><li><strong>Google Calendar:</strong> ${t('On the website, choose Other calendars → + → From URL, and paste the HTTPS subscription link.', '在网页端选择“其他日历 → + → 通过网址”，粘贴 HTTPS 订阅链接。')}</li><li><strong>Outlook:</strong> ${t('Choose Add calendar → Subscribe from web, and paste the HTTPS subscription link.', '选择“添加日历 → 从 Web 订阅”，粘贴 HTTPS 订阅链接。')}</li></ul>`],
      [t('4. Update or revoke your calendar', '4. 更新或撤销日历'), t('After adding or dropping courses, open your private management link and submit fresh Vergil tokens. Your subscription URL stays the same. A failed update preserves the previous snapshot. To disable both links and delete the saved schedule, revoke the subscription on the management page.', '增退选后，打开私密管理链接，提交新的 Vergil Token。订阅地址保持不变；读取失败会保留原有快照。在管理页面撤销订阅可禁用链接并删除保存的课表。')],
    ] : [
      [t('From Vergil to Apple, Google, or Outlook', '从 Vergil 到 Apple、Google 或 Outlook 日历'), t('Sign in to Vergil, copy your access and refresh tokens, and select your term here. The service reads your registered course schedule and creates an ICS subscription link. Subscribe from URL in your calendar app to see class dates, times, and locations.', '登录 Vergil，复制 Access Token 和 Refresh Token，在这里选择学期。服务读取已注册课程，生成 ICS 日历订阅链接。在日历 App 中通过网址订阅，即可查看上课日期、时间和地点。')],
      [t('One subscription link, updated when you choose', '一个订阅链接，按需更新'), t('Keep your private management link. When your courses change, submit fresh tokens to update the saved schedule without changing the subscription URL. You can exclude holidays or canceled class dates and revoke the subscription when you no longer need it.', '请保存私密管理链接。课表变更后，重新提交 Token 来更新保存的课表，订阅地址保持不变。你可以排除假期或停课日期，并在不需要时撤销订阅。')],
    ];
    sections.push([t('Refresh timing and privacy', '刷新时间与隐私'), t('This service does not store your university tokens or sync courses in the background. Tokens pass through the server for each requested update, so use a deployment you trust. Your calendar app controls refresh timing; updates may not appear immediately. Anyone with the subscription link can read your schedule, and the private management link grants update and revocation access. Protect both links and your tokens.', '服务不保存学校 Token，也不会在后台同步课程。每次手动更新时 Token 会经过服务器，请仅使用可信部署。日历 App 决定刷新时间，更新可能不会立即显示。任何持有订阅链接的人都能查看课表，管理链接还可用于更新与撤销；请妥善保管链接和 Token。')]);
    for (const [heading, body] of sections) content += `<section class="mt-8"><h2>${heading}</h2>${body.startsWith('<ul>') ? body : `<p>${body}</p>`}</section>`;
    content += `<p class="mt-8">${link(page.path === '/guide' ? home : guide, t(page.path === '/guide' ? 'Create a subscription' : 'Read the full setup guide', page.path === '/guide' ? '创建订阅' : '阅读完整使用指南'))}</p><p>${t('Enable JavaScript to create or manage a subscription.', '创建或管理订阅需要启用 JavaScript。')}</p>`;
  }
  return `<div class="mx-auto max-w-3xl px-5 py-10"><nav class="mb-8 flex gap-6" aria-label="${t('Main navigation', '主导航')}">${link(home, 'Vergil Calendar')} ${link(guide, t('Guide', '使用指南'))} ${link(localeUrl('', page.path, page.locale === 'en' ? 'zh-CN' : 'en'), page.locale === 'en' ? '中文' : 'English')}</nav><main id="main" class="guide">${content}</main><footer class="mt-10 text-sm text-muted">${t('An independent open-source project. Not affiliated with Columbia University. Follow official university and instructor announcements for schedule changes.', '独立开源项目，与 Columbia University 无隶属关系。课程变更请以学校和授课教师通知为准。')}</footer></div>`;
}

export function sitemap(origin: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${['/', '/guide'].flatMap(path => (['en', 'zh-CN'] as const).map(locale => `<url><loc>${escape(localeUrl(origin, path, locale))}</loc>${['en', 'zh-CN', 'x-default'].map(language => `<xhtml:link rel="alternate" hreflang="${language}" href="${escape(localeUrl(origin, path, language === 'zh-CN' ? 'zh-CN' : 'en'))}"/>`).join('')}</url>`)).join('')}</urlset>`;
}
