import type { DumpFormat, EngineId } from "./types";

/** Un format proposé par un moteur. Les libellés et explications sont dans les
 *  dictionnaires (`t.app.formats[engine][format]`) : ici, seule la structure. */
export interface FormatOption {
  value: DumpFormat;
  /** Extension appliquée au nom de fichier proposé. */
  extension: string;
}

export interface EngineSpec {
  id: EngineId;
  /** Nom du moteur : une marque, identique dans toutes les langues. */
  label: string;
  /** Binaire qui produit le dump. */
  dumpBinary: string;
  /** Binaire qui restaure, affiché dans l'aide. */
  restoreBinary: string;
  defaultPort: number;
  /** SQLite ne se connecte pas par le réseau : on demande un fichier. */
  fileBased: boolean;
  formats: FormatOption[];
}

export const ENGINES: Record<EngineId, EngineSpec> = {
  postgres: {
    id: "postgres",
    label: "PostgreSQL",
    dumpBinary: "pg_dump",
    restoreBinary: "pg_restore",
    defaultPort: 5432,
    fileBased: false,
    formats: [
      { value: "custom", extension: ".dump" },
      { value: "plain", extension: ".sql" },
      { value: "directory", extension: "" },
    ],
  },
  mysql: {
    id: "mysql",
    label: "MySQL / MariaDB",
    dumpBinary: "mysqldump",
    restoreBinary: "mysql",
    defaultPort: 3306,
    fileBased: false,
    formats: [{ value: "plain", extension: ".sql" }],
  },
  sqlite: {
    id: "sqlite",
    label: "SQLite",
    dumpBinary: "sqlite3",
    restoreBinary: "sqlite3",
    defaultPort: 0,
    fileBased: true,
    formats: [
      { value: "plain", extension: ".sql" },
      { value: "archive", extension: ".db" },
    ],
  },
  mongodb: {
    id: "mongodb",
    label: "MongoDB",
    dumpBinary: "mongodump",
    restoreBinary: "mongorestore",
    defaultPort: 27017,
    fileBased: false,
    formats: [
      { value: "directory", extension: "" },
      { value: "archive", extension: ".archive" },
    ],
  },
};

export const ENGINE_LIST = Object.values(ENGINES);

export function engineOf(id: EngineId): EngineSpec {
  return ENGINES[id];
}

/** Nom de fichier proposé : app_prod_2026-07-17_10-56-47.dump */
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
