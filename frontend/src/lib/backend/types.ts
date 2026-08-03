import type {
  BinaryStatus,
  Connection,
  ConnectionDraft,
  Destination,
  DestinationDraft,
  DumpJob,
  DumpOptions,
  DumpProgress,
  EngineId,
  FreeSpace,
  Schedule,
  ScheduleDraft,
  ScheduleRun,
  SystemStats,
  TestResult,
} from "../types";

/** Tout ce que l'UI ne peut pas faire elle-même : réseau, système de fichiers,
 *  exécution de binaires, trousseau. Une implémentation mock (navigateur) et une
 *  implémentation Tauri (desktop) satisfont ce contrat. */
export interface Backend {
  /** true quand on tourne dans Tauri, false dans un navigateur. */
  readonly isDesktop: boolean;

  testConnection(draft: ConnectionDraft): Promise<TestResult>;
  listDatabases(draft: ConnectionDraft): Promise<string[]>;

  /** Vérifie la présence de pg_dump / mysqldump / … sur la machine. */
  checkBinary(engine: EngineId): Promise<BinaryStatus>;

  /** Ouvre le sélecteur de dossier natif. null si l'utilisateur annule. */
  pickDirectory(): Promise<string | null>;
  /** Sélecteur de fichier, pour SQLite. */
  pickFile(): Promise<string | null>;

  /** Lance le dump. `onProgress` reçoit les lignes de log au fil de l'eau,
   *  `onStats` le débit d'écriture mesuré pendant que le fichier grossit. */
  runDump(
    conn: Connection,
    opts: DumpOptions,
    onProgress: (line: string) => void,
    onStats?: (progress: DumpProgress) => void,
  ): Promise<DumpJob>;
  cancelDump(jobId: string): Promise<void>;

  /** Connexions persistées (JSON chiffré côté desktop, localStorage sinon). */
  loadConnections(): Promise<Connection[]>;
  saveConnection(draft: ConnectionDraft, id?: string): Promise<Connection>;
  deleteConnection(id: string): Promise<void>;

  /** Révèle le fichier produit dans le Finder / l'explorateur. */
  revealInFolder(path: string): Promise<void>;

  /** Web : (re)télécharge dans le navigateur le fichier produit par le dump
   *  `jobId`. Sur desktop, sans objet (le fichier est déjà sur le disque). */
  downloadResult(jobId: string): Promise<void>;

  /** Desktop : copie le fichier produit vers le dossier Téléchargements de l'OS
   *  et renvoie le chemin de la copie. Sur web, sans objet. */
  copyToDownloads(outputPath: string): Promise<string>;

  // ── Programmations ─────────────────────────────────────────────────────────
  // Les échéances sont calculées et déclenchées par le backend : l'UI lit et
  // écrit, elle ne tient pas d'horloge.

  listSchedules(): Promise<Schedule[]>;
  saveSchedule(draft: ScheduleDraft, id?: string): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;
  /** Suspend ou reprend. Reprendre recalcule l'échéance depuis maintenant. */
  setScheduleEnabled(id: string, enabled: boolean): Promise<Schedule>;
  /** Lance tout de suite, sans attendre l'échéance. Rend la main aussitôt :
   *  l'avancement arrive par `onSchedulesChanged`. */
  runScheduleNow(id: string): Promise<void>;
  listScheduleRuns(): Promise<ScheduleRun[]>;
  /** Prévient quand une exécution démarre ou se termine en fond. Renvoie la
   *  fonction de désabonnement. */
  onSchedulesChanged(listener: () => void): () => void;

  /** Desktop : DBDump se lance-t-il à l'ouverture de session ? Sans lui, une
   *  programmation nocturne ne part que si l'app était déjà ouverte. */
  isAutostartEnabled(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<void>;

  // ── Destinations ───────────────────────────────────────────────────────────

  listDestinations(): Promise<Destination[]>;
  saveDestination(draft: DestinationDraft, id?: string): Promise<Destination>;
  deleteDestination(id: string): Promise<void>;
  /** Teste la connexion **et** le droit d'écriture, sur un brouillon non
   *  enregistré. */
  testDestination(draft: DestinationDraft, id?: string): Promise<TestResult>;
  /** Espace libre, quand la destination sait le dire (dossier, SFTP). */
  destinationSpace(id: string): Promise<FreeSpace | null>;

  /** État de la machine : CPU, mémoire, volumes, dumps en cours. */
  systemStats(): Promise<SystemStats>;
}
