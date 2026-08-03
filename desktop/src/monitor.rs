//! Surveillance : ce que coûte une sauvegarde, et ce qu'il reste de place pour
//! la recevoir.
//!
//! Trois questions, trois réponses :
//!
//! - **Est-ce que ça tient ?** L'espace libre de chaque volume et de chaque
//!   destination — un dump de 40 Go sur un disque qui en a 3 échoue au bout
//!   d'une heure, autant le voir avant.
//! - **Qu'est-ce que ça consomme ?** CPU et mémoire de la machine, et ceux des
//!   process de dump eux-mêmes (`pg_dump` & co.), suivis par leur PID.
//! - **C'est fini quand ?** Le débit d'écriture, mesuré sur le fichier de sortie
//!   pendant qu'il grossit, et le temps restant déduit de la taille du dernier
//!   dump réussi de la même connexion.
//!
//! Rien n'est envoyé nulle part : tout est lu sur la machine locale.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sysinfo::{Disks, Pid, ProcessRefreshKind, ProcessesToUpdate, System};

/// Process de dump en cours, par PID. Un dump manuel et un dump programmé
/// peuvent tourner en même temps : d'où un ensemble et pas une valeur unique.
static TRACKED: Mutex<Option<HashSet<u32>>> = Mutex::new(None);

/// Vue instantanée de la machine.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    /// Charge CPU globale, en pourcentage (0-100), toutes cœurs confondus.
    pub cpu_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    /// Part de CPU et de mémoire prise par les outils de dump en cours.
    pub dump_cpu_percent: f32,
    pub dump_memory_bytes: u64,
    pub active_dumps: usize,
    pub volumes: Vec<Volume>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub name: String,
    pub mount_point: String,
    pub free_bytes: u64,
    pub total_bytes: u64,
}

/// Avancement d'un dump, poussé à l'UI pendant l'écriture.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DumpProgress {
    /// Octets déjà écrits par l'outil.
    pub bytes: u64,
    /// Débit instantané, lissé sur les dernières secondes.
    pub bytes_per_second: f64,
    /// Taille du dernier dump réussi de cette connexion, quand elle est connue :
    /// c'est la seule référence honnête pour estimer ce qu'il reste.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_bytes: Option<u64>,
}

/// Tailles des derniers dumps réussis, par connexion. Sert de référence au
/// temps restant estimé.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SizeHistory(pub HashMap<String, u64>);

pub fn remember_size(dir: &PathBuf, connection_id: &str, bytes: u64) {
    let mut history: SizeHistory = crate::store::load(dir, crate::store::SIZES).unwrap_or_default();
    history.0.insert(connection_id.to_string(), bytes);
    let _ = crate::store::save(dir, crate::store::SIZES, &history);
}

pub fn expected_size(dir: &PathBuf, connection_id: &str) -> Option<u64> {
    let history: SizeHistory = crate::store::load(dir, crate::store::SIZES).ok()?;
    history.0.get(connection_id).copied()
}

/// Suit un process de dump le temps qu'il vive. Le `Drop` garantit qu'un dump
/// annulé ou en erreur ne laisse pas un PID fantôme dans les statistiques.
pub struct TrackedProcess(Option<u32>);

impl TrackedProcess {
    pub fn new(pid: Option<u32>) -> Self {
        if let Some(pid) = pid {
            TRACKED.lock().unwrap().get_or_insert_with(HashSet::new).insert(pid);
        }
        Self(pid)
    }
}

impl Drop for TrackedProcess {
    fn drop(&mut self) {
        if let Some(pid) = self.0.take() {
            if let Some(set) = TRACKED.lock().unwrap().as_mut() {
                set.remove(&pid);
            }
        }
    }
}

fn tracked() -> Vec<u32> {
    TRACKED
        .lock()
        .unwrap()
        .as_ref()
        .map(|set| set.iter().copied().collect())
        .unwrap_or_default()
}

/// Photographie de la machine. Appelée à intervalle régulier par l'UI.
///
/// `System` est reconstruit à chaque appel : le pourcentage CPU d'un `System`
/// neuf est calculé sur l'intervalle entre ses deux rafraîchissements, d'où la
/// courte pause — sans elle, la valeur serait toujours 0.
pub fn snapshot() -> SystemStats {
    let mut system = System::new();
    system.refresh_memory();
    system.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_cpu_usage();

    let pids = tracked();
    let mut dump_cpu = 0.0;
    let mut dump_memory = 0;
    if !pids.is_empty() {
        let wanted: Vec<Pid> = pids.iter().map(|p| Pid::from_u32(*p)).collect();
        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&wanted),
            true,
            ProcessRefreshKind::nothing().with_cpu().with_memory(),
        );
        for pid in wanted {
            if let Some(process) = system.process(pid) {
                dump_cpu += process.cpu_usage();
                dump_memory += process.memory();
            }
        }
    }

    SystemStats {
        cpu_percent: system.global_cpu_usage(),
        memory_used_bytes: system.used_memory(),
        memory_total_bytes: system.total_memory(),
        dump_cpu_percent: dump_cpu,
        dump_memory_bytes: dump_memory,
        active_dumps: pids.len(),
        volumes: volumes(),
    }
}

