//! Reconstruction du PATH au démarrage.
//!
//! Une app macOS/Linux lancée depuis le Finder, le Dock ou Launchpad n'hérite
//! **pas** du PATH du shell de l'utilisateur : launchd fournit un PATH minimal
//! (`/usr/bin:/bin:/usr/sbin:/sbin`). Les outils installés par Homebrew
//! (`/opt/homebrew/bin`) ou par les installeurs PostgreSQL
//! (`/Library/PostgreSQL/<ver>/bin`) deviennent alors « introuvables » — alors
//! qu'ils marchent très bien dans le Terminal. On enrichit le PATH du process
//! une fois au démarrage pour que `which::which(...)` et `Command::new(...)`
//! retrouvent psql, mysql, mongosh, pg_dump, etc.

use std::collections::HashSet;
use std::path::PathBuf;

/// Enrichit le PATH du process. Idempotent : on ne fait qu'ajouter des dossiers
/// et on déduplique.
pub fn harmonize() {
    let mut dirs: Vec<PathBuf> = Vec::new();

    // 1. Le PATH courant du process (à préserver).
    if let Some(current) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&current));
    }

    // 2. Le vrai PATH du shell de connexion : capture les installs propres à
    //    l'utilisateur (Homebrew, asdf, nvm, chemins custom du .zprofile…).
    #[cfg(unix)]
    if let Some(shell_path) = login_shell_path() {
        dirs.extend(std::env::split_paths(&shell_path));
    }

    // 3. Emplacements connus des outils de bases de données.
    dirs.extend(well_known_dirs());

    // Déduplication en conservant l'ordre (priorité au PATH courant), et on ne
    // garde que les dossiers non vides.
    let mut seen = HashSet::new();
    let deduped: Vec<PathBuf> = dirs
        .into_iter()
        .filter(|d| !d.as_os_str().is_empty() && seen.insert(d.clone()))
        .collect();

    if let Ok(joined) = std::env::join_paths(&deduped) {
        std::env::set_var("PATH", joined);
    }
}

/// Demande son PATH au shell de connexion de l'utilisateur. `-ilc` charge un
/// shell interactif de connexion, donc source `.zprofile`/`.zshrc`/
/// `.bash_profile` où Homebrew & co ajoutent leurs chemins.
#[cfg(unix)]
fn login_shell_path() -> Option<std::ffi::OsString> {
    use std::process::Command;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let out = Command::new(shell)
        .args(["-ilc", "printf %s \"$PATH\""])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s.into())
    }
}

fn well_known_dirs() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let mut v = vec![
            PathBuf::from("/opt/homebrew/bin"),   // Homebrew Apple Silicon
            PathBuf::from("/usr/local/bin"),      // Homebrew Intel
            PathBuf::from("/usr/local/mysql/bin"), // Installeur officiel MySQL
        ];
        // PostgreSQL — installeur EDB : /Library/PostgreSQL/<ver>/bin
        v.extend(versioned_bins("/Library/PostgreSQL"));
        // PostgreSQL — Postgres.app : .../Versions/<ver>/bin
        v.extend(versioned_bins(
            "/Applications/Postgres.app/Contents/Versions",
        ));
        v
    }
    #[cfg(target_os = "linux")]
    {
        vec![
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/snap/bin"),
            PathBuf::from("/home/linuxbrew/.linuxbrew/bin"),
        ]
    }
    #[cfg(target_os = "windows")]
    {
        // PostgreSQL — installeur EDB : C:\Program Files\PostgreSQL\<ver>\bin
        let mut v = versioned_bins(r"C:\Program Files\PostgreSQL");
        v.extend(versioned_bins(r"C:\Program Files (x86)\PostgreSQL"));
        // MySQL : C:\Program Files\MySQL\MySQL Server <ver>\bin
        v.extend(versioned_bins(r"C:\Program Files\MySQL"));
        // MongoDB serveur : C:\Program Files\MongoDB\Server\<ver>\bin
        v.extend(versioned_bins(r"C:\Program Files\MongoDB\Server"));
        // MongoDB Database Tools : C:\Program Files\MongoDB\Tools\<ver>\bin
        v.extend(versioned_bins(r"C:\Program Files\MongoDB\Tools"));
        v
    }
}

/// Pour un dossier parent contenant des sous-dossiers versionnés
/// (ex. `/Library/PostgreSQL/16`), renvoie chaque `<parent>/<ver>/bin` existant.
#[cfg_attr(target_os = "linux", allow(dead_code))]
fn versioned_bins(parent: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(parent) {
        for e in entries.flatten() {
            let bin = e.path().join("bin");
            if bin.is_dir() {
                out.push(bin);
            }
        }
    }
    out
}
