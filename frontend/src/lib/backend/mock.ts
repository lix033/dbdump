import { ENGINES } from "../engines";
import type {
  BinaryStatus,
  Connection,
  ConnectionDraft,
  DumpJob,
  DumpOptions,
  EngineId,
  TestResult,
} from "../types";
import type { Backend } from "./types";
import { buildDemoDumpText } from "./demo-dump";

const STORE_KEY = "dbdump.connections";

/** Sur le web, on ne choisit pas de dossier de destination : le navigateur ne
 *  peut pas écrire librement sur le disque, et l'expérience attendue est simple —
 *  on lance le dump, le fichier se télécharge. Cette étiquette occupe la
 *  « destination » côté UI. */
export const DOWNLOAD_DIR_LABEL = "Téléchargements du navigateur";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Compresse en gzip si le navigateur expose CompressionStream, sinon renvoie
 *  les octets tels quels (le mode démo ne bloque pas pour si peu). */
async function maybeGzip(
  bytes: Uint8Array<ArrayBuffer>,
  enabled: boolean,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!enabled || typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisser au navigateur le temps de démarrer le téléchargement avant de libérer.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Backend de développement : tourne dans un navigateur, ne touche à rien de réel.
 *  Il simule assez fidèlement les échecs (binaire absent, mot de passe refusé)
 *  pour que l'UI soit conçue avec les cas d'erreur en tête, pas seulement le
 *  chemin heureux. */
export class MockBackend implements Backend {
  readonly isDesktop = false;

  /** Job en cours, pour honorer cancelDump(). */
  private cancelled = new Set<string>();
  /** Fichiers produits, gardés en mémoire pour le bouton « Télécharger ». */
  private results = new Map<string, { blob: Blob; fileName: string }>();

  async testConnection(draft: ConnectionDraft): Promise<TestResult> {
    await sleep(700);
    if (ENGINES[draft.engine].fileBased) {
      return draft.filePath
        ? { ok: true, message: "Fichier lisible", latencyMs: 3 }
        : { ok: false, message: "Aucun fichier sélectionné" };
    }
    if (!draft.host) return { ok: false, message: "Hôte manquant" };
    if (!draft.password) {
      return { ok: false, message: 'Authentification refusée pour "' + draft.username + '"' };
    }
    return {
      ok: true,
      message: "Connexion établie",
      serverVersion: draft.engine === "postgres" ? "15.18" : "8.0.36",
      latencyMs: 42,
    };
  }

  async listDatabases(draft: ConnectionDraft): Promise<string[]> {
    await sleep(400);
    if (draft.engine === "postgres") return ["orncity", "postgres", "template1"];
    if (draft.engine === "mysql") return ["app", "information_schema", "wordpress"];
    if (draft.engine === "mongodb") return ["admin", "analytics", "orncity"];
    return [draft.database || "main"];
  }

  async checkBinary(engine: EngineId): Promise<BinaryStatus> {
    await sleep(150);
    const spec = ENGINES[engine];
    // Reflète la machine de dev : pg_dump présent, mysqldump absent.
    const found = engine === "postgres" || engine === "sqlite";
    return {
      name: spec.dumpBinary,
      found,
      // En démo, pg_dump/sqlite3 sont « présents » ; le provisionnement (desktop)
      // ne s'applique donc pas ici.
      provisionable: false,
      path: found ? `/opt/homebrew/bin/${spec.dumpBinary}` : undefined,
      version: found ? (engine === "postgres" ? "15.18" : "3.43.2") : undefined,
      installHint: found ? undefined : spec.installHint,
    };
  }

  async pickDirectory(): Promise<string | null> {
    // Le web ne choisit pas de dossier : la destination est le gestionnaire de
    // téléchargements. (L'UI n'affiche pas de bouton « Parcourir » en mode web.)
    return DOWNLOAD_DIR_LABEL;
  }

  async pickFile(): Promise<string | null> {
    await sleep(200);
    return "/Users/mac/Documents/PROJECT/DUMPS/local.db";
  }

  async runDump(
    conn: Connection,
    opts: DumpOptions,
    onProgress: (line: string) => void,
  ): Promise<DumpJob> {
    // Même id de job que côté desktop (l'id de connexion) : cancelDump() et le
    // bouton « Télécharger » ciblent ainsi le bon job.
    const id = conn.id;
    this.cancelled.delete(id);
    const bin = ENGINES[conn.engine].dumpBinary;
    const startedAt = new Date().toISOString();
    const log: string[] = [];
    const emit = (line: string) => {
      log.push(line);
      onProgress(line);
    };

    const excluded = new Set(opts.excludeTables);
    const steps = [
      `${bin}: connexion à ${conn.host || conn.filePath || "local"}${conn.port ? `:${conn.port}` : ""}`,
      `${bin}: lecture du schéma de "${conn.database || conn.filePath || ""}"`,
      ...["users", "orders", "products"]
        .filter((t) => !excluded.has(t))
        .map((t) => `dumping table ${t}`),
      "écriture des index et contraintes",
    ];
    for (const s of steps) {
      if (this.cancelled.has(id)) throw new Error("Dump annulé");
      await sleep(400);
      emit(s);
    }

    // Produit un vrai fichier : contenu cohérent avec les options, écrit dans le
    // dossier choisi (File System Access) ou remis aux téléchargements.
    let gzipped = false;
    let fileName = opts.fileName;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const text = buildDemoDumpText(conn, opts);
      bytes = await maybeGzip(new Uint8Array(new TextEncoder().encode(text)), opts.gzip);
      gzipped = opts.gzip && typeof CompressionStream !== "undefined";
      if (gzipped && !fileName.endsWith(".gz")) fileName += ".gz";
    } catch (err) {
      throw new Error(
        `Impossible de préparer le fichier : ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const blob = new Blob([bytes], { type: "application/octet-stream" });
    // Conservé pour le bouton « Télécharger » (re-téléchargement) de la fenêtre.
    this.results.set(id, { blob, fileName });

    // Téléchargement automatique en fin de dump : c'est le comportement attendu
    // sur le web. Le bouton de la fenêtre permet de le relancer si besoin.
    emit(`téléchargement de ${fileName}`);
    triggerDownload(blob, fileName);
    const outputPath = fileName;

    emit(`terminé (${blob.size} octets)`);

    return {
      id,
      connectionId: conn.id,
      connectionName: conn.name,
      engine: conn.engine,
      status: "success",
      startedAt,
      finishedAt: new Date().toISOString(),
      outputPath,
      sizeBytes: blob.size,
      log,
    };
  }

  async cancelDump(jobId: string): Promise<void> {
    this.cancelled.add(jobId);
  }

  async downloadResult(jobId: string): Promise<void> {
    const result = this.results.get(jobId);
    if (!result) throw new Error("Aucun fichier à télécharger pour ce dump.");
    triggerDownload(result.blob, result.fileName);
  }

  async copyToDownloads(): Promise<string> {
    // Sans objet dans le navigateur : c'est downloadResult() qui met le fichier à
    // disposition. Ne devrait pas être appelé (l'UI n'expose ceci qu'en desktop).
    throw new Error("Indisponible en mode web.");
  }

  async loadConnections(): Promise<Connection[]> {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "[]") as Connection[];
    } catch {
      return [];
    }
  }

  async saveConnection(draft: ConnectionDraft, id?: string): Promise<Connection> {
    const all = await this.loadConnections();
    const conn: Connection = {
      id: id ?? crypto.randomUUID(),
      name: draft.name,
      engine: draft.engine,
      host: draft.host,
      port: draft.port,
      username: draft.username,
      database: draft.database,
      filePath: draft.filePath,
      sslMode: draft.sslMode,
      createdAt: all.find((c) => c.id === id)?.createdAt ?? new Date().toISOString(),
    };
    const next = id ? all.map((c) => (c.id === id ? conn : c)) : [...all, conn];
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    // Le mot de passe est délibérément absent : côté desktop il ira dans le
    // trousseau système, jamais dans ce store.
    return conn;
  }

  async deleteConnection(id: string): Promise<void> {
    const all = await this.loadConnections();
    window.localStorage.setItem(STORE_KEY, JSON.stringify(all.filter((c) => c.id !== id)));
  }

  async revealInFolder(path: string): Promise<void> {
    console.info("[mock] révéler dans le Finder :", path);
  }
}
