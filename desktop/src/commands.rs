use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, Manager, State};
use tokio::process::Command;
use tokio::sync::oneshot;

use crate::destinations::{DeliveryResult, Destination, DestinationKind};
use crate::engines::{Connection, DumpOptions, EngineId, SslMode};
use crate::i18n::{msg, Lang};
use crate::runner::execute_dump;
use crate::schedule::{Schedule, ScheduleRun, Trigger};
use crate::scheduler::Scheduler;
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
    /// Avancement mesuré sur le fichier de sortie : débit d'écriture et,
    /// quand une référence existe, taille attendue.
    Progress(crate::monitor::DumpProgress),
}

/// Résultat d'un dump réussi, renvoyé directement à l'UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DumpDone {
    size_bytes: u64,
    output_path: String,
    /// Verdict de chaque destination. Vide quand le dump reste sur le disque.
    deliveries: Vec<DeliveryResult>,
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
pub fn check_binary(app: tauri::AppHandle, engine: EngineId, lang: Lang) -> BinaryStatus {
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
            install_hint: Some(engine.install_hint(lang).into()),
        };
    }

    // 3. Autres moteurs : outil système requis.
    BinaryStatus {
        name: name.into(),
        found: false,
        provisionable: false,
        path: None,
        version: None,
        install_hint: Some(engine.install_hint(lang).into()),
    }
}

#[tauri::command]
pub async fn test_connection(draft: ConnectionDraft, lang: Lang) -> TestResult {
    let started = std::time::Instant::now();

    if matches!(draft.engine, EngineId::Sqlite) {
        let path = draft.file_path.clone().unwrap_or_default();
        return match std::fs::metadata(&path) {
            Ok(_) => TestResult {
                ok: true,
                message: msg::file_readable(lang).into(),
                server_version: None,
                latency_ms: Some(started.elapsed().as_millis() as u64),
            },
            Err(e) => TestResult {
                ok: false,
                message: msg::file_unreadable(lang, &e.to_string()),
                server_version: None,
                latency_ms: None,
            },
        };
    }

    let probe = draft.engine.probe_binary();
    if which::which(probe).is_err() {
        return TestResult {
            ok: false,
            message: msg::probe_missing(lang, probe, draft.engine.install_hint(lang)),
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
        EngineId::Sqlite => unreachable!("handled above"),
    }

    let out = cmd.output().await;
    let latency = started.elapsed().as_millis() as u64;

    match out {
        Ok(o) if o.status.success() => TestResult {
            ok: true,
            message: msg::connection_established(lang).into(),
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
    lang: Lang,
    jobs: State<'_, Jobs>,
) -> Result<DumpDone, String> {
    let job_id = conn.id.clone();
    let password = secrets::get_password(&conn.id)?;
    // Cache des outils téléchargés (pg_dump portable), sous les données de l'app.
    let tools_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // L'annulation depuis l'UI se fait via ce oneshot, exposé par `cancel_dump`.
    let (cancel_tx, cancel_rx) = oneshot::channel();
    jobs.0.lock().unwrap().insert(job_id.clone(), cancel_tx);

    // Surveillance de l'écriture : une tâche regarde le fichier grossir pendant
    // que l'outil travaille, et pousse débit et taille attendue à l'UI. Elle
    // s'arrête d'elle-même quand le canal se ferme, à la fin du dump.
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let watcher_channel = on_event.clone();
    let watched_path = crate::runner::output_path(&opts);
    let expected = crate::monitor::expected_size(&config_dir, &conn.id);
    let watcher = tauri::async_runtime::spawn(async move {
        let mut watcher = crate::monitor::ProgressWatcher::new(watched_path, expected);
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(700)).await;
            if let Some(progress) = watcher.tick() {
                if watcher_channel.send(DumpEvent::Progress(progress)).is_err() {
                    return;
                }
            }
        }
    });

    let result = execute_dump(
        &conn,
        &opts,
        password.as_deref(),
        &tools_dir,
        lang,
        |line| {
            let _ = on_event.send(DumpEvent::Log { line });
        },
        async move {
            let _ = cancel_rx.await;
        },
    )
    .await;

    jobs.0.lock().unwrap().remove(&job_id);
    watcher.abort();

    // Err(error) → `invoke` rejette avec la cause détaillée (stderr inclus).
    let outcome = result?;

    // Référence pour le temps restant du prochain dump de cette connexion.
    crate::monitor::remember_size(&config_dir, &conn.id, outcome.size_bytes);

    // Diffusion vers les destinations : après le dump, jamais à sa place. Un
    // envoi qui échoue laisse le fichier local et se voit dans le journal.
    let deliveries = crate::delivery::run(&app, &opts, &outcome.output_path, lang, |line| {
        let _ = on_event.send(DumpEvent::Log { line });
    })
    .await;

    Ok(DumpDone {
        size_bytes: outcome.size_bytes,
        output_path: outcome.output_path,
        deliveries,
    })
}

// ── Destinations ─────────────────────────────────────────────────────────────

/// Ce que le formulaire envoie. Le secret (mot de passe, phrase de passe, clé
/// secrète S3) transite ici puis part au coffre : il n'est jamais renvoyé à l'UI.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DestinationDraft {
    pub name: String,
    #[serde(flatten)]
    pub kind: DestinationKind,
    #[serde(default)]
    pub secret: String,
}

