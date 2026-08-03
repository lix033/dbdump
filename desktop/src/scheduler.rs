//! Exécution des programmations.
//!
//! **Modèle retenu : ordonnanceur interne.** Une tâche tokio se réveille toutes
//! les 30 s tant que DBDump est ouvert. Au lancement, elle *rattrape* les
//! échéances passées pendant que l'app était fermée — une seule fois par
//! programmation, pas une par occurrence manquée : rattraper trois semaines de
//! dumps quotidiens saturerait le disque sans rendre service.
//!
//! Les dumps programmés sont sérialisés par un sémaphore à un jeton : deux
//! sauvegardes lancées à la même minute s'enchaînent au lieu de se disputer le
//! disque et la base. Les dumps lancés à la main depuis l'UI ne passent pas par
//! là et restent immédiats.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{DateTime, Local};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{oneshot, Semaphore};

use crate::commands::Jobs;
use crate::engines::Connection;
use crate::i18n::{msg, Lang};
use crate::runner::execute_dump;
use crate::schedule::{next_after, render_file_name, RunStatus, Schedule, ScheduleRun, Trigger};
use crate::{secrets, store};

/// Période de réveil. Assez court pour tenir la minute, assez long pour ne pas
/// réveiller le disque en permanence.
const TICK: Duration = Duration::from_secs(30);

/// Au-delà, l'historique est tronqué (les plus anciennes exécutions partent).
const MAX_RUNS: usize = 200;

/// Retard à partir duquel une exécution est signalée comme rattrapage plutôt que
/// comme déclenchement à l'heure.
const CAUGHT_UP_AFTER_MINUTES: i64 = 2;

/// Événement écouté par l'UI pour recharger programmations et historique.
pub const CHANGED_EVENT: &str = "dbdump://schedules-changed";

pub struct Scheduler {
    /// Langue de la dernière interaction avec l'UI. Une exécution de fond n'a
    /// personne à qui demander : elle reprend la dernière langue connue.
    lang: Mutex<Lang>,
    /// Un seul dump programmé à la fois.
    slot: Arc<Semaphore>,
    /// Programmations déjà en vol, pour qu'un tick ne relance pas ce qui tourne.
    running: Mutex<HashSet<String>>,
}

impl Default for Scheduler {
    fn default() -> Self {
        Self {
            lang: Mutex::new(Lang::En),
            slot: Arc::new(Semaphore::new(1)),
            running: Mutex::new(HashSet::new()),
        }
    }
}

impl Scheduler {
    pub fn remember_lang(&self, lang: Lang) {
        *self.lang.lock().unwrap() = lang;
    }

    fn lang(&self) -> Lang {
        *self.lang.lock().unwrap()
    }

    /// Réserve la programmation. `false` si elle tourne déjà.
    fn claim(&self, id: &str) -> bool {
        self.running.lock().unwrap().insert(id.to_string())
    }

    fn release(&self, id: &str) {
        self.running.lock().unwrap().remove(id);
    }
}

/// Démarre la boucle. Appelée une fois au `setup` de Tauri.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(err) = tick(&app).await {
                log::warn!("ordonnanceur : {err}");
            }
            tokio::time::sleep(TICK).await;
        }
    });
}

/// Un réveil : repère les échéances dues et les exécute.
async fn tick(app: &AppHandle) -> Result<(), String> {
    let dir = config_dir(app)?;
    let now = Local::now();
    let mut schedules: Vec<Schedule> = store::load(&dir, store::SCHEDULES)?;

    // Une programmation sans échéance calculée (nouvelle, ou importée) en reçoit
    // une avant tout déclenchement : sans ça elle ne partirait jamais.
    let mut dirty = false;
    for schedule in schedules.iter_mut() {
        if schedule.enabled && schedule.next_run_at.is_none() && !matches!(schedule.trigger, Trigger::Once { .. }) {
            schedule.next_run_at = next_after(&schedule.trigger, now).map(|d| d.to_rfc3339());
            dirty = true;
        }
    }
    if dirty {
        store::save(&dir, store::SCHEDULES, &schedules)?;
    }

    let due: Vec<Schedule> = schedules
        .into_iter()
        .filter(|s| s.enabled && is_due(s, now))
        .collect();

    for schedule in due {
        let late = due_at(&schedule)
            .map(|at| (now - at).num_minutes() >= CAUGHT_UP_AFTER_MINUTES)
            .unwrap_or(false);
        run(app.clone(), schedule, late).await;
    }
    Ok(())
}

