<p align="center">
  <img src="brand/logo-512.png" alt="" width="92" height="92">
</p>

# DBDump

**English** · [Français](README.fr.md)

**Back up your databases in one click, from a desktop app.**

PostgreSQL · MySQL/MariaDB · SQLite · MongoDB — **100% local**: no data ever
leaves your machine, no server to install.

---

## Contents

- [Features](#features)
- [Install](#install)
- [Usage](#usage)
- [Engines & required tools](#engines--required-tools)
- [Security & privacy](#security--privacy)
- [Languages](#languages)
- [Development](#development)
- [Build & publish](#build--publish)
- [Documentation](#documentation)

---

## Features

- **Dumps** PostgreSQL, MySQL/MariaDB, SQLite and MongoDB.
- Formats tailored to each engine (custom, plain SQL, directory, archive…),
  **gzip compression**, and filters: schema only, data only, table exclusion.
- **pg_dump included on demand**: if PostgreSQL is not installed on the machine,
  DBDump downloads a portable build on the first dump — then works offline.
  Nothing to configure.
- Saved connections (encrypted), **connection test**, and a **live log** while
  the backup runs.
- **Scheduled backups**: every few hours, daily, on chosen weekdays, on a day of
  the month, or once at a given date. DBDump runs them in the background (menu
  bar icon, optional launch at login) and catches up a run missed while it was
  closed. Optional retention: keep only the last N backups.
- **Multiple destinations**, in parallel: local folder, external drive, NAS or
  network share, **SFTP**, **FTP/FTPS**, and **S3-compatible** storage (Amazon
  S3, MinIO, Cloudflare R2). One dump, several copies — with the option of
  deleting the local file once a destination has confirmed.
- **Monitoring**: free space on every volume and every destination, CPU and
  memory of the machine and of the dump tools, write speed and estimated time
  remaining while a backup runs.
- Available on **macOS** (Apple Silicon & Intel), **Windows** and **Linux**.
- Interface and messages in **English and French**.

---

## Install

Download the installer for your system from the
**[Releases page](../../releases/latest)**.

| System              | File to download             |
| ------------------- | ---------------------------- |
| macOS Apple Silicon | `dbdump_x.y.z_aarch64.dmg`   |
| macOS Intel         | `dbdump_x.y.z_x64.dmg`       |
| Windows 10 / 11     | `dbdump_x.y.z_x64-setup.exe` |
| Linux               | `.AppImage` or `.deb`        |

macOS builds are **signed and notarized by Apple**: the app opens normally, with
nothing to work around. On **Windows**, a SmartScreen warning may still appear on
first launch until code signing is deployed — here is how to get past it.

### macOS — no warning

The app is signed with an **Apple Developer ID** certificate and **notarized** by
Apple. Open the `.dmg` and drag `DBDump` into `Applications`: it starts right
away.

### Windows — “Windows protected your PC”

SmartScreen warns about applications that few people have downloaded yet. Click
**More info → Run anyway**. _(Code signing is being rolled out to remove this
warning.)_

### Linux

The AppImage runs directly (if needed: `chmod +x dbdump_*.AppImage`). The `.deb`
installs with `sudo dpkg -i dbdump_*.deb` or through your package manager.

---

## Usage

1. **Add a connection** — pick the engine, fill in host / port / user / database
   (or a file for SQLite). The **Test** button checks access before you save.
2. **Run a backup** — choose the format and options (compression, schema only,
   excluded tables…), then **Run the dump**. A window shows the progress and the
   live log.
3. **Get the file** — when it finishes: **Open folder** or **Copy to Downloads**.

---

## Engines & required tools

DBDump drives each engine's official tools. The app **tells you which ones are
missing** and how to install them on your system.

| Engine          | Tool        | Note                                     |
| --------------- | ----------- | ---------------------------------------- |
| PostgreSQL      | `pg_dump`   | **Downloaded automatically** if missing  |
| MySQL / MariaDB | `mysqldump` | To install (MySQL/MariaDB client)        |
| SQLite          | `sqlite3`   | Often already provided by the system     |
| MongoDB         | `mongodump` | MongoDB Database Tools                   |

> DBDump finds these tools **even when launched from the Finder or the Dock**,
> where apps do not inherit the terminal's `PATH`: it automatically extends
> `PATH` with the usual locations (Homebrew, PostgreSQL/MySQL/MongoDB
> installers…).

---

## Security & privacy

- **Everything stays local.** No data and no credential leaves your machine. No
  telemetry, no account.
- **Passwords never on the command line.** They are passed to the tools through
  environment variables (`PGPASSWORD`, `MYSQL_PWD`) or stdin (`mongodump`), never
  as an argument — argv is readable through `ps` by any user on the machine. The
  `Connection` type does not even have a `password` field: it cannot be
  serialized by accident.
- **Encrypted at rest.** Credentials are kept in an **AES-256-GCM** encrypted
  vault (`~/.dbdump/secrets.enc`); the connections file (`connections.enc`) is
  encrypted the same way. The local key (`~/.dbdump/secrets.key`, `0600`
  permissions) never leaves the machine.

- **Destination credentials** (SFTP/FTP passwords, key passphrases, S3 secret
  keys) live in that same vault, never in the configuration files.
- **SSH host keys are verified.** An SFTP destination whose host is not already
  in your `~/.ssh/known_hosts` is refused, with the fingerprint shown: accepting
  any key would hand your backups to anyone able to sit on the network. Run
  `ssh user@host` once, check the fingerprint, and DBDump will connect.

  > **A deliberate trade-off.** DBDump does not use the system keychain
  > (Keychain, Credential Manager, Secret Service): without a stable signing
  > certificate, it asks for the session password on every access. The file
  > vault removes that friction on every platform, at the cost of a key at rest
  > on disk. It protects against another user of the machine (`0600`
  > permissions), not against malware running under your own account.

---

## Languages

The whole platform ships in **English (primary) and French**:

- **Landing page** — English at `/`, French at `/fr/`. Each version is a real
  static page with its own `<html lang>`, canonical URL and `hreflang`
  alternates, so both are indexable.
- **App** (`/app/`, the window the desktop app loads) — one build, language
  resolved at runtime: the language you picked (stored in the browser), falling
  back to your system preferences, then English.
- **Backend messages** (install hints, connection test, dump errors and
  progress) are localized too: the frontend passes its language to each Tauri
  command. Output coming from `pg_dump` & co. is relayed verbatim — it is the
  exact cause, translating it would make it unsearchable.

Adding a string or a new language: see **[docs/en/i18n.md](docs/en/i18n.md)**.

---

## Development

### Structure

```
dbdump/
├── frontend/   Next.js + Tailwind + shadcn/ui — the whole UI + the landing page
└── desktop/    Tauri (Rust) — everything that touches the system
```

These are **not** workspaces: each folder has its own `package.json` and is
installed separately. Where to look:

| What you are looking for            | Where                                              |
| ----------------------------------- | -------------------------------------------------- |
| A screen, a form, a button          | `frontend/src/`                                    |
| Wording, translations               | `frontend/src/i18n/`, `desktop/src/i18n.rs`        |
| Running `pg_dump` & co.             | `desktop/src/commands.rs`, `desktop/src/runner.rs` |
| The arguments passed to the tools   | `desktop/src/engines.rs`                           |
| Locating binaries (PATH)            | `desktop/src/path_env.rs`                          |
| Passwords, encryption               | `desktop/src/secrets.rs`, `desktop/src/store.rs`   |
| Window, permissions                 | `desktop/tauri.conf.json`, `desktop/capabilities/` |

### Routes

One Next.js project produces the public site *and* the window embedded by the
desktop app:

| Route    | Output                | Role                                            |
| -------- | --------------------- | ----------------------------------------------- |
| `/`      | `out/index.html`      | English landing page                            |
| `/fr/`   | `out/fr/index.html`   | French landing page                             |
| `/app/`  | `out/app/index.html`  | Dump UI — loaded by Tauri, hidden by nginx      |

Each of the three has its own root layout (route groups `(en)`, `(fr)`, `(app)`)
so `<html lang>` is correct in the served HTML, without waiting for hydration.

### Prerequisites

Node 20+, Rust (through [rustup](https://rustup.rs)), and — for real dumps — the
tools of the engine you target (see [above](#engines--required-tools);
`pg_dump` downloads itself if missing).

### Run the app

```bash
# once
npm --prefix frontend install
npm --prefix desktop install

# the full app (starts the frontend automatically, port 1420)
npm --prefix desktop run dev
```

### Work on the UI without Rust

```bash
npm --prefix frontend run dev
```

Opened in a browser, the frontend switches to a **simulated backend**
(`frontend/src/lib/backend/mock.ts`): every screen is usable, error cases
included, but no real dump is produced. A “demo” badge is shown in the sidebar.

### How the two halves talk

`frontend/src/lib/backend/` defines a TypeScript contract (`Backend`) with two
implementations: `tauri.ts` (the real commands) and `mock.ts` (the browser).
`getBackend()` picks one based on the environment. **No React component calls
`invoke()` directly** — that keeps the UI testable outside of Tauri.

The frontend sends **structured options**, never a command. It is
`desktop/src/engines.rs` that builds the argv actually executed; letting the
screen dictate the command line would open an injection for nothing.
`frontend/src/lib/dump-command.ts` is a **display-only** mirror of it (the
copy-pasteable preview in the UI): the two must stay aligned.

### Tests

```bash
npm --prefix desktop run test   # cargo test
```

They lock down the key invariant: **no password in argv**, whatever the engine.

---

## Build & publish

Building the installers (macOS/Windows/Linux), signing and publishing through
GitHub Releases are described in **[docs/en/packaging.md](docs/en/packaging.md)**.

---

## Documentation

| Document                                  | Contents                                   |
| ----------------------------------------- | ------------------------------------------ |
| [docs/en/packaging.md](docs/en/packaging.md) | Build, signing, release, hosting        |
| [docs/en/i18n.md](docs/en/i18n.md)           | How the bilingual EN/FR system works    |

French versions: [docs/fr/](docs/fr/).

---

## License

[MIT](LICENSE).
