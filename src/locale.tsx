import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Locale = 'en' | 'zh-CN';
const storageKey = 'vergil-calendar-language';
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({ locale: 'en', setLocale: () => {} });

export function readLocale(): Locale {
  if (typeof window !== 'undefined') {
    const language = new URLSearchParams(window.location.search).get('lang');
    if (language === 'en' || language === 'zh-CN') return language;
  }
  try { return localStorage.getItem(storageKey) === 'zh-CN' ? 'zh-CN' : 'en'; }
  catch { return 'en'; }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(readLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    try { localStorage.setItem(storageKey, locale); } catch { /* The page still works when storage is blocked. */ }
  }, [locale]);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  return { ...context, t: (english: string, chinese: string) => context.locale === 'en' ? english : chinese };
}

// Existing saved snapshots contain these Chinese warnings. Translate at display time
// so changing languages never rewrites a calendar or requires school credentials.
const warningMessages = [
  ['上课安排待定，暂未生成事件；请在 Vergil 更新后重新同步。', 'Schedule pending; no events generated. Sync again after Vergil is updated.'],
  ['没有上课安排，暂未生成事件；请核对 Vergil。', 'No meeting schedule; no events generated. Please check Vergil.'],
  ['上课日期或时间待定，已跳过该安排；请在 Vergil 更新后重新同步。', 'Meeting dates or times are pending; this meeting was skipped. Sync again after Vergil is updated.'],
  ['上课时间待定，已跳过该安排；请在 Vergil 更新后重新同步。', 'Meeting times are pending; this meeting was skipped. Sync again after Vergil is updated.'],
  ['教室待定，事件暂不含地点；请在 Vergil 更新后重新同步。', 'Room pending; events have no location yet. Sync again after Vergil is updated.'],
  ['部分上课时间待定，已跳过该安排；请在 Vergil 更新后重新同步。', 'Some meeting times are pending; those meetings were skipped. Sync again after Vergil is updated.'],
] as const;

export function localizeWarning(warning: string, locale: Locale): string {
  if (locale === 'en') {
    for (const [chinese, english] of warningMessages) {
      const suffix = `：${chinese}`;
      if (warning.endsWith(suffix)) return `${warning.slice(0, -suffix.length)}: ${english}`;
    }
  }
  return warning;
}
