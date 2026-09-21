import { expect, test } from 'bun:test';
import { readLocale, localizeWarning } from '../src/locale';
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
  expect(termLabel('20263', 'zh-CN')).toBe('2026 年秋季');
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
  const warning = 'TEST1001 (001)：教室待定，事件暂不含地点；请在 Vergil 更新后重新同步。';
  expect(localizeWarning(warning, 'en')).toBe('TEST1001 (001): Room pending; events have no location yet. Sync again after Vergil is updated.');
  expect(localizeWarning(warning, 'zh-CN')).toBe(warning);
  expect(localizeWarning('Unrecognized upstream note', 'en')).toBe('Unrecognized upstream note');
});
