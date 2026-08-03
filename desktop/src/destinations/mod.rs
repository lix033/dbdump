//! Destinations de sauvegarde : où atterrit le fichier produit par un dump.
//!
//! Quatre transports couvrent la liste demandée :
//!
//! | Transport | Couvre                                                        |
//! |-----------|---------------------------------------------------------------|
//! | `Folder`  | dossier local, disque externe, NAS et partage réseau **montés** |
//! | `Sftp`    | SFTP (SSH)                                                     |
//! | `Ftp`     | FTP et FTPS                                                    |
//! | `S3`      | Amazon S3, MinIO, Cloudflare R2 — même protocole, même code    |
//!
//! Un NAS ou un partage réseau n'a pas besoin d'un transport à lui : monté par
//! l'OS (SMB, AFP, NFS), c'est un chemin comme un autre. Ce qui change, c'est
//! qu'il peut *disparaître* — d'où la vérification d'existence avant chaque
//! écriture plutôt qu'un `create_dir_all` qui écrirait sur le disque interne.
//!
//! Les secrets (mot de passe SFTP/FTP, clé secrète S3) ne sont **pas** dans ce
//! fichier : ils vivent dans le coffre chiffré, sous la clé `dest:<id>`.

mod folder;
mod ftp;
mod s3;
mod sftp;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::i18n::{msg, Lang};

/// Une destination enregistrée.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    pub id: String,
    pub name: String,
    #[serde(flatten)]
    pub kind: DestinationKind,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum DestinationKind {
    /// Dossier local, disque externe, NAS ou partage réseau monté.
    Folder { path: String },
    Sftp {
        host: String,
        port: u16,
        username: String,
        remote_dir: String,
        /// Chemin d'une clé privée. Vide = authentification par mot de passe.
        #[serde(default)]
        private_key_path: String,
    },
    Ftp {
        host: String,
        port: u16,
        username: String,
        remote_dir: String,
        /// FTPS explicite (AUTH TLS). Le FTP nu envoie tout en clair.
        #[serde(default)]
        tls: bool,
    },
    /// Amazon S3 et tout service compatible (MinIO, Cloudflare R2…).
    S3 {
        /// Vide pour Amazon S3 ; l'URL du service sinon.
        #[serde(default)]
        endpoint: String,
        region: String,
        bucket: String,
        /// Préfixe de clé, façon dossier. Peut être vide.
        #[serde(default)]
        prefix: String,
        access_key_id: String,
        /// MinIO exige souvent le style « chemin » (bucket dans l'URL).
        #[serde(default)]
        path_style: bool,
    },
}

impl DestinationKind {
    /// Étiquette technique utilisée dans les journaux (jamais traduite).
    pub fn tag(&self) -> &'static str {
        match self {
            DestinationKind::Folder { .. } => "folder",
            DestinationKind::Sftp { .. } => "sftp",
            DestinationKind::Ftp { .. } => "ftp",
            DestinationKind::S3 { .. } => "s3",
        }
    }
}

/// Résultat d'un envoi vers **une** destination. Un envoi qui échoue n'annule
/// pas les autres : chaque destination a son verdict, et l'UI les montre tous.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryResult {
    pub destination_id: String,
    pub destination_name: String,
    pub ok: bool,
    /// Chemin ou URL du fichier chez la destination, quand l'envoi a réussi.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub bytes: u64,
    pub millis: u64,
}

/// Espace disponible sur une destination, quand la question a un sens.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreeSpace {
    pub free_bytes: u64,
    pub total_bytes: u64,
}

/// Envoie `local` vers `dest` sous le nom `remote_name`.
///
/// Un dump au format « répertoire » (pg_dump `--format=directory`, mongodump)
/// est empaqueté en `.tar.gz` pour les transports distants : ni SFTP, ni FTP, ni
/// S3 n'ont de notion d'arborescence à copier d'un bloc.
pub async fn deliver(
    dest: &Destination,
    local: &Path,
    remote_name: &str,
    staging: &Path,
    lang: Lang,
) -> DeliveryResult {
    let started = std::time::Instant::now();
    let mut result = DeliveryResult {
        destination_id: dest.id.clone(),
        destination_name: dest.name.clone(),
        ok: false,
        location: None,
        error: None,
        bytes: 0,
        millis: 0,
    };

    let outcome = deliver_inner(dest, local, remote_name, staging, lang).await;
    result.millis = started.elapsed().as_millis() as u64;
    match outcome {
        Ok((location, bytes)) => {
            result.ok = true;
            result.location = Some(location);
            result.bytes = bytes;
        }
        Err(error) => result.error = Some(error),
    }
    result
}