/// Volumes montés, dédoublonnés : macOS expose plusieurs fois le même disque
/// (systèmes de fichiers en lecture seule, snapshots), ce qui n'apprend rien.
fn volumes() -> Vec<Volume> {
    let disks = Disks::new_with_refreshed_list();
    let mut seen = HashSet::new();
    let mut out: Vec<Volume> = disks
        .iter()
        .filter(|disk| disk.total_space() > 0)
        .filter(|disk| seen.insert(disk.mount_point().to_path_buf()))
        .map(|disk| Volume {
            name: disk.name().to_string_lossy().into_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            free_bytes: disk.available_space(),
            total_bytes: disk.total_space(),
        })
        .collect();
    out.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    out
}

/// Suit la taille du fichier (ou dossier) produit et rend un avancement à chaque
/// appel. Le débit est lissé sur le dernier intervalle : une valeur instantanée
/// sauterait trop pour être lisible.
pub struct ProgressWatcher {
    path: PathBuf,
    expected_bytes: Option<u64>,
    last_at: Instant,
    last_bytes: u64,
    rate: f64,
}

impl ProgressWatcher {
    pub fn new(path: impl Into<PathBuf>, expected_bytes: Option<u64>) -> Self {
        Self {
            path: path.into(),
            expected_bytes,
            last_at: Instant::now(),
            last_bytes: 0,
            rate: 0.0,
        }
    }

    /// Relève la taille courante. `None` tant que le fichier n'existe pas encore
    /// (l'outil ne l'a pas créé) : mieux vaut ne rien annoncer que 0 octet.
    pub fn tick(&mut self) -> Option<DumpProgress> {
        let bytes = size_of(&self.path)?;
        let elapsed = self.last_at.elapsed();
        if elapsed < Duration::from_millis(200) {
            return None;
        }

        let delta = bytes.saturating_sub(self.last_bytes) as f64;
        let instant = delta / elapsed.as_secs_f64();
        // Moyenne mobile : 30 % de la mesure fraîche suffit à suivre une vraie
        // variation sans faire danser l'affichage.
        self.rate = if self.rate == 0.0 {
            instant
        } else {
            self.rate * 0.7 + instant * 0.3
        };
        self.last_at = Instant::now();
        self.last_bytes = bytes;

        Some(DumpProgress {
            bytes,
            bytes_per_second: self.rate,
            expected_bytes: self.expected_bytes,
        })
    }
}

/// Taille d'un fichier, ou somme d'un dossier (dump au format « répertoire »).
fn size_of(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_dir() {
        return Some(meta.len());
    }
    let mut total = 0;
    let entries = std::fs::read_dir(path).ok()?;
    for entry in entries.flatten() {
        total += match entry.path().is_dir() {
            true => size_of(&entry.path()).unwrap_or(0),
            false => entry.metadata().map(|m| m.len()).unwrap_or(0),
        };
    }
    Some(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_reports_a_plausible_machine() {
        let stats = snapshot();
        assert!(stats.memory_total_bytes > 0, "mémoire totale nulle");
        assert!(stats.memory_used_bytes <= stats.memory_total_bytes);
        assert!((0.0..=100.0).contains(&stats.cpu_percent), "CPU hors bornes");
        assert!(!stats.volumes.is_empty(), "aucun volume détecté");
    }

    #[test]
    fn a_watcher_reports_nothing_until_the_file_exists() {
        let mut watcher = ProgressWatcher::new(std::env::temp_dir().join("dbdump-absent"), None);
        assert!(watcher.tick().is_none());
    }

    #[test]
    fn a_watcher_measures_growth() {
        let path = std::env::temp_dir().join("dbdump-progress-test");
        std::fs::write(&path, vec![0u8; 1024]).unwrap();
        let mut watcher = ProgressWatcher::new(&path, Some(4096));

        std::thread::sleep(Duration::from_millis(250));
        let first = watcher.tick().expect("le fichier existe");
        assert_eq!(first.bytes, 1024);
        assert_eq!(first.expected_bytes, Some(4096));

        std::fs::write(&path, vec![0u8; 4096]).unwrap();
        std::thread::sleep(Duration::from_millis(250));
        let second = watcher.tick().expect("le fichier a grossi");
        assert_eq!(second.bytes, 4096);
        assert!(second.bytes_per_second > 0.0, "débit nul malgré la croissance");

        std::fs::remove_file(&path).ok();
    }
}
