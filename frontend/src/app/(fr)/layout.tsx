import type { Metadata } from "next";
import { SiteHtml } from "@/components/site-html";
import { landingMetadata } from "@/i18n/metadata";

/** Racine française : `<html lang="fr">` dès le HTML servi, pas après coup. */
export const metadata: Metadata = landingMetadata("fr");

export default function FrenchLayout({ children }: { children: React.ReactNode }) {
  return <SiteHtml locale="fr">{children}</SiteHtml>;
}
