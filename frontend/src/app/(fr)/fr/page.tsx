import { LandingPage } from "@/components/landing/landing-page";
import { I18nProvider } from "@/i18n/provider";

/** `/fr/` — landing en français. */
export default function Page() {
  return (
    <I18nProvider locale="fr">
      <LandingPage />
    </I18nProvider>
  );
}
