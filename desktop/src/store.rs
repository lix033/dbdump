use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use serde::{de::DeserializeOwned, Serialize};
use std::path::PathBuf;

use crate::secrets;

/// Les fichiers du magasin, tous chiffrés en AES-256-GCM avec la clé maître.
/// Aucun ne contient de mot de passe — ceux-ci sont dans le coffre — mais hôtes,
/// noms d'utilisateur et chemins méritent quand même de ne pas traîner en clair
/// dans le dossier de configuration.
pub const CONNECTIONS: &str = "connections.enc";
pub const SCHEDULES: &str = "schedules.enc";
pub const RUNS: &str = "runs.enc";
pub const DESTINATIONS: &str = "destinations.enc";
/// Taille du dernier dump réussi par connexion : sert de référence au temps
/// restant estimé pendant les dumps suivants.
pub const SIZES: &str = "sizes.enc";

fn store_path(app_config_dir: &PathBuf, file: &str) -> PathBuf {
    app_config_dir.join(file)
}

/// Lit un fichier du magasin. Un fichier absent ou illisible rend la valeur par
/// défaut (liste vide) : l'app démarre toujours.
pub fn load<T: DeserializeOwned + Default>(
    app_config_dir: &PathBuf,
    file: &str,
) -> Result<T, String> {
    let path = store_path(app_config_dir, file);
    if !path.exists() {
        return Ok(T::default());
    }
    let blob = std::fs::read(&path).map_err(|e| e.to_string())?;
    if blob.len() < 12 {
        return Err(format!("fichier {file} corrompu"));
    }
    let (nonce_bytes, ciphertext) = blob.split_at(12);
    let nonce = Nonce::try_from(nonce_bytes).map_err(|_| "nonce invalide".to_string())?;

    let key = secrets::get_or_create_master_key()?;
    let cipher = Aes256Gcm::new(&key.into());
    let plaintext = match cipher.decrypt(&nonce, ciphertext) {
        Ok(p) => p,
        Err(_) => {
            // Le fichier ne se déchiffre pas avec la clé locale du coffre : soit la
            // clé (`secrets.key`) a été perdue/régénérée, soit le fichier a été
            // altéré. Les mots de passe associés sont de toute façon irrécupérables
            // dans ce cas ; on repart d'une liste vide plutôt que de bloquer
            // définitivement l'app.
            let _ = std::fs::remove_file(&path);
            return Ok(T::default());
        }
    };

    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}

pub fn save<T: Serialize>(
    app_config_dir: &PathBuf,
    file: &str,
    value: &T,
) -> Result<(), String> {
    let plaintext = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let key = secrets::get_or_create_master_key()?;
    let cipher = Aes256Gcm::new(&key.into());

    // Un nonce neuf à chaque écriture : le réutiliser avec la même clé casserait
    // la confidentialité de GCM.
    let nonce_bytes = fresh_nonce();
    let ciphertext = cipher
        .encrypt(&Nonce::from(nonce_bytes), plaintext.as_ref())
        .map_err(|e| e.to_string())?;

    std::fs::create_dir_all(app_config_dir).map_err(|e| e.to_string())?;
    let mut blob = nonce_bytes.to_vec();
    blob.extend_from_slice(&ciphertext);

    // Écriture atomique : une coupure ne doit pas laisser un fichier tronqué
    // qui rendrait tout le fichier illisible.
    let path = store_path(app_config_dir, file);
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &blob).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn fresh_nonce() -> [u8; 12] {
    let mut buf = [0u8; 12];
    getrandom::fill(&mut buf).expect("source d'entropie système indisponible");
    buf
}
