//! Stockage des secrets (mots de passe des bases + clé maître du fichier de
//! connexions).
//!
//! **Choix de conception : coffre-fort fichier, pas de trousseau système.**
//!
//! On n'utilise plus le trousseau de l'OS (Keychain macOS, Credential Manager,
//! Secret Service Linux). Raison : sans certificat de signature stable (l'app est
//! ad-hoc/non signée), le Keychain ne reconnaît pas l'app d'un lancement à
//! l'autre et redemande le mot de passe de session à *chaque* accès —
//! « Toujours autoriser » ne tient pas. Idem, à divers degrés, sur les autres
//! plateformes.
//!
//! À la place, les secrets sont dans un fichier **chiffré AES-256-GCM**
//! (`~/.dbdump/secrets.enc`) dont la clé locale (`secrets.key`, 32 octets,
//! permissions 0600 sous Unix) est générée une fois. Compromis assumé : plus
//! aucun prompt, sur toutes les plateformes, au prix d'une clé au repos sur la
//! machine (protégée par les permissions du fichier). Le même backend sert en
//! debug et en release ; le comportement est identique.

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

// --- Coffre-fort fichier chiffré (toutes plateformes, debug + release) ----------
mod backend {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Mutex;

    // Sérialise les accès concurrents au fichier (test connexion + dump peuvent
    // lire/écrire en parallèle).
    static LOCK: Mutex<()> = Mutex::new(());

    /// Dossier utilisateur stable : survit aux rebuilds ET aux reboots.
    fn dir() -> PathBuf {
        let base = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        base.join(".dbdump")
    }

    fn vault_path() -> PathBuf {
        dir().join("secrets.enc")
    }
    fn key_path() -> PathBuf {
        dir().join("secrets.key")
    }

    /// Clé locale du coffre : 32 octets aléatoires, générés une fois puis
    /// conservés (permissions 0600 sous Unix). C'est le compromis assumé pour se
    /// passer du trousseau : plus de prompt, clé au repos protégée par les
    /// permissions du fichier.
    fn key() -> Result<[u8; 32], String> {
        if let Ok(b) = std::fs::read(key_path()) {
            if b.len() == 32 {
                let mut k = [0u8; 32];
                k.copy_from_slice(&b);
                return Ok(k);
            }
        }
        std::fs::create_dir_all(dir()).map_err(|e| e.to_string())?;
        let mut k = [0u8; 32];
        getrandom::fill(&mut k).map_err(|e| e.to_string())?;
        write_private(&key_path(), &k)?;
        Ok(k)
    }

    /// Écriture avec permissions restrictives (0600) sous Unix.
    #[cfg(unix)]
    fn write_private(p: &PathBuf, data: &[u8]) -> Result<(), String> {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(p)
            .map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())
    }
    #[cfg(not(unix))]
    fn write_private(p: &PathBuf, data: &[u8]) -> Result<(), String> {
        std::fs::write(p, data).map_err(|e| e.to_string())
    }

    fn load() -> HashMap<String, String> {
        let blob = match std::fs::read(vault_path()) {
            Ok(b) => b,
            Err(_) => return HashMap::new(),
        };
        if blob.len() < 12 {
            return HashMap::new();
        }
        let k = match key() {
            Ok(k) => k,
            Err(_) => return HashMap::new(),
        };
        let (nonce_bytes, ciphertext) = blob.split_at(12);
        let nonce = match Nonce::try_from(nonce_bytes) {
            Ok(n) => n,
            Err(_) => return HashMap::new(),
        };
        let cipher = Aes256Gcm::new(&k.into());
        match cipher.decrypt(&nonce, ciphertext) {
            Ok(pt) => serde_json::from_slice(&pt).unwrap_or_default(),
            Err(_) => HashMap::new(),
        }
    }

    fn store(map: &HashMap<String, String>) -> Result<(), String> {
        std::fs::create_dir_all(dir()).map_err(|e| e.to_string())?;
        let k = key()?;
        let cipher = Aes256Gcm::new(&k.into());

        // Nonce neuf à chaque écriture (réutilisation = rupture de GCM).
        let mut nonce_bytes = [0u8; 12];
        getrandom::fill(&mut nonce_bytes).map_err(|e| e.to_string())?;
        let plaintext = serde_json::to_vec(map).map_err(|e| e.to_string())?;
        let ciphertext = cipher
            .encrypt(&Nonce::from(nonce_bytes), plaintext.as_ref())
            .map_err(|e| e.to_string())?;

        let mut blob = nonce_bytes.to_vec();
        blob.extend_from_slice(&ciphertext);

        // Écriture atomique pour ne pas laisser un coffre tronqué.
        let p = vault_path();
        let tmp = p.with_extension("tmp");
        write_private(&tmp, &blob)?;
        std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
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
