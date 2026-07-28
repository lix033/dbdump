import type {
  FaqId,
  FeatureId,
  FormatTexts,
  InstallHints,
  OsKey,
  StepId,
} from "@/i18n/dictionary-types";

/** Libellés des formats de dump. Annotés explicitement pour que le type reste
 *  large (et pas figé sur les littéraux anglais) : c'est ce type qui contraint
 *  les autres langues. */
const formats: FormatTexts = {
  postgres: {
    custom: {
      label: "Custom (.dump)",
      hint: "Compressed, allows selective restore with pg_restore. Recommended.",
    },
    plain: {
      label: "Plain SQL (.sql)",
      hint: "Readable and editable, restored with psql.",
    },
    directory: {
      label: "Directory",
      hint: "One file per table, the only format supporting parallel dumps.",
    },
  },
  mysql: {
    plain: {
      label: "Plain SQL (.sql)",
      hint: "The only format mysqldump produces.",
    },
  },
  sqlite: {
    plain: {
      label: "Plain SQL (.sql)",
      hint: "Text export through .dump.",
    },
    archive: {
      label: "File copy (.db)",
      hint: "Consistent copy through VACUUM INTO. The fastest option.",
    },
  },
  mongodb: {
    directory: {
      label: "BSON directory",
      hint: "mongodump's native format, restored with mongorestore.",
    },
    archive: {
      label: "Archive (.archive)",
      hint: "A single file, easier to move around.",
    },
  },
};

/** Repli utilisé par le backend simulé (navigateur). Sur desktop, le conseil
 *  vient de Rust, adapté à l'OS réel. */
const installHints: InstallHints = {
  postgres: "Install the PostgreSQL client tools for your system.",
  mysql: "Install the MySQL/MariaDB client tools for your system.",
  sqlite: "Usually shipped with the system (sqlite3).",
  mongodb: "Install the MongoDB Database Tools for your system.",
};

const features: Record<FeatureId, { title: string; text: string }> = {
  local: {
    title: "100% local",
    text: "Everything runs on your machine. No data and no password is ever sent to a third-party server.",
  },
  tools: {
    title: "The real tools",
    text: "DBDump drives the official binaries (pg_dump, mysqldump, mongodump, sqlite3): faithful, restorable dumps.",
  },
  pgdump: {
    title: "pg_dump included",
    text: "No PostgreSQL installed? DBDump downloads pg_dump automatically on your first dump. Nothing to configure.",
  },
  passwords: {
    title: "Passwords kept safe",
    text: "Your credentials live in a local AES-256-GCM encrypted vault, never in plain text — and never in the command line.",
  },
  options: {
    title: "Every option you need",
    text: "Schema only, data only, gzip, table exclusion, custom / SQL / directory formats… it is all there.",
  },
  progress: {
    title: "Live progress",
    text: "A window shows the tool's output as it runs — and the exact cause when something fails.",
  },
};

const steps: Record<StepId, { title: string; text: string }> = {
  install: {
    title: "Install",
    text: "Download the app for your system and open it. No dependency to install beforehand.",
  },
  connect: {
    title: "Add a connection",
    text: "Host, port, user, password. Test the connection in one click.",
  },
  folder: {
    title: "Pick a folder",
    text: "Choose where to save, which format to use and the options you need.",
  },
  run: {
    title: "Run the dump",
    text: "Follow the progress, then open the folder or grab the file that was produced.",
  },
};

const faq: Record<FaqId, { q: string; a: string }> = {
  tools: {
    q: "Do I need to install PostgreSQL / pg_dump first?",
    a: "No. If pg_dump is not already on your machine, DBDump downloads a portable build on your first PostgreSQL dump, then works offline. If you have your own installation, DBDump detects it and uses it first. MySQL and MongoDB require their official tools to be installed; SQLite is provided by the system.",
  },
  privacy: {
    q: "Is my data or are my passwords sent anywhere?",
    a: "Never. DBDump is a desktop application that runs entirely on your machine. Passwords and the connections file are stored in a local AES-256-GCM encrypted vault. No server, no telemetry.",
  },
  engines: {
    q: "Which databases are supported?",
    a: "PostgreSQL, MySQL / MariaDB, SQLite and MongoDB — each with its official dump tool and its options (schema only, data only, compression, table exclusion, custom / plain SQL / directory formats).",
  },
  warning: {
    q: "Will I get a security warning on launch?",
    a: "On macOS, no: the app is signed with an Apple Developer certificate and notarized by Apple, so it opens normally. On Windows, SmartScreen may show “Windows protected your PC” until code signing is deployed — click “More info”, then “Run anyway”.",
  },
};

const platforms: Record<OsKey, { name: string; arch: string; cta: string }> = {
  "mac-arm": { name: "macOS", arch: "Apple Silicon (M1–M4)", cta: "Download (.dmg)" },
  "mac-intel": { name: "macOS", arch: "Intel (x86-64)", cta: "Download (.dmg)" },
  windows: { name: "Windows", arch: "10 / 11 (x86-64)", cta: "Download (.exe)" },
  linux: { name: "Linux", arch: "AppImage / .deb", cta: "Download" },
};

