export type EngineId = "postgres" | "mysql" | "sqlite" | "mongodb";

export type SslMode = "disable" | "prefer" | "require";

/** Une connexion enregistrée. Le mot de passe n'est jamais dans cet objet :
 *  il vit dans le trousseau système, référencé par `id`. */
export interface Connection {
  id: string;
  name: string;
  engine: EngineId;
  host: string;
  port: number;
  username: string;
  database: string;
  /** Chemin du fichier, pour SQLite uniquement. */
  filePath?: string;
  sslMode: SslMode;
  createdAt: string;
}

/** Saisie du formulaire : comme Connection, mais le mot de passe transite ici
 *  avant d'être rangé dans le trousseau. */
export type ConnectionDraft = Omit<Connection, "id" | "createdAt"> & {
  password: string;
};

export type DumpFormat = "plain" | "custom" | "directory" | "archive";

export interface DumpOptions {
  format: DumpFormat;
  /** Dossier de destination choisi par l'utilisateur. */
  destinationDir: string;
  fileName: string;
  schemaOnly: boolean;
  dataOnly: boolean;
  /** Ajoute DROP TABLE / --clean avant les CREATE. */
  clean: boolean;
  gzip: boolean;
  /** Tables à exclure, une par ligne dans l'UI. */
  excludeTables: string[];
}

export type JobStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export interface DumpJob {
  id: string;
  connectionId: string;
  connectionName: string;
  engine: EngineId;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  outputPath: string;
  /** Taille du fichier produit, en octets. */
  sizeBytes?: number;
  /** Sortie de l'outil (stderr de pg_dump, etc.). */
  log: string[];
  error?: string;
}

export interface TestResult {
  ok: boolean;
  message: string;
  /** Version du serveur si la connexion a abouti. */
  serverVersion?: string;
  latencyMs?: number;
}

/** État d'un binaire externe (pg_dump, mysqldump…) sur la machine. */
export interface BinaryStatus {
  name: string;
  found: boolean;
  /** true si DBDump peut fournir l'outil lui-même (téléchargement de pg_dump au
   *  premier dump), même absent du système : le dump n'est alors pas bloqué. */
  provisionable: boolean;
  path?: string;
  version?: string;
  /** Comment l'installer, si absent. */
  installHint?: string;
}
