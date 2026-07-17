//! Stockage des secrets (mots de passe des bases + clé maître du fichier de
//! connexions).
//!
//! **En release** : trousseau système (Keychain macOS, Credential Manager,
//! Secret Service) — les secrets ne touchent jamais le disque de l'app.
//!
//! **En debug (`tauri dev`)** : un simple fichier JSON dans le home. En dev, le
//! binaire est recompilé à chaque lancement et sa signature change ; le trousseau
//! ne le reconnaît plus et redemande le mot de passe de session à *chaque* accès
//! (« Toujours autoriser » saute au rebuild suivant). Ce stockage fichier évite
//! cette friction. Il n'est **jamais** utilisé dans un build de production.

const MASTER_KEY_ID: &str = "master-key";

/// Mot de passe d'une base. La clé est l'id de la connexion.
pub fn set_password(connection_id: &str, password: &str) -> Result<(), String> {
    backend::set(connection_id, password)
}

pub fn get_password(connection_id: &str) -> Result<Option<String>, String> {
    backend::get(connection_id)
}

pub fn delete_password(connection_id: &str) -> Result<(), String> {
    backend::delete(connection_id)
}

/// Clé de chiffrement du fichier de connexions, stockée au même endroit que les
/// mots de passe. Le fichier `connections.enc` est donc inexploitable sans elle.
pub fn get_or_create_master_key() -> Result<[u8; 32], String> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    match backend::get(MASTER_KEY_ID)? {
        Some(b64) => {
            let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
            bytes
                .try_into()
                .map_err(|_| "clé maître de taille invalide".to_string())
        }
        None => {
            let key: [u8; 32] = rand_bytes();
            backend::set(MASTER_KEY_ID, &STANDARD.encode(key))?;
            Ok(key)
        }
    }
}

fn rand_bytes<const N: usize>() -> [u8; N] {
    let mut buf = [0u8; N];
    getrandom::fill(&mut buf).expect("source d'entropie système indisponible");
    buf
}

// --- Release : trousseau système ------------------------------------------------
#[cfg(not(debug_assertions))]
mod backend {
    use keyring::Entry;

    const SERVICE: &str = "com.dbdump.app";

    pub fn set(id: &str, secret: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE, id).map_err(|e| e.to_string())?;
        entry.set_password(secret).map_err(|e| e.to_string())
    }

    pub fn get(id: &str) -> Result<Option<String>, String> {
        let entry = Entry::new(SERVICE, id).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(p) => Ok(Some(p)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn delete(id: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE, id).map_err(|e| e.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

// --- Debug : fichier JSON local (pas de prompt de trousseau) --------------------
#[cfg(debug_assertions)]
mod backend {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Mutex;

    // Sérialise les écritures concurrentes sur le fichier (test connexion + dump
    // peuvent lire/écrire en parallèle).
    static LOCK: Mutex<()> = Mutex::new(());

    /// Emplacement stable par utilisateur : survit aux rebuilds ET aux reboots,
    /// contrairement à un dossier temporaire.
    fn path() -> PathBuf {
        let base = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        base.join(".dbdump").join("dev-secrets.json")
    }

    fn load() -> HashMap<String, String> {
        std::fs::read(path())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    fn store(map: &HashMap<String, String>) -> Result<(), String> {
        let p = path();
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let data = serde_json::to_vec_pretty(map).map_err(|e| e.to_string())?;
        std::fs::write(&p, data).map_err(|e| e.to_string())
    }

    pub fn set(id: &str, secret: &str) -> Result<(), String> {
        let _guard = LOCK.lock().unwrap();
        let mut map = load();
        map.insert(id.to_string(), secret.to_string());
        store(&map)
    }

    pub fn get(id: &str) -> Result<Option<String>, String> {
        let _guard = LOCK.lock().unwrap();
        Ok(load().get(id).cloned())
    }

    pub fn delete(id: &str) -> Result<(), String> {
        let _guard = LOCK.lock().unwrap();
        let mut map = load();
        map.remove(id);
        store(&map)
    }
}
