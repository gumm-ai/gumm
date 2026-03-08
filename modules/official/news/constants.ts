export const GOOGLE_NEWS_RSS = 'https://news.google.com/rss';

// Default language → country mapping for Google News
export const LANG_TO_COUNTRY: Record<string, string> = {
  en: 'US',
  fr: 'FR',
  es: 'ES',
  de: 'DE',
  it: 'IT',
  pt: 'BR',
  nl: 'NL',
  ru: 'RU',
  ja: 'JP',
  zh: 'CN',
  ko: 'KR',
  ar: 'SA',
  pl: 'PL',
  sv: 'SE',
  no: 'NO',
  da: 'DK',
  fi: 'FI',
  tr: 'TR',
  hi: 'IN',
  he: 'IL',
  uk: 'UA',
  cs: 'CZ',
  ro: 'RO',
  hu: 'HU',
  el: 'GR',
  th: 'TH',
  vi: 'VN',
  id: 'ID',
  ms: 'MY',
};

// Country code → language fallback
export const COUNTRY_TO_LANG: Record<string, string> = Object.fromEntries(
  Object.entries(LANG_TO_COUNTRY).map(([lang, country]) => [country, lang]),
);

// Google News topic IDs for common categories
export const TOPIC_IDS: Record<string, string> = {
  world: 'WORLD',
  nation: 'NATION',
  business: 'BUSINESS',
  technology: 'TECHNOLOGY',
  science: 'SCIENCE',
  entertainment: 'ENTERTAINMENT',
  sports: 'SPORTS',
  health: 'HEALTH',
};
