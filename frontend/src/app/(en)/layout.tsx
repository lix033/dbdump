import type { Metadata } from "next";
import { SiteHtml } from "@/components/site-html";
import { landingMetadata } from "@/i18n/metadata";

/** Racine anglaise : la langue principale occupe `/`, sans préfixe de langue. */
export const metadata: Metadata = landingMetadata("en");

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <SiteHtml locale="en">{children}</SiteHtml>;
}
