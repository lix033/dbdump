//! Destination S3 et compatibles.
//!
//! Amazon S3, MinIO et Cloudflare R2 parlent le même protocole : une seule
//! implémentation les couvre tous les trois. Ce qui les distingue tient dans la
//! configuration —
//!
//! - **Amazon S3** : endpoint vide, région réelle (`eu-west-3`).
//! - **MinIO** : endpoint de l'instance, région libre, style « chemin » exigé.
//! - **Cloudflare R2** : endpoint `https://<compte>.r2.cloudflarestorage.com`,
//!   région `auto`.
//!
//! L'envoi est fait en flux (`put_object_stream`) : un dump de plusieurs Go ne
//! passe jamais entièrement en mémoire.

use std::path::PathBuf;

use s3::{creds::Credentials, Bucket, Region};

use crate::i18n::{msg, Lang};

#[derive(Clone)]
pub struct Params {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub path_style: bool,
}

pub async fn deliver(
    params: Params,
    local: PathBuf,
    remote_name: String,
    lang: Lang,
) -> Result<String, String> {
    let bucket = bucket(&params, lang)?;
    let key = join_key(&params.prefix, &remote_name);

    let mut file = tokio::fs::File::open(&local)
        .await
        .map_err(|e| e.to_string())?;
    let response = bucket
        .put_object_stream(&mut file, &key)
        .await
        .map_err(|e| msg::remote_write_failed(lang, &key, &e.to_string()))?;

    // S3 répond 200 même pour certaines erreurs applicatives : on vérifie le code.
    if !(200..300).contains(&response.status_code()) {
        return Err(msg::remote_write_failed(
            lang,
            &key,
            &format!("HTTP {}", response.status_code()),
        ));
    }
    Ok(format!("s3://{}/{}", params.bucket, key))
}

pub async fn test(params: Params, lang: Lang) -> Result<String, String> {
    let bucket = bucket(&params, lang)?;
    // Aller-retour complet plutôt qu'un simple listing : c'est le droit
    // d'**écriture** qui compte, et une politique IAM peut donner l'un sans l'autre.
    let key = join_key(&params.prefix, ".dbdump-write-test");
    let put = bucket
        .put_object(&key, b"dbdump")
        .await
        .map_err(|e| msg::not_writable(lang, &e.to_string()))?;
    if !(200..300).contains(&put.status_code()) {
        return Err(msg::not_writable(
            lang,
            &format!("HTTP {}", put.status_code()),
        ));
    }
    let _ = bucket.delete_object(&key).await;
    Ok(msg::destination_ready(lang).to_string())
}

fn bucket(params: &Params, lang: Lang) -> Result<Box<Bucket>, String> {
    let region = if params.endpoint.trim().is_empty() {
        params
            .region
            .parse::<Region>()
            .map_err(|e| msg::s3_config_invalid(lang, &e.to_string()))?
    } else {
        Region::Custom {
            region: params.region.clone(),
            endpoint: params.endpoint.trim_end_matches('/').to_string(),
        }
    };

    let credentials = Credentials::new(
        Some(&params.access_key_id),
        Some(&params.secret_access_key),
        None,
        None,
        None,
    )
    .map_err(|e| msg::s3_config_invalid(lang, &e.to_string()))?;

    let bucket =
        Bucket::new(&params.bucket, region, credentials).map_err(|e| msg::s3_config_invalid(lang, &e.to_string()))?;
    Ok(if params.path_style {
        bucket.with_path_style()
    } else {
        bucket
    })
}

/// Clé de l'objet : le préfixe joue le rôle d'un dossier, sans « / » en trop.
fn join_key(prefix: &str, name: &str) -> String {
    let base = prefix.trim_matches('/');
    if base.is_empty() {
        name.to_string()
    } else {
        format!("{base}/{name}")
    }
}

#[cfg(test)]
mod tests {
    use super::join_key;

    #[test]
    fn keys_never_double_the_separator() {
        assert_eq!(join_key("", "dump.sql"), "dump.sql");
        assert_eq!(join_key("backups", "dump.sql"), "backups/dump.sql");
        assert_eq!(join_key("/backups/", "dump.sql"), "backups/dump.sql");
        assert_eq!(join_key("a/b", "dump.sql"), "a/b/dump.sql");
    }
}