#[tauri::command]
pub fn load_destinations(app: tauri::AppHandle) -> Result<Vec<Destination>, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    store::load(&dir, store::DESTINATIONS)
}

#[tauri::command]
pub fn save_destination(
    app: tauri::AppHandle,
    draft: DestinationDraft,
    id: Option<String>,
) -> Result<Destination, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let mut all: Vec<Destination> = store::load(&dir, store::DESTINATIONS)?;
    let existing = id.as_ref().and_then(|i| all.iter().find(|d| &d.id == i).cloned());

    let destination = Destination {
        id: id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name: draft.name,
        kind: draft.kind,
        created_at: existing
            .map(|d| d.created_at)
            .unwrap_or_else(|| chrono::Local::now().to_rfc3339()),
    };

    // Un secret vide à l'édition veut dire « garder celui du coffre ».
    if !draft.secret.is_empty() {
        secrets::set_destination_secret(&destination.id, &draft.secret)?;
    }

    match all.iter_mut().find(|d| d.id == destination.id) {
        Some(slot) => *slot = destination.clone(),
        None => all.push(destination.clone()),
    }
    store::save(&dir, store::DESTINATIONS, &all)?;
    Ok(destination)
}

#[tauri::command]
pub fn delete_destination(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let all: Vec<Destination> = store::load::<Vec<Destination>>(&dir, store::DESTINATIONS)?
        .into_iter()
        .filter(|d| d.id != id)
        .collect();
    store::save(&dir, store::DESTINATIONS, &all)?;
    secrets::delete_destination_secret(&id)?;

    // Une programmation qui visait cette destination ne doit pas continuer à
    // croire qu'elle y envoie quelque chose.
    let mut schedules: Vec<Schedule> = store::load(&dir, store::SCHEDULES)?;
    let mut touched = false;
    for schedule in schedules.iter_mut() {
        let before = schedule.options.destination_ids.len();
        schedule.options.destination_ids.retain(|d| d != &id);
        touched |= schedule.options.destination_ids.len() != before;
    }
    if touched {
        store::save(&dir, store::SCHEDULES, &schedules)?;
    }
    Ok(())
}

/// Vérifie qu'une destination répond **et** qu'on peut y écrire : lister ne
/// prouve rien, beaucoup de comptes ont l'un sans l'autre.
///
/// Le brouillon est testé tel quel (sans enregistrement), avec le secret déjà
/// au coffre quand le champ est laissé vide à l'édition.
#[tauri::command]
pub async fn test_destination(
    draft: DestinationDraft,
    id: Option<String>,
    lang: Lang,
) -> TestResult {
    let started = std::time::Instant::now();
    let probe_id = id.unwrap_or_else(|| format!("probe-{}", uuid::Uuid::new_v4()));

    // Le test doit pouvoir tourner avant tout enregistrement : le secret saisi
    // est donc déposé au coffre sous l'identifiant visé, comme le ferait
    // l'enregistrement. Pour un brouillon neuf, l'entrée est retirée juste après.
    let temporary = draft.secret.is_empty();
    if !temporary {
        if let Err(error) = secrets::set_destination_secret(&probe_id, &draft.secret) {
            return TestResult {
                ok: false,
                message: error,
                server_version: None,
                latency_ms: None,
            };
        }
    }

    let destination = Destination {
        id: probe_id.clone(),
        name: draft.name,
        kind: draft.kind,
        created_at: String::new(),
    };
    let outcome = crate::destinations::test(&destination, lang).await;

    if probe_id.starts_with("probe-") {
        let _ = secrets::delete_destination_secret(&probe_id);
    }

    match outcome {
        Ok(message) => TestResult {
            ok: true,
            message,
            server_version: None,
            latency_ms: Some(started.elapsed().as_millis() as u64),
        },
        Err(message) => TestResult {
            ok: false,
            message,
            server_version: None,
            latency_ms: None,
        },
    }
}