fn is_due(schedule: &Schedule, now: DateTime<Local>) -> bool {
    due_at(schedule).map(|at| at <= now).unwrap_or(false)
}

fn due_at(schedule: &Schedule) -> Option<DateTime<Local>> {
    schedule
        .next_run_at
        .as_deref()
        .and_then(crate::schedule::parse_local_datetime)
}

/// Exécute une programmation maintenant, quoi qu'en dise son calendrier.
/// Utilisée par le bouton « Exécuter » de l'UI comme par le tick.
pub async fn run(app: AppHandle, schedule: Schedule, caught_up: bool) {
    let scheduler = app.state::<Scheduler>();
    if !scheduler.claim(&schedule.id) {
        return;
    }
    let outcome = execute(&app, &schedule, caught_up).await;
    if let Err(err) = outcome {
        log::warn!("programmation « {} » : {err}", schedule.name);
    }
    app.state::<Scheduler>().release(&schedule.id);
    let _ = app.emit(CHANGED_EVENT, ());
}

async fn execute(app: &AppHandle, schedule: &Schedule, caught_up: bool) -> Result<(), String> {
    let dir = config_dir(app)?;
    let lang = app.state::<Scheduler>().lang();
    let started = Local::now();

    let connections: Vec<Connection> = store::load(&dir, store::CONNECTIONS)?;
    let conn = connections.iter().find(|c| c.id == schedule.connection_id).cloned();

    // Trace « en cours » écrite avant le dump : si l'app est tuée pendant, l'UI
    // montre une exécution restée en cours plutôt que rien du tout.
    let run_id = uuid::Uuid::new_v4().to_string();
    let mut entry = ScheduleRun {
        id: run_id.clone(),
        schedule_id: schedule.id.clone(),
        schedule_name: schedule.name.clone(),
        connection_name: conn.as_ref().map(|c| c.name.clone()).unwrap_or_default(),
        started_at: started.to_rfc3339(),
        finished_at: None,
        status: RunStatus::Running,
        output_path: None,
        size_bytes: None,
        error: None,
        caught_up,
    };
    push_run(&dir, entry.clone())?;
    let _ = app.emit(CHANGED_EVENT, ());

    let result = match conn {
        Some(conn) => dump(app, schedule, &conn, lang, started, &run_id).await,
        None => Err(msg::schedule_connection_missing(lang).to_string()),
    };

    entry.finished_at = Some(Local::now().to_rfc3339());
    match result {
        Ok((path, size)) => {
            entry.status = RunStatus::Success;
            entry.output_path = Some(path);
            entry.size_bytes = Some(size);
        }
        Err(error) => {
            entry.status = if error == msg::dump_cancelled(lang) {
                RunStatus::Cancelled
            } else {
                RunStatus::Failed
            };
            entry.error = Some(error);
        }
    }
    let status = entry.status;
    update_run(&dir, entry)?;

    // Rotation : ne supprime que des fichiers dont l'historique garde la trace,
    // donc jamais un fichier que DBDump n'a pas écrit lui-même.
    if schedule.keep_last > 0 {
        prune(&dir, &schedule.id, schedule.keep_last as usize)?;
    }

    // Report du calendrier. On repart de « maintenant » et non de l'échéance
    // théorique : une seule exécution après une longue absence.
    let mut all: Vec<Schedule> = store::load(&dir, store::SCHEDULES)?;
    if let Some(slot) = all.iter_mut().find(|s| s.id == schedule.id) {
        slot.last_run_at = Some(started.to_rfc3339());
        slot.last_status = Some(status);
        let next = next_after(&slot.trigger, Local::now());
        slot.next_run_at = next.map(|d| d.to_rfc3339());
        // Une occurrence unique s'éteint d'elle-même une fois passée.
        if next.is_none() {
            slot.enabled = false;
        }
        store::save(&dir, store::SCHEDULES, &all)?;
    }
    Ok(())
}

