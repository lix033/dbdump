import type {
  BinaryStatus,
  Connection,
  ConnectionDraft,
  DumpJob,
  DumpOptions,
  EngineId,
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

  /** Lance le dump. `onProgress` reçoit les lignes de log au fil de l'eau. */
  runDump(
    conn: Connection,
    opts: DumpOptions,
    onProgress: (line: string) => void,
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
}
