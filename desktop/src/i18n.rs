//! Messages du backend dans la langue de l'interface.
//!
//! Le frontend passe sa langue courante (`lang: "en" | "fr"`) à chaque commande
//! qui produit du texte lu par l'utilisateur : conseils d'installation, résultat
//! d'un test de connexion, journal et erreurs de dump.
//!
//! Ne passent **pas** par ici : la sortie des outils (`pg_dump`, `mysqldump`…),
//! toujours en anglais et relayée telle quelle — c'est la cause exacte, la
//! traduire la rendrait introuvable —, et les erreurs internes de `store.rs` /
//! `secrets.rs`, diagnostics techniques laissés en anglais.

use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    #[default]
    En,
    Fr,
}

impl Lang {
    /// Tolérant par construction : une étiquette inconnue ou régionalisée
    /// (`fr-CA`, `en-GB`, `""`) ne doit jamais faire échouer une commande.
    pub fn from_tag(tag: &str) -> Self {
        if tag.to_ascii_lowercase().starts_with("fr") {
            Lang::Fr
        } else {
            Lang::En
        }
    }

    /// Choisit la variante correspondant à la langue.
    #[inline]
    pub fn pick(self, en: &'static str, fr: &'static str) -> &'static str {
        match self {
            Lang::En => en,
            Lang::Fr => fr,
        }
    }
}

impl<'de> Deserialize<'de> for Lang {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let tag = String::deserialize(deserializer)?;
        Ok(Lang::from_tag(&tag))
    }
}

/// Tous les textes destinés à l'utilisateur, groupés pour être relus d'un coup
/// d'œil dans les deux langues.
pub mod msg {
    use super::Lang;

    // ── Test de connexion ────────────────────────────────────────────────────