async fn deliver_inner(
    dest: &Destination,
    local: &Path,
    remote_name: &str,
    staging: &Path,
    lang: Lang,
) -> Result<(String, u64), String> {
    // Le transport « dossier » sait copier une arborescence : pas d'archive.
    if let DestinationKind::Folder { path } = &dest.kind {
        return folder::deliver(Path::new(path), local, remote_name, lang);
    }

    let (payload, name, _temp) = archive_if_directory(local, remote_name, staging, lang)?;
    let bytes = std::fs::metadata(&payload).map_err(|e| e.to_string())?.len();
    let secret = crate::secrets::get_destination_secret(&dest.id)?.unwrap_or_default();

    let location = match &dest.kind {
        DestinationKind::Folder { .. } => unreachable!("traité plus haut"),
        DestinationKind::Sftp {
            host,
            port,
            username,
            remote_dir,
            private_key_path,
        } => {
            sftp::deliver(
                sftp::Params {
                    host: host.clone(),
                    port: *port,
                    username: username.clone(),
                    remote_dir: remote_dir.clone(),
                    private_key_path: private_key_path.clone(),
                    secret,
                },
                payload.clone(),
                name.clone(),
                lang,
            )
            .await?
        }
        DestinationKind::Ftp {
            host,
            port,
            username,
            remote_dir,
            tls,
        } => {
            ftp::deliver(
                ftp::Params {
                    host: host.clone(),
                    port: *port,
                    username: username.clone(),
                    remote_dir: remote_dir.clone(),
                    tls: *tls,
                    secret,
                },
                payload.clone(),
                name.clone(),
                lang,
            )
            .await?
        }
        DestinationKind::S3 {
            endpoint,
            region,
            bucket,
            prefix,
            access_key_id,
            path_style,
        } => {
            s3::deliver(
                s3::Params {
                    endpoint: endpoint.clone(),
                    region: region.clone(),
                    bucket: bucket.clone(),
                    prefix: prefix.clone(),
                    access_key_id: access_key_id.clone(),
                    secret_access_key: secret,
                    path_style: *path_style,
                },
                payload.clone(),
                name.clone(),
                lang,
            )
            .await?
        }
    };

    Ok((location, bytes))
}

/// Vérifie qu'une destination répond et qu'on peut y écrire.
pub async fn test(dest: &Destination, lang: Lang) -> Result<String, String> {
    let secret = crate::secrets::get_destination_secret(&dest.id)?.unwrap_or_default();
    match &dest.kind {
        DestinationKind::Folder { path } => folder::test(Path::new(path), lang),
        DestinationKind::Sftp {
            host,
            port,
            username,
            remote_dir,
            private_key_path,
        } => {
            sftp::test(
                sftp::Params {
                    host: host.clone(),
                    port: *port,
                    username: username.clone(),
                    remote_dir: remote_dir.clone(),
                    private_key_path: private_key_path.clone(),
                    secret,
                },
                lang,
            )
            .await
        }
        DestinationKind::Ftp {
            host,
            port,
            username,
            remote_dir,
            tls,
        } => {
            ftp::test(
                ftp::Params {
                    host: host.clone(),
                    port: *port,
                    username: username.clone(),
                    remote_dir: remote_dir.clone(),
                    tls: *tls,
                    secret,
                },
                lang,
            )
            .await
        }
        DestinationKind::S3 {
            endpoint,
            region,
            bucket,
            prefix,
            access_key_id,
            path_style,
        } => {
            s3::test(
                s3::Params {
                    endpoint: endpoint.clone(),
                    region: region.clone(),
                    bucket: bucket.clone(),
                    prefix: prefix.clone(),
                    access_key_id: access_key_id.clone(),
                    secret_access_key: secret,
                    path_style: *path_style,
                },
                lang,
            )
            .await
        }
    }
}

