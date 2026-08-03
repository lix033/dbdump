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
  /** Dossier où l'outil écrit. Reste le point de départ même quand la
   *  sauvegarde part ailleurs : pg_dump & co. écrivent sur un disque. */
  destinationDir: string;
  fileName: string;
  schemaOnly: boolean;
  dataOnly: boolean;
  /** Ajoute DROP TABLE / --clean avant les CREATE. */
  clean: boolean;
  gzip: boolean;
  /** Tables à exclure, une par ligne dans l'UI. */
  excludeTables: string[];
  /** Destinations enregistrées vers lesquelles diffuser le fichier produit. */
  destinationIds: string[];
  /** Garder la copie locale après diffusion. */
  keepLocal: boolean;
}

/** Configuration propre à chaque type de destination. Un NAS ou un partage
 *  réseau monté par l'OS est un `folder` : c'est un chemin comme un autre. */
export type DestinationConfig =
  | { kind: "folder"; path: string }
  | {
      kind: "sftp";
      host: string;
      port: number;
      username: string;
      remoteDir: string;
      /** Vide = authentification par mot de passe. */
      privateKeyPath: string;
    }
  | {
      kind: "ftp";
      host: string;
      port: number;
      username: string;
      remoteDir: string;
      /** FTPS explicite. Le FTP nu circule en clair. */
      tls: boolean;
    }
  | {
      kind: "s3";
      /** Vide pour Amazon S3 ; l'URL du service pour MinIO ou R2. */
      endpoint: string;
      region: string;
      bucket: string;
      prefix: string;
      accessKeyId: string;
      pathStyle: boolean;
    };

export type DestinationKind = DestinationConfig["kind"];

export type Destination = { id: string; name: string; createdAt: string } & DestinationConfig;

/** Saisie du formulaire : le secret (mot de passe, phrase de passe, clé secrète)
 *  transite ici avant d'être rangé dans le coffre. Vide à l'édition = inchangé. */
export type DestinationDraft = { name: string; secret: string } & DestinationConfig;

/** Verdict d'une destination pour un dump donné. */
export interface DeliveryResult {
  destinationId: string;
  destinationName: string;
  ok: boolean;
  location?: string;
  error?: string;
  bytes: number;
  millis: number;
}

export interface FreeSpace {
  freeBytes: number;
  totalBytes: number;
}

/** Un volume monté : disque interne, disque externe, partage réseau. */
export interface Volume {
  name: string;
  mountPoint: string;
  freeBytes: number;
  totalBytes: number;
}

/** Photographie de la machine, rafraîchie tant que l'écran de surveillance est
 *  ouvert. */
export interface SystemStats {
  /** Charge CPU globale, 0-100. */
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  /** Part prise par les outils de dump en cours. */
  dumpCpuPercent: number;
  dumpMemoryBytes: number;
  activeDumps: number;
  volumes: Volume[];
}

/** Avancement d'un dump, mesuré sur le fichier en train d'être écrit. */
export interface DumpProgress {
  bytes: number;
  bytesPerSecond: number;
  /** Taille du dernier dump réussi de la même connexion, s'il y en a eu un. */
  expectedBytes?: number;
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
  /** Verdict de chaque destination. Vide quand le dump reste sur le disque. */
  deliveries: DeliveryResult[];
}

/** Quand une programmation se déclenche. `weekdays` suit la convention ISO
 *  (1 = lundi … 7 = dimanche), comme côté Rust. */
export type ScheduleTrigger =
  | { kind: "interval"; everyMinutes: number }
  | { kind: "daily"; time: string }
  | { kind: "weekly"; time: string; weekdays: number[] }
  | { kind: "monthly"; time: string; dayOfMonth: number }
  | { kind: "once"; at: string };

export type TriggerKind = ScheduleTrigger["kind"];

export type RunStatus = "running" | "success" | "failed" | "cancelled";

/** Une sauvegarde programmée. `nextRunAt` est calculé par le backend : l'UI
 *  l'affiche mais ne l'invente pas. */
export interface Schedule {
  id: string;
  name: string;
  connectionId: string;
  options: DumpOptions;
  trigger: ScheduleTrigger;
  enabled: boolean;
  createdAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: RunStatus;
  /** Nombre de sauvegardes à conserver. 0 = toutes. */
  keepLast: number;
}

export type ScheduleDraft = Omit<
  Schedule,
  "id" | "createdAt" | "nextRunAt" | "lastRunAt" | "lastStatus"
>;

/** Une exécution passée ou en cours, pour l'historique. */
export interface ScheduleRun {
  id: string;
  scheduleId: string;
  scheduleName: string;
  connectionName: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  outputPath?: string;
  sizeBytes?: number;
  error?: string;
  /** Exécution qui rattrape une échéance manquée pendant que l'app était fermée. */
  caughtUp: boolean;
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
