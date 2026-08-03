import { ENGINES } from "../engines";
import { destinationConfig } from "../destinations";
import { nextRun } from "../schedule";
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
import type { Backend } from "./types";
import { buildDemoDumpText } from "./demo-dump";
import { currentDictionary } from "@/i18n/current";

const STORE_KEY = "dbdump.connections";
const SCHEDULES_KEY = "dbdump.schedules";
const DESTINATIONS_KEY = "dbdump.destinations";
const RUNS_KEY = "dbdump.schedule-runs";

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
    const t = currentDictionary().mock;
    await sleep(700);
    if (ENGINES[draft.engine].fileBased) {
      return draft.filePath
        ? { ok: true, message: t.fileReadable, latencyMs: 3 }
        : { ok: false, message: t.noFileSelected };
    }
    if (!draft.host) return { ok: false, message: t.missingHost };
    if (!draft.password) {
      return { ok: false, message: t.authRefused(draft.username) };
    }
    return {
      ok: true,
      message: t.connected,
      serverVersion: draft.engine === "postgres" ? "15.18" : "8.0.36",
      latencyMs: 42,
    };
  }

  async listDatabases(draft: ConnectionDraft): Promise<string[]> {
    await sleep(400);
    if (draft.engine === "postgres") return ["app_prod", "postgres", "template1"];
    if (draft.engine === "mysql") return ["app_prod", "information_schema", "wordpress"];
    if (draft.engine === "mongodb") return ["admin", "analytics", "app_prod"];
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
      installHint: found ? undefined : currentDictionary().app.installHints[engine],
    };
  }

  async pickDirectory(): Promise<string | null> {
    // Le web ne choisit pas de dossier : la destination est le gestionnaire de
    // téléchargements. (L'UI n'affiche pas de bouton « Parcourir » en mode web.)
    return currentDictionary().mock.downloadDirLabel;
  }

  async pickFile(): Promise<string | null> {
    await sleep(200);
    return "/Users/mac/Documents/PROJECT/DUMPS/local.db";
  }

  async runDump(
    conn: Connection,
    opts: DumpOptions,
    onProgress: (line: string) => void,
    onStats?: (progress: DumpProgress) => void,
  ): Promise<DumpJob> {
    // Même id de job que côté desktop (l'id de connexion) : cancelDump() et le
    // bouton « Télécharger » ciblent ainsi le bon job.
    const id = conn.id;
    const t = currentDictionary().mock;
    this.cancelled.delete(id);
    const bin = ENGINES[conn.engine].dumpBinary;
    const startedAt = new Date().toISOString();
    const log: string[] = [];
    const emit = (line: string) => {
      log.push(line);
      onProgress(line);
    };

    const excluded = new Set(opts.excludeTables);
    const target = `${conn.host || conn.filePath || "local"}${conn.port ? `:${conn.port}` : ""}`;
    const steps = [
      t.connecting(bin, target),
      t.readingSchema(bin, conn.database || conn.filePath || ""),
      ...["users", "orders", "products"]
        .filter((table) => !excluded.has(table))
        .map((table) => t.dumpingTable(table)),
      t.writingIndexes,
    ];
    for (const [index, s] of steps.entries()) {
      if (this.cancelled.has(id)) throw new Error(t.cancelled);
      await sleep(400);
      emit(s);
      // Débit simulé : de quoi voir vivre l'affichage de progression en démo.
      onStats?.({
        bytes: (index + 1) * 320_000,
        bytesPerSecond: 780_000,
        expectedBytes: steps.length * 320_000,
      });
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
      throw new Error(t.prepareFailed(err instanceof Error ? err.message : String(err)));
    }

    const blob = new Blob([bytes], { type: "application/octet-stream" });
    // Conservé pour le bouton « Télécharger » (re-téléchargement) de la fenêtre.
    this.results.set(id, { blob, fileName });

    // Téléchargement automatique en fin de dump : c'est le comportement attendu
    // sur le web. Le bouton de la fenêtre permet de le relancer si besoin.
    emit(t.downloading(fileName));
    triggerDownload(blob, fileName);
    const outputPath = fileName;

    emit(t.finished(blob.size));

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
      deliveries: [],
    };
  }

  async cancelDump(jobId: string): Promise<void> {
    this.cancelled.add(jobId);
  }

  async downloadResult(jobId: string): Promise<void> {
    const result = this.results.get(jobId);
    if (!result) throw new Error(currentDictionary().mock.nothingToDownload);
    triggerDownload(result.blob, result.fileName);
  }

  async copyToDownloads(): Promise<string> {
    // Sans objet dans le navigateur : c'est downloadResult() qui met le fichier à
    // disposition. Ne devrait pas être appelé (l'UI n'expose ceci qu'en desktop).
    throw new Error(currentDictionary().mock.unavailableOnWeb);
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
    console.info("[mock] reveal in file manager:", path);
  }

  // ── Programmations ─────────────────────────────────────────────────────────
  // Le mode démo enregistre et affiche les programmations (calendrier compris,
  // via le miroir TS de `schedule.rs`) mais ne les déclenche **jamais** tout
  // seul : une page web qui se met à télécharger des fichiers d'elle-même serait
  // une mauvaise surprise. Seul « Exécuter maintenant » produit une exécution.

  private scheduleListeners = new Set<() => void>();

  private notifySchedules(): void {
    for (const listener of this.scheduleListeners) listener();
  }

  private read<T>(key: string): T[] {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
    } catch {
      return [];
    }
  }

  private write<T>(key: string, value: T[]): void {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  async listSchedules(): Promise<Schedule[]> {
    // L'échéance est recalculée à la lecture : sans ordonnanceur, c'est le seul
    // moment où elle peut rester juste.
    return this.read<Schedule>(SCHEDULES_KEY).map((s) => ({
      ...s,
      nextRunAt: s.enabled ? (nextRun(s.trigger)?.toISOString() ?? undefined) : undefined,
    }));
  }

  async saveSchedule(draft: ScheduleDraft, id?: string): Promise<Schedule> {
    const all = this.read<Schedule>(SCHEDULES_KEY);
    const previous = all.find((s) => s.id === id);
    const schedule: Schedule = {
      ...draft,
      id: id ?? crypto.randomUUID(),
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      lastRunAt: previous?.lastRunAt,
      lastStatus: previous?.lastStatus,
      nextRunAt: draft.enabled ? (nextRun(draft.trigger)?.toISOString() ?? undefined) : undefined,
    };
    this.write(SCHEDULES_KEY, id ? all.map((s) => (s.id === id ? schedule : s)) : [...all, schedule]);
    this.notifySchedules();
    return schedule;
  }

  async deleteSchedule(id: string): Promise<void> {
    this.write(
      SCHEDULES_KEY,
      this.read<Schedule>(SCHEDULES_KEY).filter((s) => s.id !== id),
    );
    this.notifySchedules();
  }

  async setScheduleEnabled(id: string, enabled: boolean): Promise<Schedule> {
    const all = this.read<Schedule>(SCHEDULES_KEY);
    const schedule = all.find((s) => s.id === id);
    if (!schedule) throw new Error(currentDictionary().mock.scheduleMissing);
    const updated: Schedule = {
      ...schedule,
      enabled,
      nextRunAt: enabled ? (nextRun(schedule.trigger)?.toISOString() ?? undefined) : undefined,
    };
    this.write(
      SCHEDULES_KEY,
      all.map((s) => (s.id === id ? updated : s)),
    );
    this.notifySchedules();
    return updated;
  }

  async runScheduleNow(id: string): Promise<void> {
    const all = this.read<Schedule>(SCHEDULES_KEY);
    const schedule = all.find((s) => s.id === id);
    if (!schedule) throw new Error(currentDictionary().mock.scheduleMissing);
    const connection = (await this.loadConnections()).find((c) => c.id === schedule.connectionId);

    const startedAt = new Date().toISOString();
    const run: ScheduleRun = {
      id: crypto.randomUUID(),
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      connectionName: connection?.name ?? "",
      startedAt,
      status: "running",
      caughtUp: false,
    };
    this.write(RUNS_KEY, [run, ...this.read<ScheduleRun>(RUNS_KEY)].slice(0, 200));
    this.notifySchedules();

    await sleep(1200);
    const done: ScheduleRun = connection
      ? {
          ...run,
          status: "success",
          finishedAt: new Date().toISOString(),
          outputPath: `${schedule.options.destinationDir}/${schedule.options.fileName}`,
          sizeBytes: 2_400_000 + Math.floor(Math.random() * 800_000),
        }
      : {
          ...run,
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: currentDictionary().mock.scheduleConnectionMissing,
        };

    this.write(
      RUNS_KEY,
      this.read<ScheduleRun>(RUNS_KEY).map((r) => (r.id === run.id ? done : r)),
    );
    this.write(
      SCHEDULES_KEY,
      this.read<Schedule>(SCHEDULES_KEY).map((s) =>
        s.id === id ? { ...s, lastRunAt: startedAt, lastStatus: done.status } : s,
      ),
    );
    this.notifySchedules();
  }

  async listScheduleRuns(): Promise<ScheduleRun[]> {
    return this.read<ScheduleRun>(RUNS_KEY);
  }

  onSchedulesChanged(listener: () => void): () => void {
    this.scheduleListeners.add(listener);
    return () => this.scheduleListeners.delete(listener);
  }

  async isAutostartEnabled(): Promise<boolean> {
    // Une page web ne se lance pas au démarrage : l'UI masque l'option hors desktop.
    return false;
  }

  async setAutostart(): Promise<void> {
    throw new Error(currentDictionary().mock.unavailableOnWeb);
  }

  // ── Destinations ───────────────────────────────────────────────────────────
  // Enregistrées et affichées comme sur desktop, mais rien n'est jamais envoyé :
  // un navigateur ne parle ni SFTP, ni FTP, et n'a pas de disque à écrire.

  async listDestinations(): Promise<Destination[]> {
    return this.read<Destination>(DESTINATIONS_KEY);
  }

  async saveDestination(draft: DestinationDraft, id?: string): Promise<Destination> {
    const all = this.read<Destination>(DESTINATIONS_KEY);
    // Le secret n'est délibérément pas conservé : côté desktop il va au coffre
    // chiffré, jamais dans ce store.
    const destination: Destination = {
      ...destinationConfig(draft),
      name: draft.name,
      id: id ?? crypto.randomUUID(),
      createdAt: all.find((d) => d.id === id)?.createdAt ?? new Date().toISOString(),
    };
    this.write(
      DESTINATIONS_KEY,
      id ? all.map((d) => (d.id === id ? destination : d)) : [...all, destination],
    );
    return destination;
  }

  async deleteDestination(id: string): Promise<void> {
    this.write(
      DESTINATIONS_KEY,
      this.read<Destination>(DESTINATIONS_KEY).filter((d) => d.id !== id),
    );
  }

  async testDestination(draft: DestinationDraft): Promise<TestResult> {
    const t = currentDictionary().mock;
    await sleep(600);
    if (draft.kind === "folder") {
      return { ok: false, message: t.unavailableOnWeb };
    }
    // Assez de validation pour que le formulaire se comporte comme en vrai.
    if (draft.kind === "s3") {
      if (!draft.bucket) return { ok: false, message: t.missingBucket };
    } else if (!draft.host) {
      return { ok: false, message: t.missingHost };
    }
    return { ok: true, message: t.destinationReady, latencyMs: 38 };
  }

  async destinationSpace(): Promise<FreeSpace | null> {
    return null;
  }

  async systemStats(): Promise<SystemStats> {
    // Valeurs plausibles et stables : la démo montre la forme de l'écran, sans
    // prétendre mesurer la machine du visiteur (le navigateur ne le peut pas).
    return {
      cpuPercent: 18 + Math.random() * 12,
      memoryUsedBytes: 9_400_000_000,
      memoryTotalBytes: 17_179_869_184,
      dumpCpuPercent: 0,
      dumpMemoryBytes: 0,
      activeDumps: 0,
      volumes: [
        {
          name: "Macintosh HD",
          mountPoint: "/",
          freeBytes: 214_000_000_000,
          totalBytes: 494_384_795_648,
        },
      ],
    };
  }
}
