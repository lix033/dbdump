//! Fourniture de `pg_dump` sans installation préalable de PostgreSQL.
//!
//! Ordre de résolution :
//! 1. `pg_dump` du système (via le PATH) — l'utilisateur garde la main sur *sa*
//!    version de PostgreSQL ;
//! 2. sinon une copie déjà téléchargée dans les données de l'app ;
//! 3. sinon on télécharge une build portable une seule fois, on l'extrait, et on
//!    la met en cache. Hors-ligne ensuite.
//!
//! Les binaires portables proviennent des releases `theseus-rs/postgresql-binaries`
//! (archives `.tar.gz` par cible, incluant `bin/pg_dump` **et** ses bibliothèques
//! `lib/` — l'archive est relocatable, donc pg_dump y trouve sa libpq).
//!
//! ⚠ L'URL par défaut n'a pas pu être vérifiée dans l'environnement de
//! développement : elle est **surchargée par la variable d'environnement
//! `DBDUMP_PG_URL`** en cas de besoin (pointant vers une archive `.tar.gz`).

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::i18n::{msg, Lang};

/// Version PostgreSQL portable téléchargée par défaut. Modifiable ici en un point
/// unique ; pg_dump sait dumper les serveurs de version égale ou inférieure.
const PG_VERSION: &str = "17.2.0";

fn bin_name() -> &'static str {
    if cfg!(windows) {
        "pg_dump.exe"
    } else {
        "pg_dump"
    }
}

/// Triplet de cible utilisé dans le nom des assets de release.
fn target_triple(lang: Lang) -> Result<&'static str, String> {
    let t = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else {
        return Err(msg::unsupported_platform(lang).into());
    };
    Ok(t)
}

fn asset_url(lang: Lang) -> Result<String, String> {
    if let Ok(u) = std::env::var("DBDUMP_PG_URL") {
        if !u.trim().is_empty() {
            return Ok(u);
        }
    }
    let target = target_triple(lang)?;
    Ok(format!(
        "https://github.com/theseus-rs/postgresql-binaries/releases/download/{PG_VERSION}/postgresql-{PG_VERSION}-{target}.tar.gz"
    ))
}

/// Racine du cache pour la version courante, sous les données de l'app.
pub fn cache_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("tools").join("postgresql").join(PG_VERSION)
}

/// Cherche `bin/pg_dump` sous `root`, en tolérant un éventuel dossier de premier
/// niveau (certaines archives s'extraient dans `postgresql-x/…`).
pub fn find_pg_dump(root: &Path) -> Option<PathBuf> {
    let direct = root.join("bin").join(bin_name());
    if direct.is_file() {
        return Some(direct);
    }
    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let candidate = entry.path().join("bin").join(bin_name());
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Résout le chemin absolu de pg_dump, en téléchargeant la build portable si
/// nécessaire. `on_log` reçoit la progression pour l'afficher dans la fenêtre.
pub fn resolve_pg_dump(
    app_data_dir: &Path,
    lang: Lang,
    on_log: &mut impl FnMut(String),
) -> Result<PathBuf, String> {
    if let Ok(path) = which::which("pg_dump") {
        return Ok(path);
    }
    if let Some(path) = find_pg_dump(&cache_root(app_data_dir)) {
        return Ok(path);
    }
    provision(app_data_dir, lang, on_log)
}

fn provision(
    app_data_dir: &Path,
    lang: Lang,
    on_log: &mut impl FnMut(String),
) -> Result<PathBuf, String> {
    let url = asset_url(lang)?;
    on_log(msg::pg_download_start(lang, PG_VERSION));

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(900))
        .build();
    let resp = agent
        .get(&url)
        .call()
        .map_err(|e| msg::download_failed(lang, &url, &e.to_string()))?;

    let total: Option<u64> = resp
        .header("Content-Length")
        .and_then(|s| s.parse().ok());

    // Lecture par blocs pour émettre une progression plutôt qu'un long silence.
    let mut reader = resp.into_reader();
    let mut buf: Vec<u8> = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut chunk = [0u8; 65536];
    let mut last_mb = 0u64;
    loop {
        let n = reader
            .read(&mut chunk)
            .map_err(|e| msg::download_interrupted(lang, &e.to_string()))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        let mb = buf.len() as u64 / 1_048_576;
        if mb >= last_mb + 5 {
            last_mb = mb;
            on_log(msg::download_progress(lang, mb, total.map(|t| t / 1_048_576)));
        }
    }

    on_log(msg::extracting(lang, buf.len() as u64 / 1_048_576));
    let dest = cache_root(app_data_dir);
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    let decoder = flate2::read::GzDecoder::new(&buf[..]);
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(&dest)
        .map_err(|e| msg::extract_failed(lang, &e.to_string()))?;

    let bin =
        find_pg_dump(&dest).ok_or_else(|| msg::pg_dump_not_in_archive(lang).to_string())?;

    // Sur Unix, s'assurer que le binaire est exécutable (tar préserve normalement
    // les permissions, mais certaines configurations les perdent).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&bin) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o755);
            let _ = std::fs::set_permissions(&bin, perms);
        }
    }

    on_log(msg::pg_dump_ready(lang).into());
    Ok(bin)
}
