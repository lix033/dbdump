//! Destination SFTP (SSH).
//!
//! **Clé d'hôte vérifiée.** Un client qui accepte n'importe quelle clé d'hôte
//! offre vos sauvegardes — donc vos bases — à qui sait s'intercaler sur le
//! réseau. On refuse donc de continuer si l'hôte est inconnu de
//! `~/.ssh/known_hosts` : un `ssh utilisateur@hôte` suffit à l'y inscrire, et
//! l'utilisateur voit l'empreinte au moment où il l'accepte, ce qui est
//! exactement là où cette décision doit se prendre.
//!
//! `ssh2` est une bibliothèque bloquante : tout passe par `spawn_blocking` pour
//! ne pas figer l'ordonnanceur ni l'UI.

use std::io::Write;
use std::net::TcpStream;
use std::path::{Path, PathBuf};

use ssh2::{CheckResult, KnownHostFileKind, Session};

use super::FreeSpace;
use crate::i18n::{msg, Lang};

#[derive(Clone)]
pub struct Params {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub remote_dir: String,
    /// Vide = authentification par mot de passe.
    pub private_key_path: String,
    /// Mot de passe, ou phrase de passe de la clé privée.
    pub secret: String,
}

pub async fn deliver(
    params: Params,
    local: PathBuf,
    remote_name: String,
    lang: Lang,
) -> Result<String, String> {
    blocking(move || {
        let session = connect(&params, lang)?;
        let sftp = session.sftp().map_err(|e| e.to_string())?;
        let remote_path = join_remote(&params.remote_dir, &remote_name);

        let mut source = std::fs::File::open(&local).map_err(|e| e.to_string())?;
        let mut target = sftp
            .create(Path::new(&remote_path))
            .map_err(|e| msg::remote_write_failed(lang, &remote_path, &e.to_string()))?;
        std::io::copy(&mut source, &mut target)
            .map_err(|e| msg::remote_write_failed(lang, &remote_path, &e.to_string()))?;
        // Sans ce flush explicite, une erreur de fin d'écriture passerait
        // inaperçue et le fichier distant serait tronqué.
        target.flush().map_err(|e| e.to_string())?;

        Ok(format!(
            "sftp://{}@{}:{}{}",
            params.username, params.host, params.port, remote_path
        ))
    })
    .await
}

pub async fn test(params: Params, lang: Lang) -> Result<String, String> {
    blocking(move || {
        let session = connect(&params, lang)?;
        let sftp = session.sftp().map_err(|e| e.to_string())?;
        let dir = Path::new(&params.remote_dir);
        sftp.stat(dir)
            .map_err(|e| msg::remote_dir_missing(lang, &params.remote_dir, &e.to_string()))?;

        // Écriture réelle : un dossier peut se lister sans être inscriptible.
        let probe = join_remote(&params.remote_dir, ".dbdump-write-test");
        let mut file = sftp
            .create(Path::new(&probe))
            .map_err(|e| msg::not_writable(lang, &e.to_string()))?;
        file.write_all(b"dbdump").map_err(|e| e.to_string())?;
        drop(file);
        let _ = sftp.unlink(Path::new(&probe));

        Ok(match space_of(&sftp, &params.remote_dir) {
            Some(space) => msg::destination_ready_with_space(lang, space.free_bytes),
            None => msg::destination_ready(lang).to_string(),
        })
    })
    .await
}

pub async fn free_space(params: Params) -> Option<FreeSpace> {
    blocking(move || {
        let session = connect(&params, Lang::En)?;
        let sftp = session.sftp().map_err(|e| e.to_string())?;
        space_of(&sftp, &params.remote_dir).ok_or_else(|| "statvfs indisponible".to_string())
    })
    .await
    .ok()
}

/// Ouvre une session authentifiée, clé d'hôte vérifiée.
fn connect(params: &Params, lang: Lang) -> Result<Session, String> {
    let address = format!("{}:{}", params.host, params.port);
    let tcp = TcpStream::connect(&address)
        .map_err(|e| msg::connect_failed(lang, &address, &e.to_string()))?;

    let mut session = Session::new().map_err(|e| e.to_string())?;
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|e| msg::connect_failed(lang, &address, &e.to_string()))?;

    verify_host_key(&session, params, lang)?;

    if params.private_key_path.is_empty() {
        session
            .userauth_password(&params.username, &params.secret)
            .map_err(|e| msg::auth_failed(lang, &e.to_string()))?;
    } else {
        let passphrase = (!params.secret.is_empty()).then_some(params.secret.as_str());
        session
            .userauth_pubkey_file(
                &params.username,
                None,
                Path::new(&params.private_key_path),
                passphrase,
            )
            .map_err(|e| msg::auth_failed(lang, &e.to_string()))?;
    }

    if !session.authenticated() {
        return Err(msg::auth_failed(lang, "authentication rejected"));
    }
    Ok(session)
}

/// Compare la clé présentée à `~/.ssh/known_hosts`.
fn verify_host_key(session: &Session, params: &Params, lang: Lang) -> Result<(), String> {
    let Some((key, _kind)) = session.host_key() else {
        return Err(msg::host_key_unknown(lang, &params.host));
    };
    let fingerprint = fingerprint(session);

    let mut known = session.known_hosts().map_err(|e| e.to_string())?;
    let path = home().join(".ssh").join("known_hosts");
    // Fichier absent = aucun hôte connu : `check_port` répondra NotFound, ce qui
    // est le bon message. Ne pas échouer ici.
    let _ = known.read_file(&path, KnownHostFileKind::OpenSSH);

    match known.check_port(&params.host, params.port, key) {
        CheckResult::Match => Ok(()),
        CheckResult::NotFound => Err(msg::host_key_unknown_hint(
            lang,
            &params.host,
            &params.username,
            &fingerprint,
        )),
        CheckResult::Mismatch => Err(msg::host_key_mismatch(lang, &params.host, &fingerprint)),
        CheckResult::Failure => Err(msg::host_key_unknown(lang, &params.host)),
    }
}

/// Empreinte SHA-256 de la clé d'hôte, au format affiché par OpenSSH.
fn fingerprint(session: &Session) -> String {
    match session.host_key_hash(ssh2::HashType::Sha256) {
        Some(hash) => format!(
            "SHA256:{}",
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD_NO_PAD, hash)
        ),
        None => String::new(),
    }
}

fn space_of(sftp: &ssh2::Sftp, dir: &str) -> Option<FreeSpace> {
    let mut handle = sftp.opendir(Path::new(dir)).ok()?;
    let stats = handle.statvfs().ok()?;
    let block = stats.f_frsize.max(1);
    Some(FreeSpace {
        free_bytes: stats.f_bavail * block,
        total_bytes: stats.f_blocks * block,
    })
}

/// Chemin distant en style POSIX : le serveur n'a pas les séparateurs de Windows.
fn join_remote(dir: &str, name: &str) -> String {
    let base = dir.trim_end_matches('/');
    if base.is_empty() {
        format!("/{name}")
    } else {
        format!("{base}/{name}")
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
}

/// Exécute du code bloquant hors du runtime asynchrone.
async fn blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}
