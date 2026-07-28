import { DEFAULT_LOCALE, type Locale } from "../config";
import { en, type Dictionary } from "./en";
import { fr } from "./fr";

/** Module volontairement neutre (ni serveur ni client) : la landing y accède au
 *  build pour ses métadonnées, l'app à l'exécution pour son interface. */
export const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export type { Dictionary };