    pub fn file_readable(lang: Lang) -> &'static str {
        lang.pick("File is readable", "Fichier lisible")
    }

    pub fn file_unreadable(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("Unreadable file: {cause}"),
            Lang::Fr => format!("Fichier illisible : {cause}"),
        }
    }

    pub fn probe_missing(lang: Lang, probe: &str, hint: &str) -> String {
        match lang {
            Lang::En => format!("{probe} not found. Install it with: {hint}"),
            Lang::Fr => format!("{probe} introuvable. Installez-le avec : {hint}"),
        }
    }

    pub fn connection_established(lang: Lang) -> &'static str {
        lang.pick("Connection established", "Connexion établie")
    }

    // ── Dump ─────────────────────────────────────────────────────────────────

    pub fn spawn_failed(lang: Lang, bin: &str, cause: &str) -> String {
        match lang {
            Lang::En => format!("could not start {bin}: {cause}"),
            Lang::Fr => format!("impossible de lancer {bin} : {cause}"),
        }
    }

    pub fn dump_cancelled(lang: Lang) -> &'static str {
        lang.pick("Dump cancelled", "Dump annulé")
    }

    pub fn dump_failed_silent(lang: Lang, bin: &str, code: i32) -> String {
        match lang {
            Lang::En => format!("{bin} failed (exit code {code}), with no details on stderr."),
            Lang::Fr => {
                format!("{bin} a échoué (code {code}), sans détail sur la sortie d'erreur.")
            }
        }
    }

    pub fn dump_failed(lang: Lang, bin: &str, code: i32, detail: &str) -> String {
        match lang {
            Lang::En => format!("{bin} failed (exit code {code}):\n{detail}"),
            Lang::Fr => format!("{bin} a échoué (code {code}) :\n{detail}"),
        }
    }

    pub fn gzip_compressing(lang: Lang) -> &'static str {
        lang.pick("gzip compression…", "compression gzip…")
    }

    pub fn output_missing(lang: Lang, bin: &str, path: &str, cause: &str) -> String {
        match lang {
            Lang::En => format!(
                "{bin} finished without error but the expected file is missing:\n{path}\n({cause})"
            ),
            Lang::Fr => format!(
                "{bin} s'est terminé sans erreur mais le fichier attendu est introuvable :\n{path}\n({cause})"
            ),
        }
    }

    // ── Fourniture de pg_dump ────────────────────────────────────────────────

    pub fn unsupported_platform(lang: Lang) -> &'static str {
        lang.pick(
            "unsupported platform for the pg_dump download",
            "plateforme non prise en charge pour le téléchargement de pg_dump",
        )
    }

    pub fn pg_download_start(lang: Lang, version: &str) -> String {
        match lang {
            Lang::En => format!("pg_dump not found: downloading PostgreSQL {version}…"),
            Lang::Fr => format!("pg_dump absent : téléchargement de PostgreSQL {version}…"),
        }
    }

    pub fn download_failed(lang: Lang, url: &str, cause: &str) -> String {
        match lang {
            Lang::En => format!("download failed ({url}): {cause}"),
            Lang::Fr => format!("téléchargement impossible ({url}) : {cause}"),
        }
    }

    pub fn download_interrupted(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("download interrupted: {cause}"),
            Lang::Fr => format!("lecture du téléchargement interrompue : {cause}"),
        }
    }

    pub fn download_progress(lang: Lang, done_mb: u64, total_mb: Option<u64>) -> String {
        match (lang, total_mb) {
            (Lang::En, Some(total)) => format!("downloading… {done_mb} / {total} MB"),
            (Lang::En, None) => format!("downloading… {done_mb} MB"),
            (Lang::Fr, Some(total)) => format!("téléchargement… {done_mb} / {total} Mo"),
            (Lang::Fr, None) => format!("téléchargement… {done_mb} Mo"),
        }
    }

    pub fn extracting(lang: Lang, size_mb: u64) -> String {
        match lang {
            Lang::En => format!("extracting ({size_mb} MB)…"),
            Lang::Fr => format!("extraction ({size_mb} Mo)…"),
        }
    }

    pub fn extract_failed(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("extraction failed: {cause}"),
            Lang::Fr => format!("extraction impossible : {cause}"),
        }
    }

    pub fn pg_dump_not_in_archive(lang: Lang) -> &'static str {
        lang.pick(
            "pg_dump not found in the downloaded archive",
            "pg_dump introuvable dans l'archive téléchargée",
        )
    }

    pub fn pg_dump_ready(lang: Lang) -> &'static str {
        lang.pick("pg_dump ready.", "pg_dump prêt.")
    }

    // ── Copie vers le dossier Téléchargements ────────────────────────────────

    pub fn source_missing(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("file not found: {cause}"),
            Lang::Fr => format!("fichier introuvable : {cause}"),
        }
    }

    pub fn is_a_directory(lang: Lang) -> &'static str {
        lang.pick(
            "This format produces a folder; use “Open folder”.",
            "Ce format produit un dossier ; utilisez « Ouvrir le dossier ».",
        )
    }

    pub fn invalid_path(lang: Lang) -> &'static str {
        lang.pick("invalid path", "chemin invalide")
    }

    // ── Destinations ─────────────────────────────────────────────────────────

    pub fn destination_unavailable(lang: Lang, path: &str) -> String {
        match lang {
            Lang::En => format!(
                "Destination unavailable: {path}\n(external drive unplugged or network share not mounted?)"
            ),
            Lang::Fr => format!(
                "Destination indisponible : {path}\n(disque externe débranché ou partage réseau non monté ?)"
            ),
        }
    }

    pub fn destination_ready(lang: Lang) -> &'static str {
        lang.pick("Destination reachable and writable", "Destination joignable et inscriptible")
    }

    pub fn destination_ready_with_space(lang: Lang, free_bytes: u64) -> String {
        let gb = free_bytes as f64 / 1_073_741_824.0;
        match lang {
            Lang::En => format!("Destination reachable and writable · {gb:.1} GB free"),
            Lang::Fr => format!("Destination joignable et inscriptible · {gb:.1} Go libres"),
        }
    }

    pub fn not_writable(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("Destination is not writable: {cause}"),
            Lang::Fr => format!("Destination non inscriptible : {cause}"),
        }
    }

    pub fn copy_failed(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("copy failed: {cause}"),
            Lang::Fr => format!("copie impossible : {cause}"),
        }
    }

    pub fn connect_failed(lang: Lang, address: &str, cause: &str) -> String {
        match lang {
            Lang::En => format!("could not connect to {address}: {cause}"),
            Lang::Fr => format!("connexion à {address} impossible : {cause}"),
        }
    }

    pub fn auth_failed(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("authentication refused: {cause}"),
            Lang::Fr => format!("authentification refusée : {cause}"),
        }
    }

    pub fn tls_failed(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("TLS negotiation failed: {cause}"),
            Lang::Fr => format!("négociation TLS impossible : {cause}"),
        }
    }

    pub fn remote_dir_missing(lang: Lang, dir: &str, cause: &str) -> String {
        match lang {
            Lang::En => format!("remote folder unreachable ({dir}): {cause}"),
            Lang::Fr => format!("dossier distant inaccessible ({dir}) : {cause}"),
        }
    }

    pub fn remote_write_failed(lang: Lang, path: &str, cause: &str) -> String {
        match lang {
            Lang::En => format!("could not write {path}: {cause}"),
            Lang::Fr => format!("écriture de {path} impossible : {cause}"),
        }
    }

    pub fn archive_failed(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("could not archive the dump folder: {cause}"),
            Lang::Fr => format!("archivage du dossier de dump impossible : {cause}"),
        }
    }

    pub fn delivery_start(lang: Lang, name: &str) -> String {
        match lang {
            Lang::En => format!("→ {name}: sending…"),
            Lang::Fr => format!("→ {name} : envoi…"),
        }
    }

    pub fn delivery_done(lang: Lang, name: &str, bytes: u64, millis: u64) -> String {
        let mb = bytes as f64 / 1_048_576.0;
        let seconds = millis as f64 / 1000.0;
        // Le débit n'a de sens qu'au-delà de quelques dixièmes de seconde.
        let rate = if seconds > 0.2 {
            format!(" ({:.1} MB/s)", mb / seconds)
        } else {
            String::new()
        };
        match lang {
            Lang::En => format!("✓ {name}: {mb:.1} MB in {seconds:.1} s{rate}"),
            Lang::Fr => format!("✓ {name} : {mb:.1} Mo en {seconds:.1} s{rate}"),
        }
    }

    pub fn delivery_failed(lang: Lang, name: &str, cause: &str) -> String {
        match lang {
            Lang::En => format!("✗ {name}: {cause}"),
            Lang::Fr => format!("✗ {name} : {cause}"),
        }
    }

    pub fn local_copy_removed(lang: Lang, path: &str) -> String {
        match lang {
            Lang::En => format!("local copy removed ({path})"),
            Lang::Fr => format!("copie locale supprimée ({path})"),
        }
    }

    pub fn local_copy_kept(lang: Lang) -> &'static str {
        lang.pick(
            "local copy kept: no destination confirmed the transfer",
            "copie locale conservée : aucune destination n'a confirmé le transfert",
        )
    }

    pub fn s3_config_invalid(lang: Lang, cause: &str) -> String {
        match lang {
            Lang::En => format!("invalid S3 configuration: {cause}"),
            Lang::Fr => format!("configuration S3 invalide : {cause}"),
        }
    }

    // Clé d'hôte SSH : ces messages disent quoi faire, pas seulement ce qui ne
    // va pas — c'est le seul endroit où l'utilisateur peut trancher.

    pub fn host_key_unknown(lang: Lang, host: &str) -> String {
        match lang {
            Lang::En => format!("could not read the host key of {host}"),
            Lang::Fr => format!("clé d'hôte de {host} illisible"),
        }
    }

    pub fn host_key_unknown_hint(lang: Lang, host: &str, user: &str, fingerprint: &str) -> String {
        match lang {
            Lang::En => format!(
                "Unknown host {host} ({fingerprint}).\nDBDump refuses to trust it blindly: run `ssh {user}@{host}` once, check the fingerprint, accept it — then try again."
            ),
            Lang::Fr => format!(
                "Hôte {host} inconnu ({fingerprint}).\nDBDump refuse de lui faire confiance à l'aveugle : lancez une fois `ssh {user}@{host}`, vérifiez l'empreinte, acceptez-la — puis réessayez."
            ),
        }
    }

    pub fn host_key_mismatch(lang: Lang, host: &str, fingerprint: &str) -> String {
        match lang {
            Lang::En => format!(
                "The host key of {host} has CHANGED ({fingerprint}).\nEither the server was reinstalled, or someone is intercepting the connection. Nothing was sent."
            ),
            Lang::Fr => format!(
                "La clé d'hôte de {host} a CHANGÉ ({fingerprint}).\nSoit le serveur a été réinstallé, soit quelqu'un intercepte la connexion. Rien n'a été envoyé."
            ),
        }
    }

    // ── Icône de la barre de menus ───────────────────────────────────────────

    pub fn tray_show(lang: Lang) -> &'static str {
        lang.pick("Open DBDump", "Ouvrir DBDump")
    }

    pub fn tray_quit(lang: Lang) -> &'static str {
        lang.pick("Quit", "Quitter")
    }

    pub fn tray_tooltip(lang: Lang) -> &'static str {
        lang.pick(
            "DBDump — scheduled backups keep running",
            "DBDump — les sauvegardes programmées continuent",
        )
    }

    // ── Programmations ───────────────────────────────────────────────────────

    pub fn schedule_connection_missing(lang: Lang) -> &'static str {
        lang.pick(
            "The connection this schedule points at no longer exists.",
            "La connexion visée par cette programmation n'existe plus.",
        )
    }

    /// Un disque externe débranché ou un partage réseau non monté : recréer le
    /// dossier écrirait en douce sur le disque interne, autant le dire.
    pub fn schedule_destination_missing(lang: Lang, path: &str) -> String {
        match lang {
            Lang::En => format!(
                "Destination folder unavailable: {path}\n(external drive unplugged or network share not mounted?)"
            ),
            Lang::Fr => format!(
                "Dossier de destination indisponible : {path}\n(disque externe débranché ou partage réseau non monté ?)"
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_language_tags_leniently() {
        assert_eq!(Lang::from_tag("fr"), Lang::Fr);
        assert_eq!(Lang::from_tag("fr-CA"), Lang::Fr);
        assert_eq!(Lang::from_tag("en"), Lang::En);
        // Inconnue ou vide : on retombe sur la langue principale.
        assert_eq!(Lang::from_tag("de"), Lang::En);
        assert_eq!(Lang::from_tag(""), Lang::En);
    }

    #[test]
    fn deserializes_from_a_plain_string() {
        let lang: Lang = serde_json::from_str("\"fr\"").unwrap();
        assert_eq!(lang, Lang::Fr);
        let unknown: Lang = serde_json::from_str("\"xx\"").unwrap();
        assert_eq!(unknown, Lang::En);
    }
}
