//! Diffusion d'un dump terminé vers ses destinations.
//!
//! Le point commun entre un dump lancé à la main et un dump programmé : une
//! fois le fichier écrit, il part vers zéro, une ou plusieurs destinations. Ce
//! module tient cette étape en un seul endroit pour que les deux chemins se
//! comportent pareil.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::destinations::{self, DeliveryResult, Destination};
use crate::engines::DumpOptions;
use crate::i18n::{msg, Lang};
use crate::store;

/// Diffuse `output_path` vers les destinations demandées par `opts`.
///
/// Renvoie le verdict de chaque destination. Le dump lui-même est déjà réussi à
/// ce stade : un envoi raté ne l'annule pas, il se voit dans le journal et dans
/// l'historique.
pub async fn run(
    app: &AppHandle,
    opts: &DumpOptions,
    output_path: &str,
    lang: Lang,
    mut on_log: impl FnMut(String),
) -> Vec<DeliveryResult> {
    if opts.destination_ids.is_empty() {
        return Vec::new();
    }

    let Ok(config_dir) = app.path().app_config_dir() else {
        return Vec::new();
    };
    let all: Vec<Destination> = store::load(&config_dir, store::DESTINATIONS).unwrap_or_default();

    let local = PathBuf::from(output_path);
    let remote_name = local
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "dump".to_string());

    // Les archives intermédiaires (dumps au format « répertoire ») vivent dans
    // le cache de l'app, pas à côté de la sauvegarde de l'utilisateur.
    let staging = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("uploads");

    let results = destinations::deliver_all(
        &all,
        &opts.destination_ids,
        &local,
        &remote_name,
        &staging,
        lang,
        &mut on_log,
    )
    .await;

    // « Distant seulement » : on ne supprime la copie locale que si quelqu'un
    // l'a effectivement reçue. Sinon la sauvegarde n'existerait plus nulle part.
    if !opts.keep_local {
        if results.iter().any(|r| r.ok) {
            match remove(&local) {
                Ok(()) => on_log(msg::local_copy_removed(lang, output_path)),
                Err(error) => on_log(error),
            }
        } else {
            on_log(msg::local_copy_kept(lang).to_string());
        }
    }

    results
}

fn remove(path: &Path) -> Result<(), String> {
    let removed = if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    removed.map_err(|e| e.to_string())
}
