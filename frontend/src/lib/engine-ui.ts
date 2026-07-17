import { Database, Server, HardDrive, Leaf, type LucideIcon } from "lucide-react";
import type { EngineId } from "./types";

/** Habillage visuel de chaque moteur : une icône distincte et une couleur douce.
 *  La couleur (chaîne oklch, pas une variable) sert au fond teinté par color-mix. */
export const ENGINE_UI: Record<EngineId, { icon: LucideIcon; color: string }> = {
  postgres: { icon: Database, color: "var(--engine-postgres)" },
  mysql: { icon: Server, color: "var(--engine-mysql)" },
  sqlite: { icon: HardDrive, color: "var(--engine-sqlite)" },
  mongodb: { icon: Leaf, color: "var(--engine-mongodb)" },
};

/** Fond teinté à ~14 % de la couleur du moteur, sur fond transparent. */
export function engineTint(color: string): React.CSSProperties {
  return {
    color,
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
  };
}
