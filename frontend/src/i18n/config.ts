/** Langues servies par la plateforme. L'anglais est la langue principale : il
 *  occupe la racine du site et sert de repli partout ailleurs. */
export const LOCALES = ["en", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Nom de chaque langue, écrit dans cette langue (usage : sélecteur de langue). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

/** Étiquette courte affichée dans les boutons compacts. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
};

/** Balise BCP 47 complète, pour `<html lang>` et `hreflang`. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en",
  fr: "fr",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Chemin de la landing pour une langue. L'anglais est à la racine (pas de
 *  préfixe `/en`) : c'est la langue principale et la page indexée par défaut. */
export function landingPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}/`;
}

/** Meilleure langue supportée à partir des préférences du navigateur
 *  (`navigator.languages`), en ignorant la région : `fr-CA` → `fr`. */
export function matchLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
