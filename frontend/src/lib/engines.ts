import type { DumpFormat, EngineId } from "./types";

export interface FormatOption {
  value: DumpFormat;
  label: string;
  /** Extension appliquée au nom de fichier proposé. */
  extension: string;
  hint: string;
}

export interface EngineSpec {
  id: EngineId;
  label: string;
  /** Binaire qui produit le dump. */
  dumpBinary: string;
  /** Binaire qui restaure, affiché dans l'aide. */
  restoreBinary: string;
  defaultPort: number;
  /** SQLite ne se connecte pas par le réseau : on demande un fichier. */
  fileBased: boolean;
  formats: FormatOption[];
  installHint: string;
}

export const ENGINES: Record<EngineId, EngineSpec> = {
  postgres: {
    id: "postgres",
    label: "PostgreSQL",
    dumpBinary: "pg_dump",
    restoreBinary: "pg_restore",
    defaultPort: 5432,
    fileBased: false,
    // Note : en production, ce conseil est remplacé par celui du backend, adapté
    // à l'OS (voir desktop/src/engines.rs). Valeur de repli pour le mode mock.
    installHint: "Installez les outils PostgreSQL (client) pour votre système.",
    formats: [
      {
        value: "custom",
        label: "Custom (.dump)",
        extension: ".dump",
        hint: "Compressé, restauration sélective avec pg_restore. Recommandé.",
      },
      {
        value: "plain",
        label: "SQL brut (.sql)",
        extension: ".sql",
        hint: "Lisible et éditable, restauration avec psql.",
      },
      {
        value: "directory",
        label: "Répertoire",
        extension: "",
        hint: "Un fichier par table, seul format supportant le dump parallèle.",
      },
    ],
  },
  mysql: {
    id: "mysql",
    label: "MySQL / MariaDB",
    dumpBinary: "mysqldump",
    restoreBinary: "mysql",
    defaultPort: 3306,
    fileBased: false,
    installHint: "Installez les outils client MySQL/MariaDB pour votre système.",
    formats: [
      {
        value: "plain",
        label: "SQL brut (.sql)",
        extension: ".sql",
        hint: "Le seul format produit par mysqldump.",
      },
    ],
  },
  sqlite: {
    id: "sqlite",
    label: "SQLite",
    dumpBinary: "sqlite3",
    restoreBinary: "sqlite3",
    defaultPort: 0,
    fileBased: true,
    installHint: "Généralement fourni par le système (sqlite3).",
    formats: [
      {
        value: "plain",
        label: "SQL brut (.sql)",
        extension: ".sql",
        hint: "Export texte via .dump.",
      },
      {
        value: "archive",
        label: "Copie du fichier (.db)",
        extension: ".db",
        hint: "Copie cohérente via VACUUM INTO. Le plus rapide.",
      },
    ],
  },
  mongodb: {
    id: "mongodb",
    label: "MongoDB",
    dumpBinary: "mongodump",
    restoreBinary: "mongorestore",
    defaultPort: 27017,
    fileBased: false,
    installHint: "Installez les MongoDB Database Tools pour votre système.",
    formats: [
      {
        value: "directory",
        label: "Répertoire BSON",
        extension: "",
        hint: "Format natif mongodump, restauration avec mongorestore.",
      },
      {
        value: "archive",
        label: "Archive (.archive)",
        extension: ".archive",
        hint: "Un seul fichier, plus simple à déplacer.",
      },
    ],
  },
};

export const ENGINE_LIST = Object.values(ENGINES);

export function engineOf(id: EngineId): EngineSpec {
  return ENGINES[id];
}

/** Nom de fichier proposé : orncity_2026-07-17_10-56-47.dump */
export function suggestFileName(database: string, format: DumpFormat, engine: EngineId): string {
  const spec = ENGINES[engine];
  const ext = spec.formats.find((f) => f.value === format)?.extension ?? "";
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", "_")
    .replaceAll(":", "-");
  const base = (database || "dump").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${base}_${stamp}${ext}`;
}