/// Espace libre, quand la destination sait le dire. `None` pour FTP (pas de
/// commande standard) et S3 (pas de notion de disque).
pub async fn free_space(dest: &Destination) -> Option<FreeSpace> {
    match &dest.kind {
        DestinationKind::Folder { path } => folder::free_space(Path::new(path)),
        DestinationKind::Sftp {
            host,
            port,
            username,
            remote_dir,
            private_key_path,
        } => {
            let secret = crate::secrets::get_destination_secret(&dest.id)
                .ok()
                .flatten()
                .unwrap_or_default();
            sftp::free_space(sftp::Params {
                host: host.clone(),
                port: *port,
                username: username.clone(),
                remote_dir: remote_dir.clone(),
                private_key_path: private_key_path.clone(),
                secret,
            })
            .await
        }
        DestinationKind::Ftp { .. } | DestinationKind::S3 { .. } => None,
    }
}

/// Envoie le même fichier vers toutes les destinations demandées, **en
/// parallèle** : un NAS lent ne doit pas retarder un envoi S3. Chaque
/// destination a son verdict ; un échec n'annule pas les autres et n'invalide
/// pas le dump, qui est déjà écrit.
///
/// `on_log` reçoit une ligne par étape, dans la langue de l'UI : c'est ce que
/// l'utilisateur lit dans le journal du dump.
pub async fn deliver_all(
    all: &[Destination],
    wanted: &[String],
    local: &Path,
    remote_name: &str,
    staging: &Path,
    lang: Lang,
    mut on_log: impl FnMut(String),
) -> Vec<DeliveryResult> {
    let selected: Vec<Destination> = wanted
        .iter()
        .filter_map(|id| all.iter().find(|d| &d.id == id).cloned())
        .collect();
    if selected.is_empty() {
        return Vec::new();
    }

    let mut tasks = tokio::task::JoinSet::new();
    for dest in selected {
        on_log(msg::delivery_start(lang, &dest.name));
        let local = local.to_path_buf();
        let remote_name = remote_name.to_string();
        let staging = staging.to_path_buf();
        tasks.spawn(async move { deliver(&dest, &local, &remote_name, &staging, lang).await });
    }

    let mut results = Vec::new();
    while let Some(joined) = tasks.join_next().await {
        match joined {
            Ok(result) => {
                on_log(match (&result.ok, &result.error) {
                    (true, _) => msg::delivery_done(
                        lang,
                        &result.destination_name,
                        result.bytes,
                        result.millis,
                    ),
                    (false, Some(error)) => {
                        msg::delivery_failed(lang, &result.destination_name, error)
                    }
                    (false, None) => msg::delivery_failed(lang, &result.destination_name, ""),
                });
                results.push(result);
            }
            // Une tâche qui panique ne doit pas emporter le dump avec elle.
            Err(error) => on_log(msg::delivery_failed(lang, "", &error.to_string())),
        }
    }
    results
}

/// Supprime le dossier temporaire quand il sort de portée : une archive
/// intermédiaire ne doit pas survivre à l'envoi.
struct TempFile(Option<PathBuf>);

impl Drop for TempFile {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Rend (fichier à envoyer, nom distant, garde de nettoyage). Empaquette si la
/// sortie du dump est un dossier.
fn archive_if_directory(
    local: &Path,
    remote_name: &str,
    staging: &Path,
    lang: Lang,
) -> Result<(PathBuf, String, TempFile), String> {
    if !local.is_dir() {
        return Ok((local.to_path_buf(), remote_name.to_string(), TempFile(None)));
    }

    std::fs::create_dir_all(staging).map_err(|e| e.to_string())?;
    let name = format!("{remote_name}.tar.gz");
    let archive_path = staging.join(&name);
    let file = std::fs::File::create(&archive_path)
        .map_err(|e| msg::archive_failed(lang, &e.to_string()))?;
    let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
    let mut builder = tar::Builder::new(encoder);
    // Le dossier est rangé sous son propre nom dans l'archive : une extraction
    // ne déverse pas cinquante fichiers dans le dossier courant.
    let base = local
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "dump".into());
    builder
        .append_dir_all(&base, local)
        .and_then(|_| builder.into_inner()?.finish())
        .map_err(|e| msg::archive_failed(lang, &e.to_string()))?;

    Ok((archive_path.clone(), name, TempFile(Some(archive_path))))
}
