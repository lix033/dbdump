use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use std::path::PathBuf;

use crate::engines::Connection;
use crate::secrets;

/// Fichier des connexions, chiffré en AES-256-GCM avec la clé du trousseau.
/// Il ne contient aucun mot de passe de base — ceux-ci sont dans le trousseau —
/// mais hôtes et noms d'utilisateur méritent quand même de ne pas traîner en
/// clair dans le dossier de configuration.
fn store_path(app_config_dir: &PathBuf) -> PathBuf {
    app_config_dir.join("connections.enc")
}

pub fn load(app_config_dir: &PathBuf) -> Result<Vec<Connection>, String> {
    let path = store_path(app_config_dir);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let blob = std::fs::read(&path).map_err(|e| e.to_string())?;
    if blob.len() < 12 {
        return Err("fichier de connexions corrompu".into());
    }
    let (nonce_bytes, ciphertext) = blob.split_at(12);
    let nonce = Nonce::try_from(nonce_bytes).map_err(|_| "nonce invalide".to_string())?;

    let key = secrets::get_or_create_master_key()?;
    let cipher = Aes256Gcm::new(&key.into());
    let plaintext = match cipher.decrypt(&nonce, ciphertext) {
        Ok(p) => p,
        Err(_) => {
            // En dev, on bascule le stockage des secrets du trousseau vers un
            // fichier : l'ancien connections.enc, chiffré avec la clé du
            // trousseau, devient illisible. On repart d'une liste vide plutôt que
            // de bloquer. En production, un déchiffrement qui échoue reste une
            // vraie anomalie qu'on signale.
            #[cfg(debug_assertions)]
            {
                let _ = std::fs::remove_file(&path);
                return Ok(Vec::new());
            }
            #[cfg(not(debug_assertions))]
            return Err(
                "déchiffrement impossible : clé du trousseau absente ou fichier altéré".into(),
            );
        }
    };

    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}

pub fn save(app_config_dir: &PathBuf, connections: &[Connection]) -> Result<(), String> {
    let plaintext = serde_json::to_vec(connections).map_err(|e| e.to_string())?;
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
    // qui rendrait toutes les connexions illisibles.
    let path = store_path(app_config_dir);
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &blob).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn fresh_nonce() -> [u8; 12] {
    let mut buf = [0u8; 12];
    getrandom::fill(&mut buf).expect("source d'entropie système indisponible");
    buf
}