/// Copie le fichier produit vers le dossier Téléchargements de l'OS. Utile quand
/// l'utilisateur a enregistré le dump ailleurs mais veut aussi le récupérer là où
/// il attend ses téléchargements. Renvoie le chemin de la copie.
#[tauri::command]
pub fn copy_to_downloads(
    app: tauri::AppHandle,
    path: String,
    lang: Lang,
) -> Result<String, String> {
    use std::path::Path;

    let src = Path::new(&path);
    let meta = std::fs::metadata(src).map_err(|e| msg::source_missing(lang, &e.to_string()))?;
    if meta.is_dir() {
        return Err(msg::is_a_directory(lang).into());
    }
    let file_name = src.file_name().ok_or_else(|| msg::invalid_path(lang))?;

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
    store::load(&dir, store::CONNECTIONS)
}

#[tauri::command]
pub fn save_connection(
    app: tauri::AppHandle,
    draft: ConnectionDraft,
    id: Option<String>,
) -> Result<Connection, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let mut all: Vec<Connection> = store::load(&dir, store::CONNECTIONS)?;

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
    store::save(&dir, store::CONNECTIONS, &all)?;
    Ok(conn)
}

#[tauri::command]
pub fn delete_connection(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let all: Vec<Connection> = store::load::<Vec<Connection>>(&dir, store::CONNECTIONS)?
        .into_iter()
        .filter(|c| c.id != id)
        .collect();
    store::save(&dir, store::CONNECTIONS, &all)?;
    // Sans ça le mot de passe resterait orphelin dans le trousseau.
    secrets::delete_password(&id)?;

    // Une programmation qui vise une connexion supprimée n'a plus de sens : on la
    // désactive plutôt que de la laisser échouer toutes les nuits.
    let mut schedules: Vec<crate::schedule::Schedule> = store::load(&dir, store::SCHEDULES)?;
    let mut touched = false;
    for schedule in schedules.iter_mut().filter(|s| s.connection_id == id) {
        schedule.enabled = false;
        schedule.next_run_at = None;
        touched = true;
    }
    if touched {
        store::save(&dir, store::SCHEDULES, &schedules)?;
    }
    Ok(())
}

// ── Programmations ───────────────────────────────────────────────────────────

/// Ce que le formulaire envoie : tout sauf ce que le backend calcule lui-même
/// (identifiant, dates d'exécution, statut).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleDraft {
    pub name: String,
    pub connection_id: String,
    pub options: DumpOptions,
    pub trigger: Trigger,
    pub enabled: bool,
    #[serde(default)]
    pub keep_last: u32,
}

/// Chaque commande de programmation transporte la langue de l'UI : c'est la
/// seule occasion qu'a l'ordonnanceur de la connaître, ses exécutions de fond
/// n'ayant personne à qui la demander.
#[tauri::command]
pub fn load_schedules(
    app: tauri::AppHandle,
    lang: Lang,
    scheduler: State<'_, Scheduler>,
) -> Result<Vec<Schedule>, String> {
    scheduler.remember_lang(lang);
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    store::load(&dir, store::SCHEDULES)
}

