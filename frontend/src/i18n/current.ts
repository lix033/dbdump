import type { Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";
import { getLocaleSnapshot } from "./locale-store";

/** Langue courante en dehors de React (backends, appels Tauri). Elle suit le
 *  même état que `useI18n()` : le choix mémorisé, sinon le navigateur. */
export function currentLocale(): Locale {
  return getLocaleSnapshot();
}

/** Dictionnaire courant pour du code non-React. Toujours relu à l'appel : un
 *  changement de langue s'applique aux messages suivants. */
export function currentDictionary(): Dictionary {
  return getDictionary(currentLocale());
}
