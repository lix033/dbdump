import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { DEFAULT_LOCALE, LOCALES, landingPath, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

/** Locales OpenGraph (`language_TERRITORY`) attendues par les réseaux sociaux. */
const OG_LOCALES: Record<Locale, string> = {
  en: "en_US",
  fr: "fr_FR",
};

/** Alternates `hreflang` de la landing : chaque version pointe vers toutes les
 *  autres, et `x-default` désigne l'anglais (langue principale, à la racine). */
const LANGUAGE_ALTERNATES: Record<string, string> = {
  ...Object.fromEntries(LOCALES.map((locale) => [locale, landingPath(locale)])),
  "x-default": landingPath(DEFAULT_LOCALE),
};

/** Métadonnées d'une page de la landing, dans sa langue. */
export function landingMetadata(locale: Locale): Metadata {
  const t = getDictionary(locale);
  const path = landingPath(locale);

  return {
    metadataBase: new URL(SITE_URL),
    title: t.meta.title,
    description: t.meta.description,
    alternates: {
      canonical: path,
      languages: LANGUAGE_ALTERNATES,
    },
    openGraph: {
      type: "website",
      siteName: t.common.appName,
      title: t.meta.title,
      description: t.meta.description,
      url: path,
      locale: OG_LOCALES[locale],
      alternateLocale: LOCALES.filter((other) => other !== locale).map(
        (other) => OG_LOCALES[other],
      ),
    },
  };
}
