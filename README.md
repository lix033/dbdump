# DBDump

Sauvegarde de bases PostgreSQL, MySQL/MariaDB, SQLite et MongoDB depuis une app
de bureau. Aucun serveur à installer, aucune donnée envoyée ailleurs.

## Deux projets distincts

```
dbdump/
├── frontend/   Next.js + Tailwind + shadcn/ui — tout l'écran
└── desktop/    Tauri (Rust) — tout ce qui touche au système
```

Ce ne sont pas des workspaces : chaque dossier a son `package.json` et
s'installe séparément. La règle pour savoir où chercher :

| Ce que vous cherchez | Où |
| --- | --- |
| Un écran, un formulaire, un bouton | `frontend/src/` |
| L'exécution de `pg_dump` & co. | `desktop/src/commands.rs` |
| Les arguments passés aux outils | `desktop/src/engines.rs` |
| Mots de passe, chiffrement | `desktop/src/secrets.rs`, `desktop/src/store.rs` |
| Fenêtre, permissions | `desktop/tauri.conf.json`, `desktop/capabilities/` |

## Démarrer

Prérequis : Node 20+, Rust (`rustup`), et les outils du moteur visé
(`pg_dump`, `mysqldump`, `sqlite3`, `mongodump`) — l'app dit lesquels manquent.

```bash
# une fois
npm --prefix frontend install
npm --prefix desktop install

# l'app complète (lance le frontend tout seul)
npm --prefix desktop run dev
```

Le frontend tourne sur le port **1420**.

### Travailler sur l'UI sans Rust

```bash
npm --prefix frontend run dev
```

Ouvert dans un navigateur, le frontend bascule sur un backend simulé
(`frontend/src/lib/backend/mock.ts`) : les écrans sont pilotables, y compris les
cas d'erreur, mais aucun vrai dump n'est produit. Un badge « navigateur » le
rappelle dans la barre latérale.

## Comment les deux moitiés se parlent

`frontend/src/lib/backend/` définit un contrat TypeScript (`Backend`) avec deux
implémentations : `tauri.ts` (les vraies commandes) et `mock.ts` (le navigateur).
`getBackend()` choisit selon l'environnement. **Aucun composant React n'appelle
`invoke()` directement** — ça garde l'UI testable hors de Tauri.

Le frontend envoie des **options structurées**, jamais une commande. C'est
`desktop/src/engines.rs` qui construit l'argv réellement exécuté ; laisser
l'écran dicter la ligne de commande ouvrirait une injection pour rien.
`frontend/src/lib/dump-command.ts` en est un miroir **d'affichage seulement**
(l'aperçu copiable dans l'UI) : les deux doivent rester alignés.

## Sécurité

Les mots de passe des bases vont dans le trousseau système, jamais sur le
disque de l'app — le type `Connection` n'a même pas de champ `password`, donc on
ne peut pas le sérialiser par accident. Ils sont passés aux outils par variable
d'environnement (`PGPASSWORD`, `MYSQL_PWD`) ou sur stdin (`mongodump`), jamais en
argument : l'argv est lisible dans `ps` par tout utilisateur de la machine.

Le fichier des connexions (`connections.enc`) est chiffré en AES-256-GCM avec une
clé maître elle-même rangée dans le trousseau.

## Tests

```bash
npm --prefix desktop run test   # cargo test
```

Ils verrouillent surtout l'invariant ci-dessus : aucun mot de passe dans l'argv.
