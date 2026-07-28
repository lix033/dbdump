import "@/app/globals.css";
import { fontVariables } from "@/app/fonts";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { LOCALE_TAGS, type Locale } from "@/i18n/config";

/** Document HTML commun aux trois racines de l'export (`/`, `/fr/`, `/app/`).
 *
 *  Chaque langue a sa propre racine pour que `lang` soit correct **dans le HTML
 *  servi**, sans attendre l'hydratation : c'est ce que lisent les lecteurs
 *  d'écran, les moteurs de recherche et la césure du navigateur. */
export function SiteHtml({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <html
      lang={LOCALE_TAGS[locale]}
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
