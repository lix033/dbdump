import { MockBackend } from "./mock";
import { TauriBackend } from "./tauri";
import type { Backend } from "./types";

export type { Backend } from "./types";

let instance: Backend | null = null;

/** Tauri injecte `__TAURI_INTERNALS__` dans la webview : sa présence distingue
 *  le desktop du navigateur de développement. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Renvoie le backend adapté à l'environnement : les vraies commandes système
 *  dans l'app desktop, le mock quand on ouvre le frontend dans un navigateur. */
export function getBackend(): Backend {
  if (instance) return instance;
  instance = isTauri() ? new TauriBackend() : new MockBackend();
  return instance;
}