/// Le dump lui-même. Renvoie (chemin, taille).
async fn dump(
    app: &AppHandle,
    schedule: &Schedule,
    conn: &Connection,
    lang: Lang,
    started: DateTime<Local>,
    run_id: &str,
) -> Result<(String, u64), String> {
    // Un seul dump programmé à la fois : le permis est relâché à la fin du bloc.
    let slot = app.state::<Scheduler>().slot.clone();
    let _permit = slot.acquire_owned().await.map_err(|e| e.to_string())?;

    let destination = Path::new(&schedule.options.destination_dir);
    if !destination.is_dir() {
        // Créer le dossier nous-mêmes écrirait sur le disque interne quand un
        // disque externe ou un partage réseau n'est pas monté : mieux vaut le dire.
        return Err(msg::schedule_destination_missing(
            lang,
            &schedule.options.destination_dir,
        ));
    }

    let mut options = schedule.options.clone();
    options.file_name = unique_name(
        destination,
        &render_file_name(&schedule.options.file_name, conn, started),
    );

    let password = secrets::get_password(&conn.id)?;
    let tools_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // L'annulation passe par le même registre que les dumps manuels : le bouton
    // « Annuler » de l'UI marche donc aussi sur une exécution programmée.
    let (cancel_tx, cancel_rx) = oneshot::channel();
    app.state::<Jobs>()
        .0
        .lock()
        .unwrap()
        .insert(run_id.to_string(), cancel_tx);

    let outcome = execute_dump(
        conn,
        &options,
        password.as_deref(),
        &tools_dir,
        lang,
        |_line| {},
        async move {
            let _ = cancel_rx.await;
        },
    )
    .await;

    app.state::<Jobs>().0.lock().unwrap().remove(run_id);
    let outcome = outcome?;

    // Diffusion vers les destinations de la programmation. Les lignes de journal
    // partent dans les traces de l'app : personne ne regarde l'écran à 2 h du
    // matin, mais l'échec doit rester lisible ensuite.
    let deliveries = crate::delivery::run(app, &options, &outcome.output_path, lang, |line| {
        log::info!("{line}");
    })
    .await;

    // Une destination qui refuse le transfert n'est pas un détail : la
    // programmation est en échec, même si le fichier local existe.
    if let Some(failed) = deliveries.iter().find(|d| !d.ok) {
        return Err(msg::delivery_failed(
            lang,
            &failed.destination_name,
            failed.error.as_deref().unwrap_or_default(),
        ));
    }

    Ok((outcome.output_path, outcome.size_bytes))
}

/// Évite d'écraser un dump précédent quand le modèle de nom n'a pas de jeton de
/// date : « base.dump » devient « base-1.dump », « base-2.dump »…
fn unique_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let path = Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("dump");
    let ext = path.extension().and_then(|s| s.to_str());
    for i in 1.. {
        let candidate = match ext {
            Some(e) => format!("{stem}-{i}.{e}"),
            None => format!("{stem}-{i}"),
        };
        if !dir.join(&candidate).exists() {
            return candidate;
        }
    }
    unreachable!("un suffixe finit toujours par être libre")
}

// --- Historique ---------------------------------------------------------------

pub fn load_runs(dir: &PathBuf) -> Result<Vec<ScheduleRun>, String> {
    store::load(dir, store::RUNS)
}

fn push_run(dir: &PathBuf, entry: ScheduleRun) -> Result<(), String> {
    let mut runs: Vec<ScheduleRun> = store::load(dir, store::RUNS)?;
    runs.insert(0, entry);
    runs.truncate(MAX_RUNS);
    store::save(dir, store::RUNS, &runs)
}

fn update_run(dir: &PathBuf, entry: ScheduleRun) -> Result<(), String> {
    let mut runs: Vec<ScheduleRun> = store::load(dir, store::RUNS)?;
    match runs.iter_mut().find(|r| r.id == entry.id) {
        Some(slot) => *slot = entry,
        None => runs.insert(0, entry),
    }
    store::save(dir, store::RUNS, &runs)
}

/// Ne garde que les `keep` dernières sauvegardes réussies d'une programmation et
/// supprime les fichiers des plus anciennes.
fn prune(dir: &PathBuf, schedule_id: &str, keep: usize) -> Result<(), String> {
    let mut runs: Vec<ScheduleRun> = store::load(dir, store::RUNS)?;
    let mut seen = 0usize;
    for entry in runs.iter_mut() {
        if entry.schedule_id != schedule_id || !matches!(entry.status, RunStatus::Success) {
            continue;
        }
        seen += 1;
        if seen <= keep {
            continue;
        }
        if let Some(path) = entry.output_path.take() {
            let p = Path::new(&path);
            let removed = if p.is_dir() {
                // Format « directory » de pg_dump : le dump est un dossier.
                std::fs::remove_dir_all(p)
            } else {
                std::fs::remove_file(p)
            };
            if let Err(e) = removed {
                log::warn!("rotation : {path} non supprimé ({e})");
            }
        }
    }
    store::save(dir, store::RUNS, &runs)
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}
