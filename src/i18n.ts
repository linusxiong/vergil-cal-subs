import { createInstance } from 'i18next';
import en from './locales/en.json';
import zh from './locales/zh-CN.json';

export type Locale = 'en' | 'zh-CN';

export function createI18n(locale: Locale = 'en') {
  const instance = createInstance();
  void instance.init({
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN'],
    resources: { en: { translation: en }, 'zh-CN': { translation: zh } },
    initAsync: false,
    interpolation: { escapeValue: false },
  });
  return instance;
}

// Never change this instance's language: server rendering always uses getFixedT.
export const i18n = createI18n();
