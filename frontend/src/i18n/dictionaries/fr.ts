import type {
  FaqId,
  FeatureId,
  FormatTexts,
  InstallHints,
  OsKey,
  StepId,
} from "@/i18n/dictionary-types";
import type { Dictionary } from "./en";

const formats: FormatTexts = {
  postgres: {
    custom: {
      label: "Custom (.dump)",
      hint: "Compressé, restauration sélective avec pg_restore. Recommandé.",
    },
    plain: {
      label: "SQL brut (.sql)",
      hint: "Lisible et éditable, restauration avec psql.",
    },
    directory: {
      label: "Répertoire",
      hint: "Un fichier par table, seul format supportant le dump parallèle.",
    },
  },
  mysql: {
    plain: {
      label: "SQL brut (.sql)",
      hint: "Le seul format produit par mysqldump.",
    },
  },
  sqlite: {
    plain: {
      label: "SQL brut (.sql)",
      hint: "Export texte via .dump.",
    },
    archive: {
      label: "Copie du fichier (.db)",
      hint: "Copie cohérente via VACUUM INTO. Le plus rapide.",
    },
  },
  mongodb: {
    directory: {
      label: "Répertoire BSON",
      hint: "Format natif mongodump, restauration avec mongorestore.",
    },
    archive: {
      label: "Archive (.archive)",
      hint: "Un seul fichier, plus simple à déplacer.",
    },
  },
};

const installHints: InstallHints = {
  postgres: "Installez les outils PostgreSQL (client) pour votre système.",
  mysql: "Installez les outils client MySQL/MariaDB pour votre système.",
  sqlite: "Généralement fourni par le système (sqlite3).",
  mongodb: "Installez les MongoDB Database Tools pour votre système.",
};

const features: Record<FeatureId, { title: string; text: string }> = {
  local: {
    title: "100 % local",
    text: "Tout s'exécute sur votre machine. Aucune donnée ni mot de passe n'est envoyé sur un serveur tiers.",
  },
  tools: {
    title: "Les vrais outils",
    text: "DBDump pilote les binaires officiels (pg_dump, mysqldump, mongodump, sqlite3) : des dumps fidèles et restaurables.",
  },
  pgdump: {
    title: "pg_dump inclus",
    text: "PostgreSQL pas installé ? DBDump télécharge automatiquement pg_dump au premier dump. Rien à configurer.",
  },
  passwords: {
    title: "Mots de passe protégés",
    text: "Vos identifiants vivent dans un coffre local chiffré en AES-256-GCM, jamais en clair — ni dans la ligne de commande.",
  },
  options: {
    title: "Options complètes",
    text: "Structure seule, données seules, gzip, exclusion de tables, formats custom / SQL / répertoire… tout est là.",
  },
  progress: {
    title: "Progression en direct",
    text: "Une fenêtre affiche l'avancement et la sortie de l'outil en temps réel — et la cause exacte en cas d'échec.",
  },
};

const steps: Record<StepId, { title: string; text: string }> = {
  install: {
    title: "Installez",
    text: "Téléchargez l'app pour votre système et ouvrez-la. Aucune dépendance à installer au préalable.",
  },
  connect: {
    title: "Ajoutez une connexion",
    text: "Hôte, port, utilisateur, mot de passe. Testez la connexion en un clic.",
  },
  folder: {
    title: "Choisissez le dossier",
    text: "Sélectionnez où enregistrer, le format et les options qui vous conviennent.",
  },
  run: {
    title: "Lancez le dump",
    text: "Suivez la progression, puis ouvrez le dossier ou récupérez le fichier produit.",
  },
};

const faq: Record<FaqId, { q: string; a: string }> = {
  tools: {
    q: "Dois-je installer PostgreSQL / pg_dump avant ?",
    a: "Non. Si pg_dump n'est pas déjà sur votre machine, DBDump télécharge automatiquement une version portable au premier dump PostgreSQL, puis fonctionne hors-ligne. Si vous avez votre propre installation, DBDump la détecte et la privilégie. Pour MySQL et MongoDB, les outils officiels doivent être installés ; SQLite est fourni par le système.",
  },
  privacy: {
    q: "Mes données ou mots de passe sont-ils envoyés quelque part ?",
    a: "Jamais. DBDump est une application de bureau qui s'exécute entièrement sur votre machine. Les mots de passe et le fichier de connexions sont rangés dans un coffre local chiffré en AES-256-GCM. Aucun serveur, aucune télémétrie.",
  },
  engines: {
    q: "Quelles bases sont supportées ?",
    a: "PostgreSQL, MySQL / MariaDB, SQLite et MongoDB — chacune avec son outil de dump officiel et ses options (structure seule, données seules, compression, exclusion de tables, formats custom / SQL brut / répertoire).",
  },
  warning: {
    q: "Vais-je voir un avertissement de sécurité au lancement ?",
    a: "Sur macOS, non : l'application est signée avec un certificat Apple Developer et notarisée par Apple, elle s'ouvre normalement. Sur Windows, SmartScreen peut afficher « Windows a protégé votre ordinateur » tant que la signature de code n'est pas déployée — cliquez « Informations complémentaires » puis « Exécuter quand même ».",
  },
};

