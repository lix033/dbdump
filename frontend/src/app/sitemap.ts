import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES, landingPath } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";

/** Sitemap des deux versions de la landing, chacune déclarant l'autre en
 *  alternative linguistique. `/app/` en est absent : ce n'est pas une page
 *  publique. */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    LOCALES.map((locale) => [locale, `${SITE_URL}${landingPath(locale)}`]),
  );

  return LOCALES.map((locale) => ({
    url: `${SITE_URL}${landingPath(locale)}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: locale === DEFAULT_LOCALE ? 1 : 0.8,
    alternates: { languages },
  }));
}
