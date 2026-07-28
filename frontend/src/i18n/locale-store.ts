import { DEFAULT_LOCALE, isLocale, matchLocale, type Locale } from "./config";

/** Langue choisie explicitement par l'utilisateur. Partagée par la landing et
 *  l'app : changer de langue sur le site la conserve dans l'app, et
 *  inversement. */
const STORAGE_KEY = "dbdump.locale";

const listeners = new Set<() => void>();

/** getSnapshot doit renvoyer une valeur *stable* tant que rien n'a changé, sinon
 *  useSyncExternalStore boucle. On mémorise donc la résolution. */
let cached: Locale | null = null;

function resolve(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* localStorage indisponible (mode privé strict) : on retombe sur le navigateur */
  }
  return matchLocale(navigator.languages ?? [navigator.language]);
}

function emit(): void {
  cached = null;
  for (const listener of listeners) listener();
}

/** Langue effective côté client : choix explicite, sinon préférences du
 *  navigateur, sinon anglais. */
export function getLocaleSnapshot(): Locale {
  if (cached === null) cached = resolve();
  return cached;
}

/** Instantané du rendu statique : l'export est généré en anglais, la langue
 *  réelle est appliquée juste après l'hydratation. */
export function getServerLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function subscribeToLocale(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** Une autre fenêtre a changé de langue : on s'aligne. */
function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === STORAGE_KEY) emit();
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* préférence non persistée : la session en cours reste correcte */
  }
  emit();
}
