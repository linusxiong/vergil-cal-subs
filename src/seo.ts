import { i18n, type Locale } from './i18n';

export const noIndex = 'noindex, nofollow, noarchive';
export const isPublicPage = (path: string) => path === '/' || path === '/guide';
export const isManagementPage = (path: string) => /^\/manage\/[a-f0-9]{64}$/.test(path);
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const localeUrl = (origin: string, path: string, locale: Locale) => `${origin}${path}${locale === 'zh-CN' ? '?lang=zh-CN' : ''}`;

export function pageSeo(url: URL, publicOrigin = url.origin) {
  const locale: Locale = url.searchParams.get('lang') === 'zh-CN' ? 'zh-CN' : 'en';
  const t = i18n.getFixedT(locale);
  const publicPage = isPublicPage(url.pathname);
  const guide = url.pathname === '/guide';
  const title = t(!publicPage ? (isManagementPage(url.pathname) ? 'seo.meta.managementTitle' : 'seo.meta.notFoundTitle') : guide ? 'seo.meta.guideTitle' : 'seo.meta.homeTitle');
  const description = t(!publicPage ? 'seo.meta.privateDescription' : guide ? 'seo.meta.guideDescription' : 'seo.meta.homeDescription');
  return { locale, title, description, publicPage, canonical: publicPage ? localeUrl(publicOrigin, url.pathname, locale) : undefined, origin: publicOrigin, path: url.pathname };
}

export function seoHead(page: ReturnType<typeof pageSeo>) {
  const t = i18n.getFixedT(page.locale);
  const meta = (name: string, value: string, property = false) => `<meta data-seo ${property ? 'property' : 'name'}="${name}" content="${escape(value)}">`;
  let html = `<title data-seo>${escape(page.title)}</title>${meta('description', page.description)}${meta('robots', page.publicPage ? 'index, follow, max-image-preview:large' : noIndex)}${meta('app-origin', page.origin)}`;
  if (!page.publicPage) return html;
  html += `<link data-seo rel="canonical" href="${escape(page.canonical!)}">`;
  for (const language of ['en', 'zh-CN', 'x-default']) html += `<link data-seo rel="alternate" hreflang="${language}" href="${escape(localeUrl(page.origin, page.path, language === 'zh-CN' ? 'zh-CN' : 'en'))}">`;
  for (const [name, value] of Object.entries({ 'og:type': 'website', 'og:site_name': t('common.brand'), 'og:title': page.title, 'og:description': page.description, 'og:url': page.canonical!, 'og:locale': page.locale === 'en' ? 'en_US' : 'zh_CN', 'og:locale:alternate': page.locale === 'en' ? 'zh_CN' : 'en_US', 'og:image': `${page.origin}/og-image.png`, 'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': t('seo.meta.imageAlt') })) html += meta(name, value, true);
  for (const [name, value] of Object.entries({ 'twitter:card': 'summary_large_image', 'twitter:title': page.title, 'twitter:description': page.description, 'twitter:image': `${page.origin}/og-image.png`, 'twitter:image:alt': t('seo.meta.imageAlt') })) html += meta(name, value);
  const structured = { '@context': 'https://schema.org', '@type': 'WebApplication', name: t('common.brand'), url: localeUrl(page.origin, '/', page.locale), description: page.description, applicationCategory: 'EducationalApplication', operatingSystem: 'Any', browserRequirements: t('seo.meta.browserRequirements'), inLanguage: page.locale, image: `${page.origin}/og-image.png`, featureList: t('seo.meta.features', { returnObjects: true }), isAccessibleForFree: true };
  html += `<script data-seo type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>`;
  return html;
}

// Readable initial HTML for everyone, including browsers with JavaScript disabled.
// React replaces this public introduction with the interactive application.
export function publicContent(page: ReturnType<typeof pageSeo>) {
  const t = i18n.getFixedT(page.locale);
  const home = localeUrl('', '/', page.locale);
  const guide = localeUrl('', '/guide', page.locale);
  const link = (href: string, label: string) => `<a href="${escape(href)}">${escape(label)}</a>`;
  let content = `<h1 class="mb-6 text-3xl font-semibold">${escape(!page.publicPage ? (isManagementPage(page.path) ? t("manage.privateEyebrow") : t("errors.notFoundTitle", { lng: 'en' })) : page.path === '/guide' ? t("seo.content.guideTitle") : t("seo.content.homeTitle"))}</h1>`;
  if (!page.publicPage && !isManagementPage(page.path)) content += `<p>${link(home, t("common.home"))}</p>`;
  else if (!page.publicPage) content += `<p>${t("seo.content.privateDescription")}</p>`;
  else {
    content += `<p>${escape(page.description)}</p>`;
    const sections = page.path === '/guide' ? [
      [t("seo.content.credentialsTitle"), t("seo.content.signIn", { vergilLink: link('https://vergil.columbia.edu', t('common.vergil')) })],
      [t("seo.content.createTitle"), t("seo.content.createDescription")],
      [t("seo.content.subscribeTitle"), `<ul><li><strong>${t("guide.subscribe.appleLabel")}</strong> ${t("seo.content.apple")}</li><li><strong>${t("guide.subscribe.googleLabel")}</strong> ${t("seo.content.google")}</li><li><strong>${t("guide.subscribe.outlookLabel")}</strong> ${t("seo.content.outlook")}</li></ul>`],
      [t("seo.content.manageTitle"), t("seo.content.manageDescription")],
    ] : [
      [t("seo.content.introTitle"), t("seo.content.introDescription")],
      [t("seo.content.singleCalendarTitle"), t("seo.content.singleCalendarDescription")],
    ];
    sections.push([t("form.openExisting"), t("seo.content.lookupDescription")]);
    sections.push([t("seo.content.rotationTitle"), t("seo.content.rotationDescription")]);
    sections.push([t("seo.content.privacyTitle"), t("seo.content.privacyDescription")]);
    for (const [heading, body] of sections) content += `<section class="mt-8"><h2>${heading}</h2>${body.startsWith('<ul>') ? body : `<p>${body}</p>`}</section>`;
    content += `<p class="mt-8">${link(page.path === '/guide' ? home : guide, t(page.path === '/guide' ? 'seo.content.createLink' : 'seo.content.guideLink'))}</p><p>${t("seo.content.enableJavaScript")}</p>`;
  }
  return `<div class="mx-auto max-w-3xl px-5 py-10"><nav class="mb-8 flex gap-6" aria-label="${t("navigation.main")}">${link(home, t('common.brand'))} ${link(guide, t("navigation.guide"))} ${link(localeUrl('', page.path, page.locale === 'en' ? 'zh-CN' : 'en'), t('common.languageName', { lng: page.locale === 'en' ? 'zh-CN' : 'en' }))}</nav><main id="main" class="guide">${content}</main><footer class="mt-10 text-sm text-muted">${t("seo.content.footer")}</footer></div>`;
}

export function sitemap(origin: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${['/', '/guide'].flatMap(path => (['en', 'zh-CN'] as const).map(locale => `<url><loc>${escape(localeUrl(origin, path, locale))}</loc>${['en', 'zh-CN', 'x-default'].map(language => `<xhtml:link rel="alternate" hreflang="${language}" href="${escape(localeUrl(origin, path, language === 'zh-CN' ? 'zh-CN' : 'en'))}"/>`).join('')}</url>`)).join('')}</urlset>`;
}
