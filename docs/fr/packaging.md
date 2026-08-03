# Packaging & distribution de DBDump

[English](../en/packaging.md) · **Français** — [← README](../../README.fr.md)

Ce guide explique comment **construire** l'application de bureau pour macOS,
Windows et Linux, et comment la **distribuer** via GitHub Releases + la landing
page publique.

> Rappel d'architecture : `frontend/` est un seul projet Next.js qui produit à la
> fois la **landing publique** (`/` en anglais, `/fr/` en français) et l'**UI de
> dump** (`/app/`) embarquée par l'app desktop `desktop/` (Tauri/Rust). Les deux
> dossiers sont nécessaires à l'app.

---

## 1. Prérequis

- **Node.js 20+** et **Rust** (via [rustup](https://rustup.rs)).
- Selon la plateforme que vous compilez **localement** :
  - **macOS** : Xcode Command Line Tools (`xcode-select --install`).
  - **Windows** : « Desktop development with C++ » (Visual Studio Build Tools) + WebView2 (préinstallé sur Win10/11).
  - **Linux** : `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential libssl-dev`.

> ⚠️ **On ne peut pas cross-compiler facilement** avec Tauri : chaque OS se
> construit sur son OS (un Mac ne produit pas un `.exe` Windows). C'est pourquoi
> la distribution multi-plateforme passe par la CI (section 4).

---

## 2. Build local (l'OS courant)

Depuis la racine du dépôt :

```bash
# Construit le frontend puis l'app native (dmg/app, exe/msi, deb/AppImage…)
npm --prefix desktop run build
```

Les installeurs sont produits dans :

```
desktop/target/release/bundle/
├─ macos/     dbdump.app
├─ dmg/       dbdump_0.1.1_aarch64.dmg     (ou _x64 sur Intel)
├─ msi/       dbdump_0.1.1_x64_en-US.msi   (Windows)
├─ nsis/      dbdump_0.1.1_x64-setup.exe   (Windows)
├─ deb/       dbdump_0.1.1_amd64.deb       (Linux)
├─ rpm/       …                            (Linux)
└─ appimage/  dbdump_0.1.1_amd64.AppImage  (Linux)
```

### macOS : produire les deux architectures

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm --prefix desktop run tauri -- build --target aarch64-apple-darwin   # Apple Silicon
npm --prefix desktop run tauri -- build --target x86_64-apple-darwin    # Intel
```

---

## 3. Signature

- **macOS — signé + notarisé (opérationnel).** `desktop/tauri.conf.json` fixe
  `macOS.signingIdentity` à `Developer ID Application: Maximus KOLOU (YBK5Z7SFC6)`.
  En CI, le bloc `env: APPLE_*` du workflow lit 6 secrets du dépôt
  (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_ID`, `APPLE_PASSWORD` = mot de passe d'application, `APPLE_TEAM_ID`).
  Tauri signe puis notarise l'app.
  ⚠️ Tauri notarise le bundle `.app` **mais pas le conteneur `.dmg`** : une étape
  dédiée du workflow (« Notariser le DMG ») notarise + agrafe chaque `.dmg` et
  remplace l'asset sur la Release. Résultat : l'app **et** le `.dmg` s'ouvrent sans
  avertissement Gatekeeper.
- **Windows (SmartScreen) : en cours.** Les `.exe`/`.msi` ne sont pas encore signés
  → « Windows a protégé votre PC » (contournement : « Informations complémentaires
  → Exécuter quand même »). Signature prévue via **SignPath Foundation** (certificat
  OV gratuit pour projets open source ; nécessite la licence MIT du dépôt et une
  demande sur [signpath.org/apply](https://signpath.org/apply)).
- **Linux** : pas de signature obligatoire ; l'AppImage se lance directement.

> Les instructions utilisateur (macOS sans avertissement, contournement Windows)
> sont dans le [README](../../README.fr.md#installation) et sur la landing page.

---

## 4. Distribution automatique (recommandé) — GitHub Actions

Le workflow `.github/workflows/release.yml` construit **macOS (ARM + Intel),
Windows et Linux** en parallèle et publie une **Release** avec tous les
installeurs.

### Mise en place (une fois)

1. Créez un dépôt GitHub et poussez le projet :

   ```bash
   git remote add origin https://github.com/<vous>/dbdump.git
   git push -u origin main
   ```

2. Dans **Settings → Actions → General → Workflow permissions**, activez
   **« Read and write permissions »** (pour que la CI puisse créer la Release).

### Publier une version

1. Bumpez la version partout : `desktop/tauri.conf.json` (`"version"`),
   `desktop/Cargo.toml` (+ `Cargo.lock`), et les deux `package.json`
   (`desktop/`, `frontend/`).
2. Taggez et poussez :

   ```bash
   git push origin main
   git tag v0.1.1
   git push origin v0.1.1
   ```

3. La CI construit les 4 cibles et **publie automatiquement** la Release avec
   tous les installeurs (`releaseDraft: false` dans le workflow). Elle apparaît
   aussitôt dans l'onglet **Releases** — rien à valider à la main.

> Repasser en brouillon (pour vérifier avant publication) : mettez
> `releaseDraft: true` dans `.github/workflows/release.yml`, puis publiez à la
> main depuis l'onglet Releases.
>
> La signature macOS est active : le bloc `env: APPLE_*` du workflow est déjà en
> place et lit les 6 secrets du dépôt. Si ces secrets sont absents, le build
> réussit quand même (app signée ad-hoc, non notarisée) — l'étape « Notariser le
> DMG » s'ignore alors d'elle-même.

---

## 5. Landing page (dans `frontend/`)

La landing **est le frontend** : ce sont les routes `/` (anglais) et `/fr/`
(français) du projet Next.js. L'UI de dump utilisée par l'app desktop vit sur
`/app/`. Un seul `npm run build` produit le tout dans `frontend/out/` :

```
frontend/out/
├─ index.html        ← LANDING anglaise (site public)
├─ fr/index.html     ← LANDING française
├─ app/index.html    ← UI de dump (chargée par le desktop)
├─ sitemap.xml       ← les deux landings, avec leurs alternates de langue
└─ robots.txt        ← interdit /app/
```

### Brancher les téléchargements

Dans `frontend/src/lib/site.ts`, remplacez :

```ts
export const GITHUB_REPO = "lix033/dbdump"; // ← votre dépôt
export const SITE_URL = "https://dbdump.nameksociety.com"; // ← votre domaine
```

Les boutons pointent alors vers vos GitHub Releases, et les liens directs par
plateforme sont résolus automatiquement (API GitHub) dès qu'une release existe.
`SITE_URL` sert aux URL canoniques, aux `hreflang` et au sitemap : mettez-le à
jour en même temps que le domaine.

### Déployer (VPS / k3s via GitLab)

Le déploiement est piloté par `frontend/.k3s/app.yaml` (nom, port 3097, domaine)
et `frontend/Dockerfile`. Le Dockerfile :

1. construit l'export statique (`npm run build` → `out/`) ;
2. le sert avec **nginx sur le port 3097** via `frontend/nginx.conf`, qui **masque
   la route `/app`** (réservée au desktop) et met en cache les assets `_next`.

> ⚠️ On n'utilise **pas** `next start` : le projet est en `output: "export"` (requis
> pour le desktop). Vérifiez que la plateforme build bien **depuis le Dockerfile**,
> pas via un buildpack « nextjs » qui lancerait `next start`.

Poussez sur GitLab comme d'habitude → la plateforme build l'image et déploie.
Aperçu local :

```bash
docker build -t dbdump-front frontend
docker run -p 3097:3097 dbdump-front   # http://localhost:3097
```

### Les binaires desktop restent hors du VPS

La landing ne **stocke pas** les installeurs : ses boutons pointent vers vos
**GitHub Releases** (résolus par l'API GitHub via `GITHUB_REPO`). Le navigateur
télécharge directement depuis le CDN de GitHub — votre serveur ne sert que la
landing.

---

## 6. Logo & icônes

Tout découle d'un seul master vectoriel, `brand/logo.svg` (la marque seule, sans
fond, tracée d'après l'original `brand/logodump.png`) :

| Fichier                                 | Utilisé par                                                  |
| --------------------------------------- | ------------------------------------------------------------ |
| `brand/logo.svg`                        | Master. Mêmes tracés que le composant React `<Logo>`           |
| `brand/logo-badge.svg`                  | Marque sur le fond de marque (carré, coins arrondis)           |
| `brand/app-icon.png` (1024)             | Source donnée à `tauri icon`                                   |
| `frontend/src/components/logo.tsx`      | La marque dans l'UI (SVG inline, net à toute taille)           |
| `frontend/public/logo.svg`              | URL publique de la marque (`/logo.svg`)                        |
| `frontend/src/app/favicon.ico`, `icon.svg`, `apple-icon.png` | Onglet du navigateur, écran d'accueil iOS |
| `frontend/src/app/(en)/opengraph-image.png`, `(fr)/fr/…`     | Aperçu social, un par langue             |
| `desktop/icons/*`                       | App de bureau (dock, barre des tâches, installeurs)            |

Régénérer les icônes desktop après une modification du master :

```bash
npm --prefix desktop run tauri -- icon ../brand/app-icon.png
rm -rf desktop/icons/android desktop/icons/ios   # pas de cible mobile ici
```

Les fichiers web sont de simples exports du même SVG (512 px pour le badge,
180 px pour `apple-icon`, 1200×630 pour l'image sociale). Changer les couleurs
demande de les changer dans `logo.tsx` **et** dans `brand/logo.svg` : les deux
doivent rester identiques.

---

## Récapitulatif express

```bash
# Build de l'app desktop (votre OS)
npm --prefix desktop run build

# Distribuer partout : configurer une fois le dépôt GitHub, puis
git tag v0.1.1 && git push origin v0.1.1      # → la CI publie la Release

# Publier la landing : éditer GITHUB_REPO / SITE_URL dans frontend/src/lib/site.ts,
npm --prefix frontend run build               # puis héberger frontend/out/
```
