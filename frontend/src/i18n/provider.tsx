"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { LOCALE_TAGS, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";
import {
  getLocaleSnapshot,
  getServerLocaleSnapshot,
  storeLocale,
  subscribeToLocale,
} from "./locale-store";

interface I18nValue {
  locale: Locale;
  /** Dictionnaire de la langue courante. */
  t: Dictionary;
  /** Change la langue (persistée pour les prochaines visites). */
  setLocale: (locale: Locale) => void;
  /** true quand la langue est imposée par l'URL (pages de la landing) : le
   *  sélecteur doit alors naviguer plutôt que basculer sur place. */
  fixed: boolean;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Fournit la langue à l'arbre React.
 *
 *  - `locale` fourni (landing `/` et `/fr/`) : la langue vient de l'URL, elle
 *    est déjà dans le HTML statique — rien à résoudre côté client.
 *  - `locale` omis (app `/app/`, chargée par Tauri) : la langue est résolue à
 *    l'exécution depuis le choix mémorisé, sinon les préférences du navigateur. */
export function I18nProvider({
  locale,
  children,
}: {
  locale?: Locale;
  children: React.ReactNode;
}) {
  const runtimeLocale = useSyncExternalStore(
    subscribeToLocale,
    getLocaleSnapshot,
    getServerLocaleSnapshot,
  );
  const active = locale ?? runtimeLocale;

  // Le HTML statique de `/app/` est généré en anglais : on remet `lang` à jour
  // quand la langue résolue diffère (lecteurs d'écran, césure, correcteurs).
  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[active];
  }, [active]);

  const value = useMemo<I18nValue>(
    () => ({
      locale: active,
      t: getDictionary(active),
      setLocale: storeLocale,
      fixed: locale !== undefined,
    }),
    [active, locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n doit être utilisé dans un <I18nProvider>.");
  return value;
}
