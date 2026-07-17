use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, Manager, State};
use tokio::process::Command;
use tokio::sync::oneshot;

use crate::engines::{Connection, DumpOptions, EngineId, SslMode};
use crate::runner::execute_dump;
use crate::{secrets, store};

/// Jobs en cours, pour pouvoir les annuler depuis l'UI.
#[derive(Default)]
pub struct Jobs(pub Mutex<HashMap<String, oneshot::Sender<()>>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryStatus {
    name: String,
    found: bool,
    /// true si DBDump peut fournir l'outil lui-même (téléchargement de pg_dump),
    /// même absent du système : l'UI n'a alors pas à bloquer le dump.
    provisionable: bool,
    path: Option<String>,
    version: Option<String>,
    install_hint: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    ok: bool,
    message: String,
    server_version: Option<String>,
    latency_ms: Option<u64>,
}

/// Le formulaire envoie le mot de passe en clair sur l'IPC (process local, pas
/// de réseau) ; il est rangé dans le trousseau dès l'enregistrement.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDraft {
    pub name: String,
    pub engine: EngineId,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub database: String,
    #[serde(default)]
    pub file_path: Option<String>,
    pub ssl_mode: SslMode,
    #[serde(default)]
    pub password: String,
}

/// Le canal ne sert plus qu'au flux de logs en direct. Le résultat final (taille,
/// chemin) est renvoyé par la valeur de retour de `run_dump` : le lire sur le
/// canal exposait à une course (la promesse `invoke` pouvait se résoudre avant
/// que l'événement final soit traité côté JS, d'où des « Terminé · 0 o »).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum DumpEvent {
    Log { line: String },
}

/// Résultat d'un dump réussi, renvoyé directement à l'UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DumpDone {
    size_bytes: u64,
    output_path: String,
}

