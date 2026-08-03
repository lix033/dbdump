import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";

/** Taille lisible, avec le séparateur décimal et l'unité de la langue courante
 *  (1.4 MB / 1,4 Mo). Monte jusqu'au téraoctet : un volume de sauvegarde se
 *  compte en To, l'afficher en Mo ne se lit pas. */
export function formatBytes(bytes: number, t: Dictionary, locale: Locale): string {
  const units = t.app.bytes;
  if (bytes < 1024) return `${formatNumber(bytes, locale)} ${units.b}`;
  if (bytes < 1024 ** 2) return `${formatNumber(bytes / 1024, locale, 1)} ${units.kb}`;
  if (bytes < 1024 ** 3) return `${formatNumber(bytes / 1024 ** 2, locale, 1)} ${units.mb}`;
  if (bytes < 1024 ** 4) return `${formatNumber(bytes / 1024 ** 3, locale, 1)} ${units.gb}`;
  return `${formatNumber(bytes / 1024 ** 4, locale, 2)} ${units.tb}`;
}

export function formatNumber(value: number, locale: Locale, fractionDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Date et heure d'une exécution : « 3 Aug, 02:00 » / « 3 août, 02:00 ». L'année
 *  n'apparaît que si elle diffère de l'année en cours — l'écran des
 *  programmations est presque toujours tourné vers les jours qui viennent. */
export function formatDateTime(value: string | Date, locale: Locale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Nom court d'un jour de semaine ISO (1 = lundi … 7 = dimanche). Passe par
 *  `Intl` : pas sept traductions à maintenir par langue ajoutée. */
export function formatWeekday(isoDay: number, locale: Locale): string {
  // 2024-01-01 était un lundi : les sept jours suivent.
  const reference = new Date(2024, 0, isoDay);
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(reference);
}

/** Durée en minutes rendue lisible : 90 → « 1 h 30 », 45 → « 45 min ». */
export function formatDuration(minutes: number, t: Dictionary, locale: Locale): string {
  const units = t.app.duration;
  if (minutes < 60) return `${formatNumber(minutes, locale)} ${units.minutes}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const head = `${formatNumber(hours, locale)} ${units.hours}`;
  return rest === 0 ? head : `${head} ${formatNumber(rest, locale)}`;
}
