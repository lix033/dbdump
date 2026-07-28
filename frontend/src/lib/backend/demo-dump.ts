import { ENGINES } from "../engines";
import type { Connection, DumpOptions } from "../types";
import { currentDictionary } from "@/i18n/current";
import type { Dictionary } from "@/i18n/dictionaries";

/** Génère un contenu de dump *plausible* pour le mode démo (navigateur).
 *
 *  Ce n'est évidemment pas un vrai export de base — le navigateur n'a aucun
 *  accès réseau aux serveurs — mais le fichier produit est cohérent avec les
 *  options choisies (structure/données, DROP, tables exclues) pour que le
 *  téléchargement soit tangible et que l'UI se teste de bout en bout. */
export function buildDemoDumpText(conn: Connection, opts: DumpOptions): string {
  const t = currentDictionary().demo;
  const spec = ENGINES[conn.engine];
  const now = new Date().toISOString();
  const excluded = new Set(opts.excludeTables);
  const tables = ["users", "orders", "products"].filter((table) => !excluded.has(table));

  const header = [
    `-- ${t.header}`,
    `-- ${t.generatedOn(now)}`,
    `-- ${t.engine(spec.label, spec.dumpBinary)}`,
    `-- ${t.database(conn.database || conn.filePath || "—")}`,
    `-- ${t.options(describeOptions(opts, t))}`,
    `--`,
    `-- ${t.fakeWarning(spec.dumpBinary)}`,
    `--${t.fakeWarningCont}`,
    ``,
  ].join("\n");

  if (conn.engine === "mongodb") {
    return header + buildMongoBody(conn, tables, opts, t);
  }
  return header + buildSqlBody(conn, tables, opts, t);
}

type DemoText = Dictionary["demo"];

function describeOptions(opts: DumpOptions, t: DemoText): string {
  const parts: string[] = [`format=${opts.format}`];
  if (opts.schemaOnly) parts.push(t.optSchemaOnly);
  if (opts.dataOnly) parts.push(t.optDataOnly);
  if (opts.clean) parts.push(t.optClean);
  if (opts.gzip) parts.push("gzip");
  if (opts.excludeTables.length) parts.push(t.optExcludes(opts.excludeTables.join(", ")));
  return parts.join(", ");
}

/** Lignes d'exemple. Seuls les noms de produits sont traduits : le reste est de
 *  la donnée neutre (e-mails, montants, états). */
function sampleRows(t: DemoText): Record<string, string[]> {
  const [keyboard, mouse, monitor] = t.sampleProducts;
  return {
    users: [
      "(1, 'ada@example.com', 'Ada Lovelace', '2024-01-04 09:12:00')",
      "(2, 'alan@example.com', 'Alan Turing', '2024-02-18 14:03:41')",
      "(3, 'grace@example.com', 'Grace Hopper', '2024-03-27 08:55:12')",
    ],
    orders: [
      "(1001, 1, 149.90, 'paid', '2024-04-02 10:20:00')",
      "(1002, 3, 39.00, 'pending', '2024-04-05 16:41:30')",
    ],
    products: [
      `(1, '${keyboard}', 89.00, 42)`,
      `(2, '${mouse}', 59.00, 130)`,
      `(3, '${monitor}', 329.00, 17)`,
    ],
  };
}

const SCHEMAS: Record<string, string> = {
  users:
    "CREATE TABLE users (\n" +
    "  id BIGINT PRIMARY KEY,\n" +
    "  email VARCHAR(255) NOT NULL UNIQUE,\n" +
    "  full_name VARCHAR(255) NOT NULL,\n" +
    "  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n" +
    ");",
  orders:
    "CREATE TABLE orders (\n" +
    "  id BIGINT PRIMARY KEY,\n" +
    "  user_id BIGINT NOT NULL REFERENCES users(id),\n" +
    "  amount NUMERIC(10,2) NOT NULL,\n" +
    "  status VARCHAR(32) NOT NULL,\n" +
    "  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n" +
    ");",
  products:
    "CREATE TABLE products (\n" +
    "  id BIGINT PRIMARY KEY,\n" +
    "  name VARCHAR(255) NOT NULL,\n" +
    "  price NUMERIC(10,2) NOT NULL,\n" +
    "  stock INTEGER NOT NULL DEFAULT 0\n" +
    ");",
};

const COLUMNS: Record<string, string> = {
  users: "(id, email, full_name, created_at)",
  orders: "(id, user_id, amount, status, created_at)",
  products: "(id, name, price, stock)",
};

function buildSqlBody(
  conn: Connection,
  tables: string[],
  opts: DumpOptions,
  t: DemoText,
): string {
  const rowsByTable = sampleRows(t);
  const out: string[] = [];
  for (const table of tables) {
    out.push(`--`, `-- ${t.tableHeading(table)}`, `--`);
    if (!opts.dataOnly) {
      if (opts.clean) out.push(`DROP TABLE IF EXISTS ${table};`);
      out.push(SCHEMAS[table], "");
    }
    if (!opts.schemaOnly) {
      const rows = rowsByTable[table] ?? [];
      out.push(`INSERT INTO ${table} ${COLUMNS[table]} VALUES`);
      out.push(rows.map((r, i) => `  ${r}${i === rows.length - 1 ? ";" : ","}`).join("\n"), "");
    }
  }
  out.push(`-- ${t.endOfDump(conn.database || t.theDatabase)}`, "");
  return out.join("\n");
}

function buildMongoBody(
  conn: Connection,
  collections: string[],
  opts: DumpOptions,
  t: DemoText,
): string {
  const rowsByCollection = sampleRows(t);
  const out: string[] = [`-- ${t.mongoNotice}`, ``];
  for (const c of collections) {
    out.push(`// collection: ${c}`);
    if (opts.schemaOnly) {
      out.push(`// ${t.mongoSchemaOnly}`, ``);
      continue;
    }
    const docs = (rowsByCollection[c] ?? []).map(
      (_, i) => `{ "_id": ${i + 1}, "collection": "${c}" }`,
    );
    out.push(docs.join("\n"), ``);
  }
  out.push(`// ${t.endOfDump(conn.database || t.theDatabase)}`, ``);
  return out.join("\n");
}