#[tauri::command]
pub fn save_schedule(
    app: tauri::AppHandle,
    draft: ScheduleDraft,
    id: Option<String>,
    lang: Lang,
    scheduler: State<'_, Scheduler>,
) -> Result<Schedule, String> {
    scheduler.remember_lang(lang);
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let mut all: Vec<Schedule> = store::load(&dir, store::SCHEDULES)?;
    let existing = id.as_ref().and_then(|i| all.iter().find(|s| &s.id == i).cloned());
    let now = chrono::Local::now();

    let schedule = Schedule {
        id: id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name: draft.name,
        connection_id: draft.connection_id,
        options: draft.options,
        // Recalculé à chaque enregistrement : changer l'heure doit décaler la
        // prochaine exécution tout de suite, pas au prochain déclenchement.
        next_run_at: draft
            .enabled
            .then(|| crate::schedule::next_after(&draft.trigger, now))
            .flatten()
            .map(|d| d.to_rfc3339()),
        trigger: draft.trigger,
        enabled: draft.enabled,
        created_at: existing
            .as_ref()
            .map(|s| s.created_at.clone())
            .unwrap_or_else(|| now.to_rfc3339()),
        last_run_at: existing.as_ref().and_then(|s| s.last_run_at.clone()),
        last_status: existing.as_ref().and_then(|s| s.last_status),
        keep_last: draft.keep_last,
    };

    match all.iter_mut().find(|s| s.id == schedule.id) {
        Some(slot) => *slot = schedule.clone(),
        None => all.push(schedule.clone()),
    }
    store::save(&dir, store::SCHEDULES, &all)?;
    Ok(schedule)
}

#[tauri::command]
pub fn delete_schedule(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let all: Vec<Schedule> = store::load::<Vec<Schedule>>(&dir, store::SCHEDULES)?
        .into_iter()
        .filter(|s| s.id != id)
        .collect();
    store::save(&dir, store::SCHEDULES, &all)?;
    // L'historique reste : il documente des fichiers qui, eux, existent toujours.
    Ok(())
}

/// Active ou suspend une programmation. Réactiver recalcule l'échéance depuis
/// maintenant : une programmation reprise ne part pas en rattrapage immédiat.
#[tauri::command]
pub fn set_schedule_enabled(
    app: tauri::AppHandle,
    id: String,
    enabled: bool,
) -> Result<Schedule, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let mut all: Vec<Schedule> = store::load(&dir, store::SCHEDULES)?;
    let slot = all
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| "schedule not found".to_string())?;

    slot.enabled = enabled;
    slot.next_run_at = enabled
        .then(|| crate::schedule::next_after(&slot.trigger, chrono::Local::now()))
        .flatten()
        .map(|d| d.to_rfc3339());
    let updated = slot.clone();
    store::save(&dir, store::SCHEDULES, &all)?;
    Ok(updated)
}

/// Exécute une programmation sur-le-champ, sans toucher à son calendrier au-delà
/// du report normal. Rend la main immédiatement : l'UI suit via l'événement de
/// changement, comme pour une exécution déclenchée par l'horloge.
#[tauri::command]
pub fn run_schedule_now(
    app: tauri::AppHandle,
    id: String,
    lang: Lang,
    scheduler: State<'_, Scheduler>,
) -> Result<(), String> {
    scheduler.remember_lang(lang);
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let all: Vec<Schedule> = store::load(&dir, store::SCHEDULES)?;
    let schedule = all
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| "schedule not found".to_string())?;

    tauri::async_runtime::spawn(async move {
        crate::scheduler::run(app, schedule, false).await;
    });
    Ok(())
}

/// Photographie de la machine : CPU, mémoire, volumes, et ce que consomment les
/// dumps en cours. L'UI l'appelle à intervalle régulier tant que l'écran de
/// surveillance est ouvert.
#[tauri::command]
pub async fn system_stats() -> crate::monitor::SystemStats {
    // `snapshot` dort brièvement (mesure du CPU) : hors du fil de l'UI.
    tokio::task::spawn_blocking(crate::monitor::snapshot)
        .await
        .unwrap_or_else(|_| crate::monitor::snapshot())
}

/// Espace libre d'une destination, quand la question a un sens (dossier, SFTP).
/// `None` pour FTP et S3. Sert au tableau de bord de surveillance.
#[tauri::command]
pub async fn destination_space(
    app: tauri::AppHandle,
    id: String,
) -> Result<Option<crate::destinations::FreeSpace>, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let all: Vec<Destination> = store::load(&dir, store::DESTINATIONS)?;
    let Some(destination) = all.into_iter().find(|d| d.id == id) else {
        return Ok(None);
    };
    Ok(crate::destinations::free_space(&destination).await)
}

/// « Lancer DBDump au démarrage ». Sans ça, une programmation nocturne ne part
/// que si quelqu'un a pensé à ouvrir l'app avant d'aller se coucher.
#[tauri::command]
pub fn autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn load_schedule_runs(app: tauri::AppHandle) -> Result<Vec<ScheduleRun>, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    crate::scheduler::load_runs(&dir)
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}
