import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";

/** Taille de fichier lisible, avec le séparateur décimal et l'unité de la langue
 *  courante (1.4 MB / 1,4 Mo). */
export function formatBytes(bytes: number, t: Dictionary, locale: Locale): string {
  const units = t.app.bytes;
  if (bytes < 1024) return `${formatNumber(bytes, locale)} ${units.b}`;
  if (bytes < 1024 ** 2) return `${formatNumber(bytes / 1024, locale, 1)} ${units.kb}`;
  return `${formatNumber(bytes / 1024 ** 2, locale, 1)} ${units.mb}`;
}

export function formatNumber(value: number, locale: Locale, fractionDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
