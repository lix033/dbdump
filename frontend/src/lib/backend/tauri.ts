import { invoke, Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
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

/** Le canal ne transporte plus que les logs en direct ; le résultat final est la
 *  valeur de retour de `run_dump` (voir commands.rs). */
type DumpEvent = { kind: "log"; line: string };

/** Ce que `run_dump` renvoie quand le dump réussit. */
interface DumpDone {
  sizeBytes: number;
  outputPath: string;
}

export class TauriBackend implements Backend {
  readonly isDesktop = true;

  testConnection(draft: ConnectionDraft): Promise<TestResult> {
    return invoke<TestResult>("test_connection", { draft });
  }

  async listDatabases(): Promise<string[]> {
    // Pas encore exposé côté Rust : l'UI laisse saisir le nom à la main.
    return [];
  }

  checkBinary(engine: EngineId): Promise<BinaryStatus> {
    return invoke<BinaryStatus>("check_binary", { engine });
  }

  async pickDirectory(): Promise<string | null> {
    const dir = await open({ directory: true, multiple: false });
    return typeof dir === "string" ? dir : null;
  }

  async pickFile(): Promise<string | null> {
    const file = await open({
      multiple: false,
      filters: [{ name: "Base SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
    });
    return typeof file === "string" ? file : null;
  }

  async runDump(
    conn: Connection,
    opts: DumpOptions,
    onProgress: (line: string) => void,
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
      }
    };

    // La taille et le chemin viennent de la valeur de retour : pas de course avec
    // le canal. Un échec (base absente, droits, binaire…) rejette la promesse
    // avec la cause détaillée, remontée telle quelle par le try/catch appelant.
    const done = await invoke<DumpDone>("run_dump", { conn, opts, onEvent: channel });

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
    };
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
}
