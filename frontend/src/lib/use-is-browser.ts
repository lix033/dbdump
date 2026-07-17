import { useSyncExternalStore } from "react";
import { isTauri } from "./backend";

const subscribe = () => () => {};

/** true quand l'app tourne dans un navigateur (backend simulé), false sous Tauri.
 *  Via useSyncExternalStore : la valeur serveur est false, donc pas de décalage
 *  d'hydratation, et pas de setState dans un effet. */
export function useIsBrowser(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isTauri(),
    () => false,
  );
}

/** false au rendu serveur/prérendu, true une fois monté côté client. Utile pour
 *  n'afficher un état dépendant du client (thème résolu…) qu'après l'hydratation. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
