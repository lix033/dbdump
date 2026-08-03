"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Database, FolderOpen } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Logo } from "@/components/logo";

/** Connexions factices de l'aperçu : de quoi montrer la liste multi-moteurs
 *  sans dépendre d'un vrai backend. */
const CONNECTIONS = [
  { name: "app_prod", engine: "PostgreSQL", color: "var(--engine-postgres)" },
  { name: "shop", engine: "MySQL", color: "var(--engine-mysql)" },
  { name: "analytics", engine: "MongoDB", color: "var(--engine-mongodb)" },
  { name: "local.db", engine: "SQLite", color: "var(--engine-sqlite)" },
];

const LINE_MS = 620;
/** Pause sur l'état « terminé » avant de rejouer la séquence. */
const HOLD_MS = 2600;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Abonnement au média `prefers-reduced-motion` via useSyncExternalStore : pas de
 *  setState dans un effet, et un snapshot serveur stable (`false`). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/** Fenêtre DBDump simulée : montre en quelques secondes ce que fait l'app, sans
 *  capture d'écran à maintenir. Rendue inerte (journal complet, aucune boucle)
 *  si l'utilisateur préfère réduire les animations. */
export function AppPreview() {
  const { t } = useI18n();
  // Le journal rejoué en boucle. Volontairement identique au vocabulaire réel de
  // l'app : ce que le visiteur voit ici, il le reverra à l'écran.
  const log = t.landing.preview.log;
  const reduced = usePrefersReducedMotion();
  // Nombre de lignes affichées. Démarre à 0 côté serveur pour un rendu stable.
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    // Chaîne de timeouts plutôt qu'un interval : la pause finale (HOLD_MS) n'a pas
    // la même durée qu'un pas de journal.
    const schedule = (n: number, delay: number) => {
      timer = setTimeout(() => {
        setShown(n);
        const last = n >= log.length;
        schedule(last ? 0 : n + 1, last ? HOLD_MS : LINE_MS);
      }, delay);
    };
    schedule(1, 400);
    return () => clearTimeout(timer);
  }, [reduced, log.length]);

  // En « reduced motion », le journal est affiché en entier, figé sur son état final.
  const count = reduced ? log.length : shown;
  const done = count >= log.length;
  const visible = log.slice(0, count);

  return (
    <div className="bg-card shadow-soft-lg overflow-hidden rounded-2xl border text-left">
      {/* Barre de titre façon macOS */}
      <div className="bg-sidebar flex items-center gap-2 border-b px-4 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[oklch(0.72_0.16_25)]" />
          <span className="size-2.5 rounded-full bg-[oklch(0.82_0.14_85)]" />
          <span className="size-2.5 rounded-full bg-[oklch(0.75_0.15_150)]" />
        </span>
        <span className="text-muted-foreground mx-auto inline-flex items-center gap-1.5 text-xs font-medium">
          <Logo className="size-3.5" />
          {t.common.appName}
        </span>
      </div>

      <div className="grid sm:grid-cols-[minmax(0,11rem)_1fr]">
        {/* Rail des connexions */}
        <div className="bg-sidebar/60 hidden flex-col gap-1 border-r p-3 sm:flex">
          <div className="text-muted-foreground px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase">
            {t.landing.preview.connections}
          </div>
          {CONNECTIONS.map((c, i) => (
            <div
              key={c.name}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                i === 0 ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
              }`}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="truncate">{c.name}</span>
            </div>
          ))}
        </div>

        {/* Panneau de dump */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "color-mix(in oklab, var(--engine-postgres) 18%, transparent)" }}
            >
              <Database className="size-4" style={{ color: "var(--engine-postgres)" }} />
            </span>
            <div className="min-w-0">
              <div className="font-heading truncate text-sm font-semibold">app_prod</div>
              <div className="text-muted-foreground truncate text-[11px]">
                PostgreSQL · localhost:5432
              </div>
            </div>
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                done ? "bg-success/15 text-success" : "bg-primary/12 text-primary"
              }`}
            >
              {done ? (
                <>
                  <Check className="size-3" /> {t.landing.preview.done}
                </>
              ) : (
                <>
                  <span className="relative flex size-1.5">
                    <span className="bg-primary animate-ping-soft absolute inset-0 rounded-full" />
                    <span className="bg-primary relative size-1.5 rounded-full" />
                  </span>
                  {t.landing.preview.running}
                </>
              )}
            </span>
          </div>

          {/* Journal */}
          {/* Hauteur figée sur la séquence complète (7 lignes × 1.25rem + padding) :
              la fenêtre ne se redimensionne pas à chaque ligne ajoutée. */}
          <div className="bg-muted/50 mt-4 h-[10.5rem] overflow-hidden rounded-xl border p-3 font-mono text-[11px] leading-5">
            {visible.map((line, i) => {
              const last = i === visible.length - 1;
              const success = done && last;
              return (
                <div
                  key={line}
                  className={success ? "text-success" : "text-muted-foreground"}
                >
                  <span className="text-primary/60 mr-1.5 select-none">›</span>
                  {line}
                  {last && !done && (
                    <span className="bg-primary animate-caret ml-1 inline-block h-3 w-1.5 align-middle" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Progression */}
          <div className="bg-muted relative mt-3 h-1.5 overflow-hidden rounded-full">
            {done ? (
              <div className="bg-success h-full w-full rounded-full" />
            ) : (
              <div className="bg-primary animate-indeterminate rounded-full" />
            )}
          </div>

          <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[11px]">
            <FolderOpen className="size-3.5 shrink-0" />
            <span className="truncate">{t.landing.preview.destination}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
