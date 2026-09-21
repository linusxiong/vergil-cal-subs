import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readLocale, localizeWarning } from '../src/locale';
import { createI18n } from '../src/i18n';
import en from '../src/locales/en.json';
import zh from '../src/locales/zh-CN.json';
import { currentTerm, termLabel, termOptions } from '../src/terms';

test('term choices respect New York date boundaries and retain older saved terms', () => {
  expect(currentTerm(new Date('2026-05-01T03:59:00Z'))).toBe('20261');
  expect(currentTerm(new Date('2026-05-01T04:00:00Z'))).toBe('20262');
  expect(currentTerm(new Date('2026-09-01T04:00:00Z'))).toBe('20263');
  expect(currentTerm(new Date('2027-01-01T04:59:00Z'))).toBe('20263');
  const options = termOptions('20201', new Date('2026-09-21T12:00:00Z'));
  expect(options).toHaveLength(16);
  expect(options).toContain('20201');
  expect(options[0]).toBe('20283');
  expect(new Set(options).size).toBe(options.length);
  expect(termLabel('20263', 'en')).toBe('Fall 2026');
  expect(termLabel('20263', 'zh-CN')).toBe(zh.terms.fall.replace('{{year}}', '2026'));
});

test('language defaults to English and handles unavailable or invalid browser storage', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const [value, expected] of [[null, 'en'], ['zh-CN', 'zh-CN'], ['en', 'en'], ['fr', 'en']] as const) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => value } });
      expect(readLocale()).toBe(expected);
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
    expect(readLocale()).toBe('en');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('saved course warnings translate without changing course names or unknown messages', () => {
  const course = zh.courses.title;
  const warning = `${course}${en.legacyWarnings.separator}${en.legacyWarnings.roomPending}`;
  expect(localizeWarning(warning, 'en')).toBe(`${course}: ${en.warnings.roomPending}`);
  expect(localizeWarning(warning, 'zh-CN')).toBe(`${course}: ${en.warnings.roomPending}`);
  expect(localizeWarning('Unrecognized upstream note', 'en')).toBe('Unrecognized upstream note');
});


test('addressable language overrides the saved browser preference', () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const [search, saved, expected] of [['?lang=zh-CN', 'en', 'zh-CN'], ['?lang=en', 'zh-CN', 'en'], ['', 'zh-CN', 'zh-CN']] as const) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { search } } });
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => saved } });
      expect(readLocale()).toBe(expected);
    }
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else Reflect.deleteProperty(globalThis, 'window');
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});


test('resource translations use interpolation and plurals while errors stay English', () => {
  const instance = createI18n('en');
  expect(instance.t('courses.count', { count: 1 })).toBe('1 course');
  expect(instance.t('courses.count', { count: 2 })).toBe('2 courses');
  void instance.changeLanguage('zh-CN');
  expect(instance.t('courses.count', { count: 2 })).toBe(zh.courses.count_other.replace('{{count}}', '2'));
  expect(instance.t('home.title')).toBe(zh.home.title);
  expect(instance.t('errors.verification')).toBe(en.errors.verification);
  expect(instance.t('diagnostics.meetingsPending')).toBe(en.diagnostics.meetingsPending);
  expect(instance.t('common.copyLabel', { label: '<private>' })).toBe(zh.common.copyLabel.replace('{{label}}', '<private>'));
  expect(createI18n().language).toBe('en');
});


test('both locale resources have matching keys and every static UI key resolves', () => {
  const keys = (value: object, prefix = ''): string[] => Object.entries(value).flatMap(([key, item]) =>
    item && typeof item === 'object' && !Array.isArray(item) ? keys(item, `${prefix}${key}.`) : [`${prefix}${key}`]);
  expect(keys(zh).sort()).toEqual(keys(en).sort());
  expect(zh.errors).toEqual(en.errors);
  expect(zh.diagnostics).toEqual(en.diagnostics);
  expect(zh.warnings).toEqual(en.warnings);
  for (const locale of ['en', 'zh-CN'] as const) {
    const instance = createI18n(locale);
    for (const file of ['App.tsx', 'Guide.tsx', 'seo.ts', 'locale.tsx']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      for (const match of source.matchAll(/\bt\(['"]([^'"]+)['"]/g)) expect(instance.exists(match[1]!, { count: 2 })).toBe(true);
      for (const match of source.matchAll(/i18nKey="([^"]+)"/g)) expect(instance.exists(match[1]!)).toBe(true);
    }
  }
});
