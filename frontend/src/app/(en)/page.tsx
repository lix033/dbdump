import { LandingPage } from "@/components/landing/landing-page";
import { I18nProvider } from "@/i18n/provider";

/** `/` — landing en anglais. La langue vient de la route : elle est déjà dans le
 *  HTML statique, et le sélecteur de langue navigue vers `/fr/`. */
export default function Page() {
  return (
    <I18nProvider locale="en">
      <LandingPage />
    </I18nProvider>
  );
}
