# Packaging & distributing DBDump

**English** · [Français](../fr/packaging.md) — [← README](../../README.md)

This guide covers how to **build** the desktop app for macOS, Windows and Linux,
and how to **distribute** it through GitHub Releases + the public landing page.

> Architecture reminder: `frontend/` is a single Next.js project that produces
> both the **public landing page** (`/` in English, `/fr/` in French) and the
> **dump UI** (`/app/`) embedded by the desktop app `desktop/` (Tauri/Rust). Both
> folders are required for the app.

---

## 1. Prerequisites

- **Node.js 20+** and **Rust** (through [rustup](https://rustup.rs)).
- Depending on the platform you build **locally**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
  - **Windows**: “Desktop development with C++” (Visual Studio Build Tools) + WebView2 (preinstalled on Win10/11).
  - **Linux**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential libssl-dev`.

> ⚠️ **Cross-compiling is not practical** with Tauri: each OS is built on its own
> OS (a Mac does not produce a Windows `.exe`). That is why multi-platform
> distribution goes through CI (section 4).

---

## 2. Local build (current OS)

From the repository root:

```bash
# Builds the frontend, then the native app (dmg/app, exe/msi, deb/AppImage…)
npm --prefix desktop run build
```

Installers land in:

```
desktop/target/release/bundle/
├─ macos/     dbdump.app
├─ dmg/       dbdump_0.1.1_aarch64.dmg     (or _x64 on Intel)
├─ msi/       dbdump_0.1.1_x64_en-US.msi   (Windows)
├─ nsis/      dbdump_0.1.1_x64-setup.exe   (Windows)
├─ deb/       dbdump_0.1.1_amd64.deb       (Linux)
├─ rpm/       …                            (Linux)
└─ appimage/  dbdump_0.1.1_amd64.AppImage  (Linux)
```

### macOS: producing both architectures

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm --prefix desktop run tauri -- build --target aarch64-apple-darwin   # Apple Silicon
npm --prefix desktop run tauri -- build --target x86_64-apple-darwin    # Intel
```

---

## 3. Signing

- **macOS — signed + notarized (working).** `desktop/tauri.conf.json` sets
  `macOS.signingIdentity` to `Developer ID Application: Maximus KOLOU (YBK5Z7SFC6)`.
  In CI, the workflow's `env: APPLE_*` block reads 6 repository secrets
  (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_ID`, `APPLE_PASSWORD` = app-specific password, `APPLE_TEAM_ID`). Tauri
  signs, then notarizes the app.
  ⚠️ Tauri notarizes the `.app` bundle **but not the `.dmg` container**: a
  dedicated workflow step (“Notarize the DMG”) notarizes and staples each `.dmg`,
  then replaces the asset on the Release. Result: both the app **and** the `.dmg`
  open with no Gatekeeper warning.
- **Windows (SmartScreen): in progress.** The `.exe`/`.msi` are not signed yet
  → “Windows protected your PC” (workaround: “More info → Run anyway”). Signing
  is planned through **SignPath Foundation** (free OV certificate for open source
  projects; requires the repository's MIT license and an application on
  [signpath.org/apply](https://signpath.org/apply)).
- **Linux**: no signing required; the AppImage runs directly.

> End-user instructions (macOS with no warning, Windows workaround) live in the
> [README](../../README.md#install) and on the landing page.

---

## 4. Automatic distribution (recommended) — GitHub Actions

The `.github/workflows/release.yml` workflow builds **macOS (ARM + Intel),
Windows and Linux** in parallel and publishes a **Release** with every installer.

### Setup (once)

1. Create a GitHub repository and push the project:

   ```bash
   git remote add origin https://github.com/<you>/dbdump.git
   git push -u origin main
   ```

2. Under **Settings → Actions → General → Workflow permissions**, enable
   **“Read and write permissions”** (so CI can create the Release).

### Publishing a version

1. Bump the version everywhere: `desktop/tauri.conf.json` (`"version"`),
   `desktop/Cargo.toml` (+ `Cargo.lock`), and both `package.json` files
   (`desktop/`, `frontend/`).
2. Tag and push:

   ```bash
   git push origin main
   git tag v0.1.1
   git push origin v0.1.1
   ```

3. CI builds the 4 targets and **publishes the Release automatically** with every
   installer (`releaseDraft: false` in the workflow). It shows up in the
   **Releases** tab right away — nothing to confirm by hand.

> To go back to drafts (to review before publishing): set `releaseDraft: true` in
> `.github/workflows/release.yml`, then publish by hand from the Releases tab.
>
> macOS signing is active: the workflow's `env: APPLE_*` block is already in
> place and reads the 6 repository secrets. If those secrets are missing, the
> build still succeeds (ad-hoc signed app, not notarized) — the “Notarize the
> DMG” step then skips itself.

---

## 5. Landing page (inside `frontend/`)

The landing page **is** the frontend: it is the `/` (English) and `/fr/` (French)
routes of the Next.js project. The dump UI used by the desktop app lives at
`/app/`. A single `npm run build` produces all of it in `frontend/out/`:

```
frontend/out/
├─ index.html        ← English LANDING (public site)
├─ fr/index.html     ← French LANDING
├─ app/index.html    ← dump UI (loaded by the desktop app)
├─ sitemap.xml       ← both landings, with their language alternates
└─ robots.txt        ← disallows /app/
```

### Wiring the downloads

In `frontend/src/lib/site.ts`, replace:

```ts
export const GITHUB_REPO = "lix033/dbdump"; // ← your repository
export const SITE_URL = "https://dbdump.nameksociety.com"; // ← your domain
```

The buttons then point at your GitHub Releases, and per-platform direct links are
resolved automatically (GitHub API) as soon as a release exists. `SITE_URL` feeds
the canonical URLs, the `hreflang` alternates and the sitemap: update it along
with the domain.

### Deploying (VPS / k3s through GitLab)

Deployment is driven by `frontend/.k3s/app.yaml` (name, port 3097, domain) and
`frontend/Dockerfile`. The Dockerfile:

1. builds the static export (`npm run build` → `out/`);
2. serves it with **nginx on port 3097** through `frontend/nginx.conf`, which
   **hides the `/app` route** (reserved for the desktop app) and caches the
   `_next` assets.

> ⚠️ We do **not** use `next start`: the project is in `output: "export"`
> (required by the desktop app). Make sure the platform builds **from the
> Dockerfile**, not through a “nextjs” buildpack that would run `next start`.

Push to GitLab as usual → the platform builds the image and deploys. Local
preview:

```bash
docker build -t dbdump-front frontend
docker run -p 3097:3097 dbdump-front   # http://localhost:3097
```

### Desktop binaries stay off the VPS

The landing page does **not** store the installers: its buttons point at your
**GitHub Releases** (resolved through the GitHub API via `GITHUB_REPO`). The
browser downloads straight from GitHub's CDN — your server only serves the
landing page.

---

## 6. Logo & icons

Everything derives from one vector master, `brand/logo.svg` (the mark alone, no
background, traced from the original `brand/logodump.png`):

| File                                    | Used by                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `brand/logo.svg`                        | Master. Same paths as the `<Logo>` React component           |
| `brand/logo-badge.svg`                  | Mark on the brand background (square, rounded)               |
| `brand/app-icon.png` (1024)             | Source given to `tauri icon`                                 |
| `frontend/src/components/logo.tsx`      | The mark in the UI (inline SVG, crisp at any size)           |
| `frontend/public/logo.svg`              | Public URL of the mark (`/logo.svg`)                         |
| `frontend/src/app/favicon.ico`, `icon.svg`, `apple-icon.png` | Browser tab and iOS home screen        |
| `frontend/src/app/(en)/opengraph-image.png`, `(fr)/fr/…`     | Social preview, one per language       |
| `desktop/icons/*`                       | Desktop app (dock, taskbar, installers)                      |

Regenerating the desktop icons after changing the master:

```bash
npm --prefix desktop run tauri -- icon ../brand/app-icon.png
rm -rf desktop/icons/android desktop/icons/ios   # no mobile target here
```

The web files are plain exports of the same SVG (512 px for the badge, 180 px
for `apple-icon`, 1200×630 for the social image). Changing the colours means
changing them in `logo.tsx` **and** in `brand/logo.svg` — they must stay
identical.

---

## Quick recap

```bash
# Build the desktop app (your OS)
npm --prefix desktop run build

# Distribute everywhere: configure the GitHub repository once, then
git tag v0.1.1 && git push origin v0.1.1      # → CI publishes the Release

# Publish the landing page: edit GITHUB_REPO / SITE_URL in frontend/src/lib/site.ts,
npm --prefix frontend run build               # then host frontend/out/
```
