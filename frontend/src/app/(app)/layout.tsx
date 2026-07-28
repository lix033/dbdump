import type { Metadata } from "next";
import { SiteHtml } from "@/components/site-html";
import { I18nProvider } from "@/i18n/provider";
import { DEFAULT_LOCALE } from "@/i18n/config";

/** Racine de l'UI embarquée par le desktop. Elle n'a pas d'URL publique (nginx
 *  la masque) : pas de langue dans le chemin, pas d'indexation. */
export const metadata: Metadata = {
  title: "DBDump",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteHtml locale={DEFAULT_LOCALE}>
      {/* Sans `locale` : la langue est résolue à l'exécution (choix mémorisé,
          sinon préférences du système), puisqu'un seul HTML est embarqué. */}
      <I18nProvider>{children}</I18nProvider>
    </SiteHtml>
  );
}
