//! Destination FTP / FTPS.
//!
//! Le FTP nu fait transiter identifiants **et** contenu en clair : sur autre
//! chose qu'un réseau local de confiance, c'est le FTPS explicite (AUTH TLS)
//! qu'il faut, d'où l'option `tls`. L'UI le rappelle au moment du choix.
//!
//! `suppaftp` est bloquant : tout passe par `spawn_blocking`.

use std::path::PathBuf;

use suppaftp::{FtpStream, RustlsConnector, RustlsFtpStream};

use crate::i18n::{msg, Lang};

#[derive(Clone)]
pub struct Params {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub remote_dir: String,
    pub tls: bool,
    pub secret: String,
}

/// Les deux variantes de flux ne partagent pas de type : ce petit enum évite de
/// dupliquer la logique d'envoi pour chacune.
enum Stream {
    Plain(FtpStream),
    Secure(Box<RustlsFtpStream>),
}

impl Stream {
    fn login(&mut self, user: &str, password: &str) -> Result<(), String> {
        match self {
            Stream::Plain(s) => s.login(user, password).map_err(|e| e.to_string()),
            Stream::Secure(s) => s.login(user, password).map_err(|e| e.to_string()),
        }
    }

    fn cwd(&mut self, dir: &str) -> Result<(), String> {
        match self {
            Stream::Plain(s) => s.cwd(dir).map_err(|e| e.to_string()),
            Stream::Secure(s) => s.cwd(dir).map_err(|e| e.to_string()),
        }
    }

    fn put_file(&mut self, name: &str, reader: &mut std::fs::File) -> Result<u64, String> {
        match self {
            Stream::Plain(s) => s.put_file(name, reader).map_err(|e| e.to_string()),
            Stream::Secure(s) => s.put_file(name, reader).map_err(|e| e.to_string()),
        }
    }

    fn quit(&mut self) {
        let _ = match self {
            Stream::Plain(s) => s.quit(),
            Stream::Secure(s) => s.quit(),
        };
    }
}

pub async fn deliver(
    params: Params,
    local: PathBuf,
    remote_name: String,
    lang: Lang,
) -> Result<String, String> {
    blocking(move || {
        let mut stream = connect(&params, lang)?;
        let mut file = std::fs::File::open(&local).map_err(|e| e.to_string())?;
        stream
            .put_file(&remote_name, &mut file)
            .map_err(|e| msg::remote_write_failed(lang, &remote_name, &e))?;
        stream.quit();

        let dir = params.remote_dir.trim_end_matches('/');
        Ok(format!(
            "{}://{}@{}:{}{}/{}",
            if params.tls { "ftps" } else { "ftp" },
            params.username,
            params.host,
            params.port,
            dir,
            remote_name
        ))
    })
    .await
}

pub async fn test(params: Params, lang: Lang) -> Result<String, String> {
    blocking(move || {
        let mut stream = connect(&params, lang)?;
        // Écriture réelle : un compte FTP peut lister sans pouvoir déposer.
        let mut probe = tempfile()?;
        stream
            .put_file(".dbdump-write-test", &mut probe)
            .map_err(|e| msg::not_writable(lang, &e))?;
        stream.quit();
        Ok(msg::destination_ready(lang).to_string())
    })
    .await
}

fn connect(params: &Params, lang: Lang) -> Result<Stream, String> {
    let address = format!("{}:{}", params.host, params.port);
    let mut stream = if params.tls {
        let plain = RustlsFtpStream::connect(&address)
            .map_err(|e| msg::connect_failed(lang, &address, &e.to_string()))?;
        let config = rustls_config();
        let secure = plain
            .into_secure(RustlsConnector::from(std::sync::Arc::new(config)), &params.host)
            .map_err(|e| msg::tls_failed(lang, &e.to_string()))?;
        Stream::Secure(Box::new(secure))
    } else {
        Stream::Plain(
            FtpStream::connect(&address)
                .map_err(|e| msg::connect_failed(lang, &address, &e.to_string()))?,
        )
    };

    stream
        .login(&params.username, &params.secret)
        .map_err(|e| msg::auth_failed(lang, &e))?;
    if !params.remote_dir.is_empty() {
        stream
            .cwd(&params.remote_dir)
            .map_err(|e| msg::remote_dir_missing(lang, &params.remote_dir, &e))?;
    }
    Ok(stream)
}

/// Vérification des certificats par le magasin de l'OS, comme un navigateur.
fn rustls_config() -> rustls::ClientConfig {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth()
}

/// Fichier témoin d'un octet, pour tester le droit d'écriture.
fn tempfile() -> Result<std::fs::File, String> {
    let path = std::env::temp_dir().join(".dbdump-write-test");
    std::fs::write(&path, b"dbdump").map_err(|e| e.to_string())?;
    std::fs::File::open(&path).map_err(|e| e.to_string())
}

async fn blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}
