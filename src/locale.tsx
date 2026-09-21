import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { createI18n, i18n, type Locale } from './i18n';
import en from './locales/en.json';

export type { Locale } from './i18n';
const storageKey = 'vergil-calendar-language';

export function readLocale(): Locale {
  if (typeof window !== 'undefined') {
    const language = new URLSearchParams(window.location.search).get('lang');
    if (language === 'en' || language === 'zh-CN') return language;
  }
  try { return localStorage.getItem(storageKey) === 'zh-CN' ? 'zh-CN' : 'en'; }
  catch { return 'en'; }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [instance] = useState(() => createI18n(readLocale()));
  useEffect(() => {
    const persist = () => {
      document.documentElement.lang = instance.language;
      try { localStorage.setItem(storageKey, instance.language); } catch { /* Storage can be blocked. */ }
    };
    persist();
    instance.on('languageChanged', persist);
    return () => { instance.off('languageChanged', persist); };
  }, [instance]);
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

export function useLocale() {
  const { t, i18n: instance } = useTranslation(undefined, { useSuspense: false });
  const locale: Locale = instance.language === 'zh-CN' ? 'zh-CN' : 'en';
  const setLocale = useCallback((language: Locale) => { void instance.changeLanguage(language); }, [instance]);
  return { locale, setLocale, t };
}

// Legacy snapshots may contain translated diagnostics; course names stay verbatim.
// Diagnostics are always English, independently of the interface language.
export function localizeWarning(warning: string, _locale?: Locale): string {
  for (const [key, message] of Object.entries(en.legacyWarnings)) {
    if (key === 'separator') continue;
    const suffix = en.legacyWarnings.separator + message;
    if (warning.endsWith(suffix)) return i18n.t('warnings.withCourse', {
      lng: 'en', course: warning.slice(0, -suffix.length), message: i18n.t(`warnings.${key}`, { lng: 'en' }),
    });
  }
  return warning;
}
