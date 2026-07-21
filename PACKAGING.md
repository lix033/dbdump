# Packaging & distribution de DBDump

Ce guide explique comment **construire** l'application de bureau pour macOS, Windows
et Linux, et comment la **distribuer** à tout le monde via GitHub Releases + la
landing page (`landing/`).

> Rappel d'architecture : `frontend/` est l'UI (Next.js, buildée en statique) que
> l'app desktop `desktop/` (Tauri/Rust) embarque. Les deux sont nécessaires à
> l'app. `landing/` est **indépendant** : c'est le site public de téléchargement.

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
├─ dmg/       dbdump_0.1.0_aarch64.dmg     (ou _x64 sur Intel)
├─ msi/       dbdump_0.1.0_x64_en-US.msi   (Windows)
├─ nsis/      dbdump_0.1.0_x64-setup.exe   (Windows)
├─ deb/       dbdump_0.1.0_amd64.deb       (Linux)
├─ rpm/       …                            (Linux)
└─ appimage/  dbdump_0.1.0_amd64.AppImage  (Linux)
```

### macOS : produire les deux architectures

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm --prefix desktop run tauri -- build --target aarch64-apple-darwin   # Apple Silicon
npm --prefix desktop run tauri -- build --target x86_64-apple-darwin    # Intel
```

---

## 3. Signature (important pour « accessible à tout le monde »)

Sans certificat payant, les utilisateurs voient un avertissement au premier
lancement :

- **macOS** : l'app est **signée ad-hoc** (`signingIdentity: "-"` dans
  `desktop/tauri.conf.json`), ce qui évite le blocage dur. Selon la version de
  macOS, l'utilisateur peut tout de même voir « dbdump is damaged and can't be
  opened » à cause de la **quarantaine** posée sur les fichiers téléchargés.
  Contournement (une fois) : `xattr -cr /Applications/dbdump.app`. Pour
  **supprimer** l'avertissement, il faut un compte **Apple Developer** (99 $/an)
  et signer + **notariser** (variables `APPLE_*`, voir le bloc `env:` commenté du
  workflow).
  ⚠️ Le `clic droit → Ouvrir` ne débloque **pas** l'erreur « damaged » — seule la
  levée de quarantaine ou la notarisation le fait.
- **Windows (SmartScreen)** : « Windows a protégé votre PC ». Contournement :
  « Informations complémentaires → Exécuter quand même ». Pour le supprimer, un
  **certificat de signature de code** (OV/EV) est requis.
- **Linux** : pas de signature obligatoire ; l'AppImage se lance directement.

Ces contournements sont documentés pour l'utilisateur dans le
[README](README.md#installation) et sur la landing page. Vous pouvez distribuer
dès maintenant ; ajoutez la notarisation plus tard sans changer le reste.

---

## 4. Distribution automatique (recommandé) — GitHub Actions

Le workflow `.github/workflows/release.yml` construit **macOS (ARM + Intel),
Windows et Linux** en parallèle et publie une **Release** avec tous les installeurs.

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
> Le workflow tolère l'absence de signature. Pour signer + notariser macOS,
> renseignez les secrets `APPLE_*` du dépôt et décommentez le bloc `env:`
> correspondant.

---

## 5. Landing page (dans `frontend/`)

La landing **est le frontend** : c'est la page racine `/` du projet Next.js. L'UI de
dump (utilisée par l'app desktop) vit sur la route `/app`. Un seul `npm run build`
produit les deux dans `frontend/out/` :

```
frontend/out/
├─ index.html        ← LANDING (site public)
└─ app/index.html    ← UI de dump (chargée par le desktop)
```

### Brancher les téléchargements

Dans `frontend/src/app/page.tsx`, en haut, remplacez :

```ts
const GITHUB_REPO = "dreamercode01/dbdump"; // ← votre dépôt
```

Les boutons pointent alors vers vos GitHub Releases, et les liens directs par
plateforme sont résolus automatiquement (API GitHub) dès qu'une release existe.

### Déployer (VPS / k3s via GitLab)

Le déploiement est piloté par `frontend/.k3s/app.yaml` (nom, port 3097, domaine
`dbdump.nameksociety.com`) et `frontend/Dockerfile`. Le Dockerfile :

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
**GitHub Releases** (résolus par l'API GitHub via `GITHUB_REPO` dans
`frontend/src/app/page.tsx`). Le navigateur télécharge directement depuis le CDN de
GitHub — votre serveur ne sert que la landing.

---

## Récapitulatif express

```bash
# Build de l'app desktop (votre OS)
npm --prefix desktop run build

# Distribuer partout : configurer une fois le dépôt GitHub, puis
git tag v0.1.0 && git push origin v0.1.0      # → la CI publie la Release

# Publier la landing : éditer GITHUB_REPO dans frontend/src/app/page.tsx,
npm --prefix frontend run build               # puis héberger frontend/out/
```
