import { invoke, Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  BinaryStatus,
  Connection,
  ConnectionDraft,
  DeliveryResult,
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
import { currentDictionary, currentLocale } from "@/i18n/current";

/** Le canal ne transporte plus que les logs en direct ; le résultat final est la
 *  valeur de retour de `run_dump` (voir commands.rs). */
type DumpEvent =
  | { kind: "log"; line: string }
  | ({ kind: "progress" } & DumpProgress);

/** Ce que `run_dump` renvoie quand le dump réussit. */
interface DumpDone {
  sizeBytes: number;
  outputPath: string;
  deliveries: DeliveryResult[];
}

/** Émis par l'ordonnanceur à chaque début et fin d'exécution (voir
 *  desktop/src/scheduler.rs). */
const SCHEDULES_CHANGED = "dbdump://schedules-changed";

export class TauriBackend implements Backend {
  readonly isDesktop = true;

  testConnection(draft: ConnectionDraft): Promise<TestResult> {
    // `lang` : Rust renvoie ses messages (succès, conseils, erreurs) dans la
    // langue de l'interface. Voir desktop/src/i18n.rs.
    return invoke<TestResult>("test_connection", { draft, lang: currentLocale() });
  }

  async listDatabases(): Promise<string[]> {
    // Pas encore exposé côté Rust : l'UI laisse saisir le nom à la main.
    return [];
  }

  checkBinary(engine: EngineId): Promise<BinaryStatus> {
    return invoke<BinaryStatus>("check_binary", { engine, lang: currentLocale() });
  }

  async pickDirectory(): Promise<string | null> {
    const dir = await open({ directory: true, multiple: false });
    return typeof dir === "string" ? dir : null;
  }

  async pickFile(): Promise<string | null> {
    const file = await open({
      multiple: false,
      filters: [
        {
          name: currentDictionary().app.form.fileFilter,
          extensions: ["db", "sqlite", "sqlite3"],
        },
      ],
    });
    return typeof file === "string" ? file : null;
  }

  async runDump(
    conn: Connection,
    opts: DumpOptions,
    onProgress: (line: string) => void,
    onStats?: (progress: DumpProgress) => void,
  ): Promise<DumpJob> {
    const startedAt = new Date().toISOString();
    const log: string[] = [];

    // Rust pousse les lignes au fil de l'eau : l'UI n'attend pas la fin du dump
    // pour montrer ce qui se passe.
    const channel = new Channel<DumpEvent>();
    channel.onmessage = (event) => {
      if (event.kind === "log") {
        log.push(event.line);
        onProgress(event.line);
      } else {
        onStats?.(event);
      }
    };

    // La taille et le chemin viennent de la valeur de retour : pas de course avec
    // le canal. Un échec (base absente, droits, binaire…) rejette la promesse
    // avec la cause détaillée, remontée telle quelle par le try/catch appelant.
    const done = await invoke<DumpDone>("run_dump", {
      conn,
      opts,
      onEvent: channel,
      lang: currentLocale(),
    });

    return {
      id: conn.id,
      connectionId: conn.id,
      connectionName: conn.name,
      engine: conn.engine,
      status: "success",
      startedAt,
      finishedAt: new Date().toISOString(),
      outputPath: done.outputPath,
      sizeBytes: done.sizeBytes,
      log,
      deliveries: done.deliveries,
    };
  }

  listDestinations(): Promise<Destination[]> {
    return invoke<Destination[]>("load_destinations");
  }

  saveDestination(draft: DestinationDraft, id?: string): Promise<Destination> {
    return invoke<Destination>("save_destination", { draft, id: id ?? null });
  }

  async deleteDestination(id: string): Promise<void> {
    await invoke("delete_destination", { id });
  }

  testDestination(draft: DestinationDraft, id?: string): Promise<TestResult> {
    return invoke<TestResult>("test_destination", {
      draft,
      id: id ?? null,
      lang: currentLocale(),
    });
  }

  destinationSpace(id: string): Promise<FreeSpace | null> {
    return invoke<FreeSpace | null>("destination_space", { id });
  }

  systemStats(): Promise<SystemStats> {
    return invoke<SystemStats>("system_stats");
  }

  async cancelDump(jobId: string): Promise<void> {
    await invoke("cancel_dump", { jobId });
  }

  loadConnections(): Promise<Connection[]> {
    return invoke<Connection[]>("load_connections");
  }

  saveConnection(draft: ConnectionDraft, id?: string): Promise<Connection> {
    return invoke<Connection>("save_connection", { draft, id: id ?? null });
  }

  async deleteConnection(id: string): Promise<void> {
    await invoke("delete_connection", { id });
  }

  async revealInFolder(path: string): Promise<void> {
    await revealItemInDir(path);
  }

  async downloadResult(): Promise<void> {
    // Sans objet sur desktop : le fichier est déjà écrit à l'emplacement choisi.
  }

  copyToDownloads(outputPath: string): Promise<string> {
    return invoke<string>("copy_to_downloads", { path: outputPath });
  }

  // ── Programmations ─────────────────────────────────────────────────────────

  listSchedules(): Promise<Schedule[]> {
    // `lang` : c'est la seule occasion pour l'ordonnanceur d'apprendre la langue
    // de l'interface. Ses exécutions de fond n'ont personne à qui la demander.
    return invoke<Schedule[]>("load_schedules", { lang: currentLocale() });
  }

  saveSchedule(draft: ScheduleDraft, id?: string): Promise<Schedule> {
    return invoke<Schedule>("save_schedule", {
      draft,
      id: id ?? null,
      lang: currentLocale(),
    });
  }

  async deleteSchedule(id: string): Promise<void> {
    await invoke("delete_schedule", { id });
  }

  setScheduleEnabled(id: string, enabled: boolean): Promise<Schedule> {
    return invoke<Schedule>("set_schedule_enabled", { id, enabled });
  }

  async runScheduleNow(id: string): Promise<void> {
    await invoke("run_schedule_now", { id, lang: currentLocale() });
  }

  listScheduleRuns(): Promise<ScheduleRun[]> {
    return invoke<ScheduleRun[]>("load_schedule_runs");
  }

  isAutostartEnabled(): Promise<boolean> {
    return invoke<boolean>("autostart_enabled");
  }

  async setAutostart(enabled: boolean): Promise<void> {
    await invoke("set_autostart", { enabled });
  }

  onSchedulesChanged(listener: () => void): () => void {
    // `listen` est asynchrone alors que l'abonnement doit rendre la main tout de
    // suite : on garde la promesse et on désabonne quand elle est résolue. Un
    // démontage avant résolution est donc honoré lui aussi.
    const pending = listen(SCHEDULES_CHANGED, () => listener());
    return () => {
      pending.then((unlisten) => unlisten()).catch(() => {});
    };
  }
}