fn read_version(path: &std::path::Path) -> Option<String> {
    std::process::Command::new(path)
        .arg("--version")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

#[tauri::command]
pub fn check_binary(app: tauri::AppHandle, engine: EngineId) -> BinaryStatus {
    let name = engine.dump_binary();

    // 1. Outil du système : prioritaire (l'utilisateur choisit sa version).
    if let Ok(path) = which::which(name) {
        return BinaryStatus {
            name: name.into(),
            found: true,
            provisionable: false,
            version: read_version(&path),
            path: Some(path.to_string_lossy().into_owned()),
            install_hint: None,
        };
    }

    // 2. Postgres uniquement : copie déjà téléchargée, ou téléchargeable.
    if matches!(engine, EngineId::Postgres) {
        if let Ok(base) = app.path().app_data_dir() {
            if let Some(path) = crate::provision::find_pg_dump(&crate::provision::cache_root(&base)) {
                return BinaryStatus {
                    name: name.into(),
                    found: true,
                    provisionable: false,
                    version: read_version(&path),
                    path: Some(path.to_string_lossy().into_owned()),
                    install_hint: None,
                };
            }
        }
        return BinaryStatus {
            name: name.into(),
            found: false,
            provisionable: true,
            path: None,
            version: None,
            install_hint: Some(engine.install_hint().into()),
        };
    }

    // 3. Autres moteurs : outil système requis.
    BinaryStatus {
        name: name.into(),
        found: false,
        provisionable: false,
        path: None,
        version: None,
        install_hint: Some(engine.install_hint().into()),
    }
}

#[tauri::command]
pub async fn test_connection(draft: ConnectionDraft) -> TestResult {
    let started = std::time::Instant::now();

    if matches!(draft.engine, EngineId::Sqlite) {
        let path = draft.file_path.clone().unwrap_or_default();
        return match std::fs::metadata(&path) {
            Ok(_) => TestResult {
                ok: true,
                message: "Fichier lisible".into(),
                server_version: None,
                latency_ms: Some(started.elapsed().as_millis() as u64),
            },
            Err(e) => TestResult {
                ok: false,
                message: format!("Fichier illisible : {e}"),
                server_version: None,
                latency_ms: None,
            },
        };
    }

    let probe = draft.engine.probe_binary();
    if which::which(probe).is_err() {
        return TestResult {
            ok: false,
            message: format!("{probe} introuvable. Installez-le avec : {}", draft.engine.install_hint()),
            server_version: None,
            latency_ms: None,
        };
    }

    let mut cmd = Command::new(probe);
    match draft.engine {
        EngineId::Postgres => {
            cmd.args([
                "--host", &draft.host,
                "--port", &draft.port.to_string(),
                "--username", &draft.username,
                "--dbname", &draft.database,
                "--no-password",
                "--tuples-only",
                "--command", "SELECT version()",
            ]);
            cmd.env("PGPASSWORD", &draft.password);
            if matches!(draft.ssl_mode, SslMode::Require) {
                cmd.env("PGSSLMODE", "require");
            }
        }
        EngineId::Mysql => {
            cmd.args([
                &format!("--host={}", draft.host),
                &format!("--port={}", draft.port),
                &format!("--user={}", draft.username),
                "--silent",
                "--skip-column-names",
                "--execute=SELECT VERSION()",
            ]);
            cmd.env("MYSQL_PWD", &draft.password);
        }
        EngineId::Mongodb => {
            cmd.args([
                &format!("mongodb://{}:{}/{}", draft.host, draft.port, draft.database),
                "--quiet",
                "--eval",
                "db.version()",
            ]);
        }
        EngineId::Sqlite => unreachable!("traité plus haut"),
    }

    let out = cmd.output().await;
    let latency = started.elapsed().as_millis() as u64;

    match out {
        Ok(o) if o.status.success() => TestResult {
            ok: true,
            message: "Connexion établie".into(),
            server_version: Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                .filter(|s| !s.is_empty()),
            latency_ms: Some(latency),
        },
        Ok(o) => TestResult {
            ok: false,
            // stderr du client est déjà explicite ("password authentication
            // failed", "could not connect to server") : le relayer tel quel aide
            // plus qu'un message maison.
            message: String::from_utf8_lossy(&o.stderr).trim().to_string(),
            server_version: None,
            latency_ms: None,
        },
        Err(e) => TestResult {
            ok: false,
            message: e.to_string(),
            server_version: None,
            latency_ms: None,
        },
    }
}

#[tauri::command]
pub async fn run_dump(
    app: tauri::AppHandle,
    conn: Connection,
    opts: DumpOptions,
    on_event: Channel<DumpEvent>,
    jobs: State<'_, Jobs>,
) -> Result<DumpDone, String> {
    let job_id = conn.id.clone();
    let password = secrets::get_password(&conn.id)?;
    // Cache des outils téléchargés (pg_dump portable), sous les données de l'app.
    let tools_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // L'annulation depuis l'UI se fait via ce oneshot, exposé par `cancel_dump`.
    let (cancel_tx, cancel_rx) = oneshot::channel();
    jobs.0.lock().unwrap().insert(job_id.clone(), cancel_tx);

    let result = execute_dump(
        &conn,
        &opts,
        password.as_deref(),
        &tools_dir,
        |line| {
            let _ = on_event.send(DumpEvent::Log { line });
        },
        async move {
            let _ = cancel_rx.await;
        },
    )
    .await;

    jobs.0.lock().unwrap().remove(&job_id);

    // Ok(outcome) → l'UI reçoit la taille réelle par la valeur de retour ;
    // Err(error) → `invoke` rejette avec la cause détaillée (stderr inclus).
    result.map(|outcome| DumpDone {
        size_bytes: outcome.size_bytes,
        output_path: outcome.output_path,
    })
}

/// Copie le fichier produit vers le dossier Téléchargements de l'OS. Utile quand
/// l'utilisateur a enregistré le dump ailleurs mais veut aussi le récupérer là où
/// il attend ses téléchargements. Renvoie le chemin de la copie.
#[tauri::command]
pub fn copy_to_downloads(app: tauri::AppHandle, path: String) -> Result<String, String> {
    use std::path::Path;

    let src = Path::new(&path);
    let meta = std::fs::metadata(src).map_err(|e| format!("fichier introuvable : {e}"))?;
    if meta.is_dir() {
        return Err("Ce format produit un dossier ; utilisez « Ouvrir le dossier ».".into());
    }
    let file_name = src.file_name().ok_or("chemin invalide")?;

    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&downloads).map_err(|e| e.to_string())?;

    // Ne pas écraser une copie déjà présente : suffixe « (n) » façon navigateur.
    let mut dest = downloads.join(file_name);
    if dest.exists() {
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("dump");
        let ext = src.extension().and_then(|s| s.to_str());
        for i in 1.. {
            let candidate = match ext {
                Some(e) => downloads.join(format!("{stem} ({i}).{e}")),
                None => downloads.join(format!("{stem} ({i})")),
            };
            if !candidate.exists() {
                dest = candidate;
                break;
            }
        }
    }

    std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn cancel_dump(job_id: String, jobs: State<'_, Jobs>) {
    if let Some(tx) = jobs.0.lock().unwrap().remove(&job_id) {
        let _ = tx.send(());
    }
}

#[tauri::command]
pub fn load_connections(app: tauri::AppHandle) -> Result<Vec<Connection>, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    store::load(&dir)
}

#[tauri::command]
pub fn save_connection(
    app: tauri::AppHandle,
    draft: ConnectionDraft,
    id: Option<String>,
) -> Result<Connection, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let mut all = store::load(&dir)?;

    let existing = id.as_ref().and_then(|i| all.iter().find(|c| &c.id == i).cloned());
    let conn = Connection {
        id: id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name: draft.name,
        engine: draft.engine,
        host: draft.host,
        port: draft.port,
        username: draft.username,
        database: draft.database,
        file_path: draft.file_path,
        ssl_mode: draft.ssl_mode,
        created_at: existing
            .map(|c| c.created_at)
            .unwrap_or_else(|| chrono_now()),
    };

    // Un mot de passe vide à l'édition veut dire « garder celui du trousseau ».
    if !draft.password.is_empty() {
        secrets::set_password(&conn.id, &draft.password)?;
    }

    match all.iter_mut().find(|c| c.id == conn.id) {
        Some(slot) => *slot = conn.clone(),
        None => all.push(conn.clone()),
    }
    store::save(&dir, &all)?;
    Ok(conn)
}

#[tauri::command]
pub fn delete_connection(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let all: Vec<Connection> = store::load(&dir)?.into_iter().filter(|c| c.id != id).collect();
    store::save(&dir, &all)?;
    // Sans ça le mot de passe resterait orphelin dans le trousseau.
    secrets::delete_password(&id)?;
    Ok(())
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}
