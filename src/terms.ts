import { i18n, type Locale } from './i18n';

export function currentTerm(date = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric' }).formatToParts(date).map(part => [part.type, part.value]));
  const month = Number(parts.month);
  return `${parts.year}${month <= 4 ? 1 : month <= 8 ? 2 : 3}`;
}

export function termOptions(selected?: string, date = new Date()): string[] {
  const year = Number(currentTerm(date).slice(0, 4));
  const terms = new Set(Array.from({ length: 5 }, (_, offset) => [1, 2, 3].map(season => `${year - 2 + offset}${season}`)).flat());
  if (selected && /^20\d{2}[123]$/.test(selected)) terms.add(selected);
  return [...terms].sort().reverse();
}

export function termLabel(term: string, locale: Locale): string {
  const season = Number(term.slice(-1)) - 1;
  const year = term.slice(0, 4);
  return i18n.t(`terms.${['spring', 'summer', 'fall'][season]}`, { lng: locale, year });
}
