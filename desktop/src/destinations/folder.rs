//! Destination « dossier » : disque local, disque externe, NAS ou partage
//! réseau monté par l'OS.
//!
//! Le point délicat n'est pas la copie, c'est l'**absence** : un disque externe
//! débranché ou un partage démonté laisse un chemin qui n'existe plus. Le créer
//! écrirait sur le disque interne, en silence, et la sauvegarde semblerait
//! réussie. On refuse donc d'écrire dans un dossier absent.

use std::path::Path;

use super::FreeSpace;
use crate::i18n::{msg, Lang};

/// Copie `local` (fichier ou dossier de dump) dans le dossier de destination.
pub fn deliver(
    dir: &Path,
    local: &Path,
    remote_name: &str,
    lang: Lang,
) -> Result<(String, u64), String> {
    if !dir.is_dir() {
        return Err(msg::destination_unavailable(lang, &dir.to_string_lossy()));
    }

    let target = dir.join(remote_name);
    // Écrire dans le dossier d'où l'on vient reviendrait à copier un fichier sur
    // lui-même : le dump y est déjà, il n'y a rien à faire.
    if same_file(local, &target) {
        let bytes = size_of(local);
        return Ok((target.to_string_lossy().into_owned(), bytes));
    }

    let bytes = if local.is_dir() {
        copy_dir(local, &target)?
    } else {
        std::fs::copy(local, &target).map_err(|e| msg::copy_failed(lang, &e.to_string()))?
    };
    Ok((target.to_string_lossy().into_owned(), bytes))
}

pub fn test(dir: &Path, lang: Lang) -> Result<String, String> {
    if !dir.is_dir() {
        return Err(msg::destination_unavailable(lang, &dir.to_string_lossy()));
    }
    // Un dossier lisible mais non inscriptible (partage monté en lecture seule)
    // ne se voit qu'à l'écriture : on tente un fichier témoin.
    let probe = dir.join(".dbdump-write-test");
    std::fs::write(&probe, b"dbdump").map_err(|e| msg::not_writable(lang, &e.to_string()))?;
    let _ = std::fs::remove_file(&probe);

    Ok(match free_space(dir) {
        Some(space) => msg::destination_ready_with_space(lang, space.free_bytes),
        None => msg::destination_ready(lang).to_string(),
    })
}

/// Espace libre du volume qui porte ce dossier.
pub fn free_space(dir: &Path) -> Option<FreeSpace> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    // Le volume le plus « profond » qui préfixe le chemin : sur macOS, `/` et
    // `/Volumes/Sauvegardes` matchent tous les deux, seul le second est le bon.
    let disk = disks
        .iter()
        .filter(|d| dir.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())?;
    Some(FreeSpace {
        free_bytes: disk.available_space(),
        total_bytes: disk.total_space(),
    })
}

/// Deux chemins désignent-ils le même fichier existant ?
fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn size_of(path: &Path) -> u64 {
    if path.is_dir() {
        return walk_size(path);
    }
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn walk_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let path = entry.path();
            if path.is_dir() {
                walk_size(&path)
            } else {
                std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
            }
        })
        .sum()
}

/// Copie récursive, pour les dumps au format « répertoire ».
fn copy_dir(from: &Path, to: &Path) -> Result<u64, String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    let mut total = 0;
    for entry in std::fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            total += copy_dir(&entry.path(), &target)?;
        } else {
            total += std::fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(total)
}
