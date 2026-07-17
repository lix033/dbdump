import { engineOf } from "./engines";
import type { Connection, DumpOptions } from "./types";

export interface CommandPreview {
  bin: string;
  args: string[];
  /** Variables passées au process ; jamais le mot de passe en clair sur l'argv. */
  env: Record<string, string>;
}

/** Construit l'argv d'un dump, pour AFFICHAGE dans l'UI et pour les tests.
 *
 *  À l'exécution, c'est Rust qui reconstruit cette commande à partir des mêmes
 *  options structurées : laisser le frontend dicter l'argv exécuté ouvrirait une
 *  surface d'injection pour rien. Les deux implémentations doivent rester
 *  alignées — voir dump-command.test.ts. */
export function buildDumpCommand(
  conn: Connection,
  opts: DumpOptions,
  outputPath: string,
): CommandPreview {
  const spec = engineOf(conn.engine);
  const args: string[] = [];
  const env: Record<string, string> = {};

  switch (conn.engine) {
    case "postgres": {
      args.push("--host", conn.host, "--port", String(conn.port), "--username", conn.username);
      args.push("--format", opts.format === "plain" ? "plain" : opts.format === "directory" ? "directory" : "custom");
      if (opts.clean) args.push("--clean", "--if-exists");
      if (opts.schemaOnly) args.push("--schema-only");
      if (opts.dataOnly) args.push("--data-only");
      for (const t of opts.excludeTables) args.push("--exclude-table", t);
      if (conn.sslMode === "require") env.PGSSLMODE = "require";
      // pg_dump lit PGPASSWORD dans l'env : rien de sensible n'apparaît dans `ps`.
      env.PGPASSWORD = "••••••";
      args.push("--file", outputPath, conn.database);
      break;
    }
    case "mysql": {
      args.push(`--host=${conn.host}`, `--port=${conn.port}`, `--user=${conn.username}`);
      if (opts.clean) args.push("--add-drop-table");
      if (opts.schemaOnly) args.push("--no-data");
      if (opts.dataOnly) args.push("--no-create-info");
      for (const t of opts.excludeTables) args.push(`--ignore-table=${conn.database}.${t}`);
      if (conn.sslMode === "require") args.push("--ssl-mode=REQUIRED");
      args.push(`--result-file=${outputPath}`, conn.database);
      env.MYSQL_PWD = "••••••";
      break;
    }
    case "sqlite": {
      if (opts.format === "archive") {
        args.push(conn.filePath ?? "", `VACUUM INTO '${outputPath}'`);
      } else {
        args.push(conn.filePath ?? "", opts.schemaOnly ? ".schema" : ".dump");
      }
      break;
    }
    case "mongodb": {
      args.push(`--host=${conn.host}`, `--port=${conn.port}`, `--username=${conn.username}`);
      args.push(`--db=${conn.database}`);
      if (conn.sslMode === "require") args.push("--ssl");
      for (const t of opts.excludeTables) args.push(`--excludeCollection=${t}`);
      if (opts.format === "archive") args.push(`--archive=${outputPath}`);
      else args.push(`--out=${outputPath}`);
      if (opts.gzip) args.push("--gzip");
      break;
    }
  }

  return { bin: spec.dumpBinary, args, env };
}

/** Rend la commande copiable dans le terminal. */
export function formatCommand(cmd: CommandPreview): string {
  const envPart = Object.entries(cmd.env)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const quoted = cmd.args.map((a) => (/[\s'"]/.test(a) ? `'${a.replaceAll("'", "'\\''")}'` : a));
  return [envPart, cmd.bin, ...quoted].filter(Boolean).join(" ");
}
