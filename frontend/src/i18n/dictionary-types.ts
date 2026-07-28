import type { DumpFormat, EngineId } from "@/lib/types";

/** Blocs de contenu identifiés par une clé stable : le dictionnaire porte le
 *  texte, le composant porte l'icône et l'ordre d'affichage. Une traduction ne
 *  peut donc ni perdre ni réordonner un bloc sans que TypeScript le signale. */
export type FeatureId = "local" | "tools" | "pgdump" | "passwords" | "options" | "progress";

export type StepId = "install" | "connect" | "folder" | "run";

export type FaqId = "tools" | "privacy" | "engines" | "warning";

/** Plateformes proposées au téléchargement (une carte par entrée). */
export type OsKey = "mac-arm" | "mac-intel" | "windows" | "linux";

export interface FormatText {
  label: string;
  hint: string;
}

/** Libellés des formats de dump : tous les moteurs n'exposent pas tous les
 *  formats, d'où le `Partial`. */
export type FormatTexts = Record<EngineId, Partial<Record<DumpFormat, FormatText>>>;

export type InstallHints = Record<EngineId, string>;