const platforms: Record<OsKey, { name: string; arch: string; cta: string }> = {
  "mac-arm": { name: "macOS", arch: "Apple Silicon (M1–M4)", cta: "Télécharger (.dmg)" },
  "mac-intel": { name: "macOS", arch: "Intel (x86-64)", cta: "Télécharger (.dmg)" },
  windows: { name: "Windows", arch: "10 / 11 (x86-64)", cta: "Télécharger (.exe)" },
  linux: { name: "Linux", arch: "AppImage / .deb", cta: "Télécharger" },
};

export const fr: Dictionary = {
  meta: {
    title: "DBDump — Sauvegardez vos bases de données en un clic",
    description:
      "Application de bureau qui dumpe vos bases PostgreSQL, MySQL, SQLite et MongoDB en local, avec les outils officiels. Sans ligne de commande, sans serveur, sans fuite de données.",
  },

  common: {
    appName: "DBDump",
    tagline: "Sauvegardes de bases, en local",
    download: "Télécharger",
    github: "GitHub",
    language: "Langue",
    themeToLight: "Passer en clair",
    themeToDark: "Passer en sombre",
  },

  landing: {
    nav: {
      features: "Fonctionnalités",
      how: "Comment ça marche",
      docs: "Documentation",
    },
    hero: {
      badge: "Open source · vos données ne quittent jamais votre machine",
      titleLead: "Sauvegardez vos bases de données",
      titleAccent: "en un clic",
      subtitle:
        "DBDump est une application de bureau qui dumpe vos bases PostgreSQL, MySQL, SQLite et MongoDB avec les vrais outils officiels — sans ligne de commande, sans serveur, sans fuite de données.",
      downloadFor: (os: string) => `Télécharger pour ${os}`,
      seeHow: "Voir comment ça marche",
      bulletFree: "✓ Gratuit & open source",
      bulletNoAccount: "✓ Aucun compte requis",
      bulletPlatforms: "✓ macOS · Windows · Linux",
    },
    marquee: {
      title: "Compatible avec vos moteurs et leurs outils officiels",
    },
    preview: {
      connections: "Connexions",
      running: "En cours",
      done: "Terminé",
      destination: "~/Backups · format custom · gzip",
      log: [
        "pg_dump: connexion à localhost:5432",
        'pg_dump: lecture du schéma de "app_prod"',
        "dumping table users",
        "dumping table orders",
        "dumping table products",
        "écriture des index et contraintes",
        "terminé (18,4 Mo) · app_prod_2026-07-27.dump",
      ],
    },
    features: {
      eyebrow: "Pourquoi DBDump",
      title: "Puissant comme la ligne de commande, simple comme un clic",
      subtitle: "Toute la robustesse de pg_dump & co., dans une interface claire.",
      items: features,
    },
    steps: {
      eyebrow: "En 4 étapes",
      title: "De l'installation au dump en deux minutes",
      items: steps,
    },
    download: {
      eyebrow: "Téléchargement",
      title: "Choisissez votre plateforme",
      subtitleDefault: "Gratuit et prêt à l'emploi.",
      latestVersion: (version: string) => `Dernière version : ${version}`,
      recommended: "Recommandé",
      platforms,
      notes: {
        releasesBefore: "Toutes les versions sont sur la ",
        releasesLink: "page des releases",
        releasesAfter: ".",
        macosLabel: "macOS",
        macosText1:
          " — l'app est signée avec un certificat Apple Developer et notarisée par Apple. Ouvrez le ",
        macosCode: ".dmg",
        macosText2:
          " et glissez DBDump dans Applications : elle démarre sans avertissement.",
        windowsLabel: "Windows",
        windowsText1:
          " — SmartScreen peut afficher « Windows a protégé votre ordinateur » : cliquez ",
        windowsCode1: "Informations complémentaires",
        windowsText2: " → ",
        windowsCode2: "Exécuter quand même",
        windowsText3: ".",
      },
    },
    faq: {
      eyebrow: "Documentation",
      title: "Questions fréquentes",
      items: faq,
    },
    cta: {
      title: "Votre prochaine sauvegarde est à deux clics",
      subtitle:
        "Gratuit, open source, sans compte. Installez DBDump et lancez votre premier dump dans la foulée.",
      download: "Télécharger DBDump",
      viewCode: "Voir le code",
    },
    footer: {
      tagline: "Sauvegardes de bases, en local",
    },
  },

  app: {
    sidebar: {
      subtitle: "Sauvegardes de bases",
      demo: "démo",
      newConnection: "Nouvelle connexion",
      connections: "Connexions",
      emptyLine1: "Aucune connexion pour l'instant.",
      emptyLine2: "Ajoutez-en une pour démarrer.",
      edit: "Modifier",
      delete: "Supprimer",
    },
    empty: {
      titleChoose: "Choisissez une connexion",
      titleWelcome: "Bienvenue sur DBDump",
      textChoose:
        "Sélectionnez une base dans la liste pour configurer et lancer sa sauvegarde.",
      textWelcome:
        "Connectez une base PostgreSQL, MySQL, SQLite ou MongoDB, puis exportez-la en un clic vers le dossier de votre choix.",
      addConnection: "Ajouter une connexion",
    },
    toast: {
      connectionAdded: "Connexion ajoutée",
      connectionUpdated: "Connexion modifiée",
      connectionDeleted: "Connexion supprimée",
      copiedToDownloads: "Copié dans Téléchargements",
      copyFailed: "Copie impossible",
      downloadFailed: "Téléchargement impossible",
    },
    form: {
      newTitle: "Nouvelle connexion",
      editTitle: "Modifier la connexion",
      description: "Mot de passe rangé dans un coffre local chiffré, jamais en clair.",
      name: "Nom",
      namePlaceholder: "DB production",
      engine: "Moteur",
      file: "Fichier de base",
      noFile: "Aucun fichier sélectionné",
      fileFilter: "Base SQLite",
      host: "Hôte",
      port: "Port",
      username: "Utilisateur",
      password: "Mot de passe",
      passwordUnchanged: "Inchangé",
      database: "Base",
      ssl: "SSL",
      sslDisable: "Désactivé",
      sslPrefer: "Préféré",
      sslRequire: "Requis",
      serverInfo: (version: string, latencyMs: number) =>
        `Version ${version} · ${latencyMs} ms`,
      test: "Tester",
      cancel: "Annuler",
      save: "Enregistrer",
    },
    panel: {
      binaryToDownload: (binary: string) => `${binary} · à télécharger`,
      binaryMissing: (binary: string) => `${binary} absent`,
      provisionTitle: (binary: string) =>
        `${binary} sera téléchargé automatiquement au premier dump`,
      provisionTextBefore:
        "Aucune installation requise : DBDump récupère une version portable de PostgreSQL (une fois, puis hors-ligne). Vous pouvez aussi installer la vôtre avec ",
      provisionTextAfter: ".",
      missingTitle: (binary: string) => `${binary} n'est pas installé sur cette machine`,
      missingTextBefore:
        "DBDump s'appuie sur les outils officiels du moteur. Installez-le avec ",
      missingTextAfter: ".",
      destination: {
        title: "Destination",
        hintDesktop: "Où enregistrer la sauvegarde",
        hintWeb: "Où atterrit le fichier",
        pick: "Choisir un dossier…",
        browse: "Parcourir",
        webNoteBefore: "En mode web, lancez le dump : le fichier se ",
        webNoteStrong: "télécharge automatiquement",
        webNoteAfter: " à la fin (bouton pour le relancer si besoin).",
        fileName: "Nom du fichier",
        pickFolderFirst: "Choisissez un dossier de destination",
      },
      format: {
        title: "Format",
        hint: "Type de fichier produit",
      },
      options: {
        title: "Options",
        hint: "Ce que contient le dump",
        schemaOnly: {
          label: "Structure seulement",
          hint: "Aucune donnée, uniquement les CREATE TABLE.",
        },
        dataOnly: {
          label: "Données seulement",
          hint: "Aucun schéma, uniquement les INSERT.",
        },
        clean: {
          label: "Nettoyer avant restauration",
          hint: "Ajoute les DROP avant les CREATE.",
        },
        gzip: {
          label: "Compresser (gzip)",
          hint: "Réduit la taille du fichier produit.",
        },
        excludeTables: "Tables à exclure",
        excludeHint: "Une table par ligne.",
      },
      command: {
        title: "Commande exécutée",
        hint: "Copiable dans un terminal",
      },
      run: "Lancer le dump",
      running: "Dump en cours…",
    },
    progress: {
      titleRunning: "Sauvegarde en cours…",
      titleSuccess: "Sauvegarde terminée",
      titleError: "La sauvegarde a échoué",
      written: (size: string) => `${size} écrits`,
      errorHeading: "Cause remontée par l'outil",
      cancel: "Annuler",
      close: "Fermer",
      retry: "Réessayer",
      copyToDownloads: "Copier vers Téléchargements",
      openFolder: "Ouvrir le dossier",
      download: "Télécharger",
    },
    bytes: { b: "o", kb: "Ko", mb: "Mo", gb: "Go", tb: "To" },
    duration: { minutes: "min", hours: "h" },
    nav: {
      connections: "Bases",
      schedules: "Programmations",
      destinations: "Destinations",
      monitoring: "Surveillance",
    },
    monitoring: {
      title: "Surveillance",
      machine: "Cette machine",
      cpu: "Processeur",
      memory: "Mémoire",
      dumpUsage: "Outils de sauvegarde",
      dumpIdle: "Aucune sauvegarde en cours",
      dumpRunning: (count: number) =>
        count === 1 ? "1 sauvegarde en cours" : `${count} sauvegardes en cours`,
      volumes: "Volumes",
      destinations: "Destinations",
      destinationsNone: "Aucune destination configurée.",
      spaceUnknown: "Non communiqué",
      used: (percent: number) => `${percent} % utilisés`,
      free: (value: string) => `${value} libres`,
      speed: "Débit d'écriture",
      remaining: "Temps restant",
      unknown: "—",
      refreshed: "Rafraîchi toutes les 2 s",
      webNotice:
        "En mode web ces chiffres sont simulés : un navigateur ne peut pas lire la machine. L'app de bureau affiche les vrais.",
    },
    picker: {
      title: "Envoyer aussi vers",
      none: "Aucune destination configurée. Ajoutez-en une dans l'écran Destinations pour envoyer aussi cette sauvegarde vers un NAS, un serveur SFTP ou S3.",
      keepLocal: "Garder la copie locale",
      keepLocalHint: "Le fichier reste dans le dossier ci-dessus et part aussi vers les destinations.",
      removeLocalHint:
        "Le fichier local est supprimé dès qu'au moins une destination a confirmé. Rien n'est supprimé si toutes échouent.",
      deliveries: "Destinations",
    },
    destinations: {
      title: "Destinations",
      new: "Nouvelle destination",
      emptyLine1: "Aucune destination.",
      emptyLine2: "Ajoutez-en une pour envoyer vos sauvegardes.",
      welcomeTitle: "Envoyez vos sauvegardes où vous voulez",
      welcomeText:
        "Un dossier local, un disque externe, un NAS ou un partage réseau, un serveur SFTP ou FTP, Amazon S3, MinIO ou Cloudflare R2. Un dump peut partir vers plusieurs à la fois.",
      welcomeCta: "Ajouter une destination",
      chooseTitle: "Choisissez une destination",
      chooseText: "Sélectionnez-en une dans la liste pour la tester ou la modifier.",
      test: "Tester",
      testing: "Test…",
      edit: "Modifier",
      delete: "Supprimer",
      freeSpace: "Espace libre",
      spaceOf: (free: string, total: string) => `${free} libres sur ${total}`,
      spaceUnknown: "Non communiqué",
      usedBy: "Utilisée par",
      usedByNone: "Aucune programmation ne l'utilise.",
      usedBySchedules: (count: number) =>
        count === 1 ? "1 programmation" : `${count} programmations`,
      kinds: {
        folder: {
          label: "Dossier",
          hint: "Disque local, disque externe, NAS ou partage réseau monté par le système.",
        },
        sftp: { label: "SFTP", hint: "Transfert de fichiers via SSH. Chiffré." },
        ftp: { label: "FTP", hint: "Serveur FTP classique, avec TLS en option." },
        s3: {
          label: "Compatible S3",
          hint: "Amazon S3, MinIO, Cloudflare R2 — même protocole.",
        },
      },
      toast: {
        created: "Destination ajoutée",
        updated: "Destination modifiée",
        deleted: "Destination supprimée",
      },
      form: {
        newTitle: "Nouvelle destination",
        editTitle: "Modifier la destination",
        description:
          "Les secrets sont rangés dans le coffre local chiffré, jamais en clair.",
        name: "Nom",
        namePlaceholder: "NAS du bureau",
        kind: "Type",
        path: "Dossier",
        browse: "Parcourir",
        host: "Hôte",
        port: "Port",
        username: "Utilisateur",
        password: "Mot de passe",
        passwordUnchanged: "Inchangé",
        remoteDir: "Dossier distant",
        privateKey: "Clé privée (facultatif)",
        privateKeyHint:
          "Laissez vide pour vous authentifier par mot de passe. Sinon, le champ mot de passe contient la phrase de passe de la clé.",
        pickKey: "Choisir",
        knownHostsNotice:
          "L'hôte doit déjà figurer dans votre ~/.ssh/known_hosts : lancez une fois `ssh utilisateur@hôte` et acceptez l'empreinte. DBDump refuse de faire confiance à une clé inconnue.",
        tls: "FTPS (TLS)",
        tlsHint: "Sans TLS, mot de passe et données circulent en clair.",
        endpoint: "Endpoint",
        endpointHint: "Laissez vide pour Amazon S3. Obligatoire pour MinIO et R2.",
        region: "Région",
        bucket: "Bucket",
        prefix: "Préfixe (facultatif)",
        accessKeyId: "Identifiant de clé d'accès",
        secretAccessKey: "Clé secrète",
        pathStyle: "URL en style chemin",
        pathStyleHint: "Exigé par la plupart des installations MinIO.",
        cancel: "Annuler",
        save: "Enregistrer",
        missingName: "Donnez un nom à la destination.",
        missingPath: "Choisissez un dossier.",
        missingHost: "Renseignez l'hôte.",
        missingBucket: "Renseignez le nom du bucket.",
      },
    },
    schedules: {
      title: "Programmations",
      new: "Nouvelle programmation",
      emptyLine1: "Aucune programmation.",
      emptyLine2: "Automatisez une sauvegarde.",
      welcomeTitle: "Sauvegardes automatiques",
      welcomeText:
        "Sauvegardez toutes les quelques heures, chaque jour, les jours de semaine de votre choix, à date fixe dans le mois, ou une seule fois à une date donnée. Les programmations tournent tant que DBDump est ouvert ; celles qui ont été manquées sont rattrapées au lancement suivant.",
      welcomeCta: "Créer une programmation",
      chooseTitle: "Choisissez une programmation",
      chooseText: "Sélectionnez-en une dans la liste pour voir ses prochaines exécutions et son historique.",
      needsConnection:
        "Ajoutez d'abord une connexion : une programmation sauvegarde l'une de vos bases.",
      active: "Active",
      paused: "En pause",
      runNow: "Exécuter",
      running: "En cours…",
      edit: "Modifier",
      delete: "Supprimer",
      nextRun: "Prochaine",
      lastRun: "Dernière",
      never: "Jamais",
      noNextRun: "Rien de prévu",
      destination: "Destination",
      keepLast: "Conserver",
      keepAll: "Toutes les sauvegardes",
      keepLastValue: (count: number) => `Les ${count} dernières`,
      autostart: {
        label: "Lancer au démarrage",
        hint: "DBDump attend dans la barre de menus. Fermer la fenêtre ne quitte plus l'app.",
        failed: "Impossible de changer le lancement au démarrage",
      },
      history: "Historique",
      historyEmpty: "Cette programmation n'a pas encore tourné.",
      caughtUp: "rattrapage",
      status: {
        running: "En cours",
        success: "Terminé",
        failed: "Échec",
        cancelled: "Annulé",
      },
      summary: {
        interval: (every: string) => `Toutes les ${every}`,
        daily: (time: string) => `Chaque jour à ${time}`,
        weekly: (days: string, time: string) => `${days} à ${time}`,
        monthly: (day: number, time: string) => `Le ${day} du mois à ${time}`,
        once: (when: string) => `Une fois, le ${when}`,
        frozen: "Programmation incomplète",
      },
      toast: {
        created: "Programmation créée",
        updated: "Programmation modifiée",
        deleted: "Programmation supprimée",
        started: "Sauvegarde lancée",
        enabled: "Programmation reprise",
        disabled: "Programmation mise en pause",
        failed: "Échec de la programmation",
      },
      form: {
        newTitle: "Nouvelle programmation",
        editTitle: "Modifier la programmation",
        description:
          "DBDump l'exécute en fond tant que l'app est ouverte, et rattrape une exécution manquée au lancement suivant.",
        name: "Nom",
        namePlaceholder: "Sauvegarde nocturne production",
        connection: "Base",
        when: "Quand",
        kind: {
          interval: "Toutes les N heures",
          daily: "Chaque jour",
          weekly: "Jours de la semaine",
          monthly: "Jour du mois",
          once: "Une seule fois",
        },
        every: "Toutes les",
        time: "À",
        weekdays: "Jours",
        dayOfMonth: "Jour",
        date: "Date et heure",
        clampNotice: "Les mois plus courts retombent sur leur dernier jour.",
        destination: "Dossier de destination",
        browse: "Parcourir",
        noFolder: "Aucun dossier sélectionné",
        fileName: "Nom du fichier",
        fileNameHint: "Jetons : {db}, {name}, {engine}, {date}, {time}, {datetime}",
        preview: (name: string) => `ex. ${name}`,
        format: "Format",
        options: "Options",
        schemaOnly: "Schéma seul",
        dataOnly: "Données seules",
        clean: "Ajouter DROP avant CREATE",
        gzip: "Compression gzip",
        excludeTables: "Tables exclues",
        excludeHint: "Une par ligne",
        retention: "Rétention",
        retentionHint:
          "Les sauvegardes plus anciennes de cette programmation sont supprimées après une exécution réussie. Uniquement les fichiers écrits par DBDump.",
        enabled: "Active dès l'enregistrement",
        nextRunPreview: (when: string) => `Prochaine exécution : ${when}`,
        nextRunNever:
          "Cette programmation ne se déclenchera jamais : vérifiez l'heure et les jours.",
        cancel: "Annuler",
        save: "Enregistrer",
        missingName: "Donnez un nom à la programmation.",
        missingConnection: "Choisissez une base.",
        missingDestination: "Choisissez un dossier de destination.",
      },
    },
    formats,
    installHints,
  },

  mock: {
    downloadDirLabel: "Téléchargements du navigateur",
    fileReadable: "Fichier lisible",
    noFileSelected: "Aucun fichier sélectionné",
    missingHost: "Hôte manquant",
    authRefused: (user: string) => `Authentification refusée pour "${user}"`,
    connected: "Connexion établie",
    connecting: (binary: string, target: string) => `${binary}: connexion à ${target}`,
    readingSchema: (binary: string, database: string) =>
      `${binary}: lecture du schéma de "${database}"`,
    dumpingTable: (table: string) => `dumping table ${table}`,
    writingIndexes: "écriture des index et contraintes",
    cancelled: "Dump annulé",
    prepareFailed: (cause: string) => `Impossible de préparer le fichier : ${cause}`,
    downloading: (fileName: string) => `téléchargement de ${fileName}`,
    finished: (bytes: number) => `terminé (${bytes} octets)`,
    nothingToDownload: "Aucun fichier à télécharger pour ce dump.",
    unavailableOnWeb: "Indisponible en mode web.",
    missingBucket: "Renseignez le nom du bucket.",
    destinationReady: "Destination joignable (simulation)",
    scheduleMissing: "Cette programmation n'existe plus.",
    scheduleConnectionMissing: "La connexion visée par cette programmation n'existe plus.",
  },

  demo: {
    header: "DBDump (démo web) — export simulé",
    generatedOn: (date: string) => `Généré le ${date}`,
    engine: (label: string, tool: string) => `Moteur : ${label} · outil : ${tool}`,
    database: (database: string) => `Base : ${database}`,
    options: (summary: string) => `Options : ${summary}`,
    fakeWarning: (tool: string) =>
      `⚠ Contenu factice : en application de bureau, ${tool} produit`,
    fakeWarningCont: "  ici le dump réel de votre base.",
    optSchemaOnly: "structure seule",
    optDataOnly: "données seules",
    optClean: "clean/drop",
    optExcludes: (tables: string) => `exclut ${tables}`,
    tableHeading: (table: string) => `Table : ${table}`,
    endOfDump: (database: string) => `Fin du dump de ${database}.`,
    theDatabase: "la base",
    mongoNotice: "Aperçu textuel (mongodump produit du BSON binaire).",
    mongoSchemaOnly: "(structure seule — documents omis)",
    sampleProducts: ["Clavier mécanique", "Souris ergonomique", 'Écran 27"'],
  },
};