export const en = {
  meta: {
    title: "DBDump — Back up your databases in one click",
    description:
      "Desktop app that dumps your PostgreSQL, MySQL, SQLite and MongoDB databases locally, with the official tools. No command line, no server, no data leaving your machine.",
  },

  common: {
    appName: "DBDump",
    tagline: "Database backups, locally",
    download: "Download",
    github: "GitHub",
    language: "Language",
    themeToLight: "Switch to light theme",
    themeToDark: "Switch to dark theme",
  },

  landing: {
    nav: {
      features: "Features",
      how: "How it works",
      docs: "Documentation",
    },
    hero: {
      badge: "Open source · your data never leaves your machine",
      titleLead: "Back up your databases",
      titleAccent: "in one click",
      subtitle:
        "DBDump is a desktop app that dumps your PostgreSQL, MySQL, SQLite and MongoDB databases with the real official tools — no command line, no server, no data leaks.",
      downloadFor: (os: string) => `Download for ${os}`,
      seeHow: "See how it works",
      bulletFree: "✓ Free & open source",
      bulletNoAccount: "✓ No account required",
      bulletPlatforms: "✓ macOS · Windows · Linux",
    },
    marquee: {
      title: "Works with your engines and their official tools",
    },
    preview: {
      connections: "Connections",
      running: "Running",
      done: "Done",
      destination: "~/Backups · custom format · gzip",
      /** Journal rejoué dans l'aperçu : même vocabulaire que l'app réelle. */
      log: [
        "pg_dump: connecting to localhost:5432",
        'pg_dump: reading schema of "app_prod"',
        "dumping table users",
        "dumping table orders",
        "dumping table products",
        "writing indexes and constraints",
        "done (18.4 MB) · app_prod_2026-07-27.dump",
      ] as string[],
    },
    features: {
      eyebrow: "Why DBDump",
      title: "As powerful as the command line, as simple as a click",
      subtitle: "All the robustness of pg_dump & co., in a clear interface.",
      items: features,
    },
    steps: {
      eyebrow: "In 4 steps",
      title: "From install to dump in two minutes",
      items: steps,
    },
    download: {
      eyebrow: "Download",
      title: "Choose your platform",
      subtitleDefault: "Free and ready to use.",
      latestVersion: (version: string) => `Latest version: ${version}`,
      recommended: "Recommended",
      platforms,
      notes: {
        releasesBefore: "Every build is on the ",
        releasesLink: "releases page",
        releasesAfter: ".",
        macosLabel: "macOS",
        macosText1:
          " — the app is signed with an Apple Developer certificate and notarized by Apple. Open the ",
        macosCode: ".dmg",
        macosText2: " and drag DBDump into Applications: it starts with no warning.",
        windowsLabel: "Windows",
        windowsText1: " — SmartScreen may show “Windows protected your PC”: click ",
        windowsCode1: "More info",
        windowsText2: " → ",
        windowsCode2: "Run anyway",
        windowsText3: ".",
      },
    },
    faq: {
      eyebrow: "Documentation",
      title: "Frequently asked questions",
      items: faq,
    },
    cta: {
      title: "Your next backup is two clicks away",
      subtitle:
        "Free, open source, no account. Install DBDump and run your first dump right after.",
      download: "Download DBDump",
      viewCode: "View the code",
    },
    footer: {
      tagline: "Database backups, locally",
    },
  },

  app: {
    sidebar: {
      subtitle: "Database backups",
      demo: "demo",
      newConnection: "New connection",
      connections: "Connections",
      emptyLine1: "No connection yet.",
      emptyLine2: "Add one to get started.",
      edit: "Edit",
      delete: "Delete",
    },
    empty: {
      titleChoose: "Choose a connection",
      titleWelcome: "Welcome to DBDump",
      textChoose: "Pick a database in the list to configure and run its backup.",
      textWelcome:
        "Connect a PostgreSQL, MySQL, SQLite or MongoDB database, then export it in one click to the folder of your choice.",
      addConnection: "Add a connection",
    },
    toast: {
      connectionAdded: "Connection added",
      connectionUpdated: "Connection updated",
      connectionDeleted: "Connection deleted",
      copiedToDownloads: "Copied to Downloads",
      copyFailed: "Copy failed",
      downloadFailed: "Download failed",
    },
    form: {
      newTitle: "New connection",
      editTitle: "Edit connection",
      description: "Password stored in a local encrypted vault, never in plain text.",
      name: "Name",
      namePlaceholder: "Production DB",
      engine: "Engine",
      file: "Database file",
      noFile: "No file selected",
      /** Nom du filtre dans le sélecteur de fichier natif. */
      fileFilter: "SQLite database",
      host: "Host",
      port: "Port",
      username: "User",
      password: "Password",
      passwordUnchanged: "Unchanged",
      database: "Database",
      ssl: "SSL",
      sslDisable: "Disabled",
      sslPrefer: "Preferred",
      sslRequire: "Required",
      serverInfo: (version: string, latencyMs: number) =>
        `Version ${version} · ${latencyMs} ms`,
      test: "Test",
      cancel: "Cancel",
      save: "Save",
    },
    panel: {
      binaryToDownload: (binary: string) => `${binary} · to download`,
      binaryMissing: (binary: string) => `${binary} missing`,
      provisionTitle: (binary: string) =>
        `${binary} will be downloaded automatically on the first dump`,
      provisionTextBefore:
        "Nothing to install: DBDump fetches a portable PostgreSQL build (once, then offline). You can also install your own with ",
      provisionTextAfter: ".",
      missingTitle: (binary: string) => `${binary} is not installed on this machine`,
      missingTextBefore:
        "DBDump relies on the engine's official tools. Install it with ",
      missingTextAfter: ".",
      destination: {
        title: "Destination",
        hintDesktop: "Where to save the backup",
        hintWeb: "Where the file lands",
        pick: "Pick a folder…",
        browse: "Browse",
        webNoteBefore: "In web mode, just run the dump: the file is ",
        webNoteStrong: "downloaded automatically",
        webNoteAfter: " when it finishes (a button lets you download it again).",
        fileName: "File name",
        pickFolderFirst: "Choose a destination folder",
      },
      format: {
        title: "Format",
        hint: "Type of file produced",
      },
      options: {
        title: "Options",
        hint: "What goes into the dump",
        schemaOnly: {
          label: "Schema only",
          hint: "No data, only the CREATE TABLE statements.",
        },
        dataOnly: {
          label: "Data only",
          hint: "No schema, only the INSERT statements.",
        },
        clean: {
          label: "Clean before restore",
          hint: "Adds DROP statements before the CREATE ones.",
        },
        gzip: {
          label: "Compress (gzip)",
          hint: "Reduces the size of the file produced.",
        },
        excludeTables: "Tables to exclude",
        excludeHint: "One table per line.",
      },
      command: {
        title: "Command executed",
        hint: "Copy-pasteable into a terminal",
      },
      run: "Run the dump",
      running: "Dump running…",
    },
    progress: {
      titleRunning: "Backup running…",
      titleSuccess: "Backup complete",
      titleError: "Backup failed",
      written: (size: string) => `${size} written`,
      errorHeading: "Cause reported by the tool",
      cancel: "Cancel",
      close: "Close",
      retry: "Retry",
      copyToDownloads: "Copy to Downloads",
      openFolder: "Open folder",
      download: "Download",
    },
    /** Unités d'octets : les abréviations diffèrent d'une langue à l'autre. */
    bytes: { b: "B", kb: "KB", mb: "MB" },
    formats,
    installHints,
  },

  /** Backend simulé du navigateur : ses messages sont visibles en mode démo. */
  mock: {
    downloadDirLabel: "Browser downloads",
    fileReadable: "File is readable",
    noFileSelected: "No file selected",
    missingHost: "Missing host",
    authRefused: (user: string) => `Authentication failed for "${user}"`,
    connected: "Connection established",
    connecting: (binary: string, target: string) => `${binary}: connecting to ${target}`,
    readingSchema: (binary: string, database: string) =>
      `${binary}: reading schema of "${database}"`,
    dumpingTable: (table: string) => `dumping table ${table}`,
    writingIndexes: "writing indexes and constraints",
    cancelled: "Dump cancelled",
    prepareFailed: (cause: string) => `Could not prepare the file: ${cause}`,
    downloading: (fileName: string) => `downloading ${fileName}`,
    finished: (bytes: number) => `done (${bytes} bytes)`,
    nothingToDownload: "No file to download for this dump.",
    unavailableOnWeb: "Not available in web mode.",
  },

  /** Contenu du fichier produit par la démo web (commentaires du dump). */
  demo: {
    header: "DBDump (web demo) — simulated export",
    generatedOn: (date: string) => `Generated on ${date}`,
    engine: (label: string, tool: string) => `Engine: ${label} · tool: ${tool}`,
    database: (database: string) => `Database: ${database}`,
    options: (summary: string) => `Options: ${summary}`,
    fakeWarning: (tool: string) => `⚠ Fake content: in the desktop app, ${tool} writes`,
    fakeWarningCont: "  the real dump of your database here.",
    optSchemaOnly: "schema only",
    optDataOnly: "data only",
    optClean: "clean/drop",
    optExcludes: (tables: string) => `excludes ${tables}`,
    tableHeading: (table: string) => `Table: ${table}`,
    endOfDump: (database: string) => `End of dump for ${database}.`,
    theDatabase: "the database",
    mongoNotice: "Text preview (mongodump produces binary BSON).",
    mongoSchemaOnly: "(schema only — documents omitted)",
    sampleProducts: ["Mechanical keyboard", "Ergonomic mouse", '27" monitor'] as string[],
  },
};

/** L'anglais fait foi : c'est lui qui décrit la forme du dictionnaire. Toute
 *  autre langue doit satisfaire ce type — une clé oubliée ou renommée casse la
 *  compilation plutôt que l'affichage. */
export type Dictionary = typeof en;
