//! Programmations de dumps : modèle de données et calcul de la prochaine
//! occurrence.
//!
//! Ce module est volontairement **pur** — pas de Tauri, pas d'I/O, pas d'horloge
//! implicite : `next_after` reçoit l'instant de référence. C'est ce qui permet de
//! tester le calendrier (passage à l'heure d'été, mois courts, semaines à cheval
//! sur un dimanche) sans attendre une vraie échéance. L'exécution vit dans
//! `scheduler.rs`.

use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, NaiveTime, TimeZone};
use serde::{Deserialize, Serialize};

use crate::engines::{Connection, DumpOptions};

/// Quand une programmation se déclenche.
///
/// `weekdays` suit la convention ISO (1 = lundi … 7 = dimanche), celle que
/// renvoie `Date.getDay()` côté UI après conversion, et celle de `chrono`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Trigger {
    /// Toutes les N minutes, à partir de la dernière exécution.
    Interval { every_minutes: u32 },
    /// Tous les jours à `time` ("HH:MM", heure locale).
    Daily { time: String },
    /// Les jours de semaine cochés, à `time`.
    Weekly { time: String, weekdays: Vec<u8> },
    /// Le N du mois à `time`. Un 31 dans un mois de 30 jours retombe sur le
    /// dernier jour : sauter le mois surprendrait plus qu'il n'aiderait.
    Monthly { time: String, day_of_month: u8 },
    /// Une seule fois, à cette date et heure locales (RFC 3339 ou "YYYY-MM-DDTHH:MM").
    Once { at: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Running,
    Success,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub id: String,
    pub name: String,
    pub connection_id: String,
    pub options: DumpOptions,
    pub trigger: Trigger,
    pub enabled: bool,
    pub created_at: String,
    /// Prochaine échéance calculée, en RFC 3339. `None` = plus rien à faire
    /// (déclencheur `once` déjà passé).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_status: Option<RunStatus>,
    /// Nombre de fichiers à conserver pour cette programmation. 0 = tout garder.
    /// La rotation ne supprime que les fichiers dont DBDump a gardé la trace
    /// dans l'historique : jamais un fichier qu'il n'a pas écrit lui-même.
    #[serde(default)]
    pub keep_last: u32,
}

/// Une exécution, gardée pour l'historique affiché dans l'UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRun {
    pub id: String,
    pub schedule_id: String,
    pub schedule_name: String,
    pub connection_name: String,
    pub started_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
    pub status: RunStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Vrai quand l'exécution rattrape une échéance manquée (app fermée).
    #[serde(default)]
    pub caught_up: bool,
}

/// Prochaine occurrence strictement postérieure à `after`.
///
/// `None` quand la programmation n'a plus d'avenir : un `Once` déjà passé, ou un
/// déclencheur mal formé (heure illisible, aucun jour coché). Un `None` gèle la
/// programmation plutôt que de la faire tourner en boucle.
pub fn next_after(trigger: &Trigger, after: DateTime<Local>) -> Option<DateTime<Local>> {
    match trigger {
        Trigger::Interval { every_minutes } => {
            // Une période nulle enchaînerait les dumps sans fin.
            let minutes = (*every_minutes).max(1) as i64;
            Some(after + Duration::minutes(minutes))
        }

        Trigger::Daily { time } => {
            let t = parse_time(time)?;
            // 366 tentatives : même en butant sur des heures inexistantes (passage
            // à l'heure d'été), on trouve forcément un jour valide.
            first_match(after, 366, |date| Some((date, t)))
        }

        Trigger::Weekly { time, weekdays } => {
            let t = parse_time(time)?;
            if weekdays.is_empty() {
                return None;
            }
            first_match(after, 366, |date| {
                let iso = date.weekday().number_from_monday() as u8;
                weekdays.contains(&iso).then_some((date, t))
            })
        }

        Trigger::Monthly { time, day_of_month } => {
            let t = parse_time(time)?;
            let wanted = (*day_of_month).clamp(1, 31) as u32;
            first_match(after, 366, |date| {
                let day = wanted.min(days_in_month(date.year(), date.month()));
                (date.day() == day).then_some((date, t))
            })
        }

        Trigger::Once { at } => {
            let when = parse_local_datetime(at)?;
            (when > after).then_some(when)
        }
    }
}

/// Balaie les jours à partir de celui de `after` et renvoie le premier instant
/// strictement postérieur produit par `pick`.
fn first_match(
    after: DateTime<Local>,
    max_days: i64,
    pick: impl Fn(NaiveDate) -> Option<(NaiveDate, NaiveTime)>,
) -> Option<DateTime<Local>> {
    let start = after.date_naive();
    for offset in 0..max_days {
        let date = start.checked_add_signed(Duration::days(offset))?;
        let Some((date, time)) = pick(date) else {
            continue;
        };
        if let Some(candidate) = to_local(date.and_time(time)) {
            if candidate > after {
                return Some(candidate);
            }
        }
    }
    None
}

/// Heure locale → instant absolu. Deux cas tordus, deux fois par an :
/// l'heure peut être ambiguë (retour à l'heure d'hiver : on prend la première
/// occurrence) ou inexistante (passage à l'heure d'été : le créneau 2h-3h est
/// sauté, on décale d'une heure pour ne pas perdre l'exécution du jour).
fn to_local(naive: chrono::NaiveDateTime) -> Option<DateTime<Local>> {
    if let Some(dt) = Local.from_local_datetime(&naive).earliest() {
        return Some(dt);
    }
    Local
        .from_local_datetime(&(naive + Duration::hours(1)))
        .earliest()
}

fn parse_time(hhmm: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(hhmm.trim(), "%H:%M")
        .or_else(|_| NaiveTime::parse_from_str(hhmm.trim(), "%H:%M:%S"))
        .ok()
}

/// Accepte un RFC 3339 complet (ce que l'app écrit) comme un "YYYY-MM-DDTHH:MM"
/// sans fuseau (ce que produit un `<input type="datetime-local">`).
pub fn parse_local_datetime(value: &str) -> Option<DateTime<Local>> {
    let v = value.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(v) {
        return Some(dt.with_timezone(&Local));
    }
    for format in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M"] {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(v, format) {
            return to_local(naive);
        }
    }
    None
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let first_next = NaiveDate::from_ymd_opt(next_year, next_month, 1).expect("mois valide");
    first_next.pred_opt().expect("jour précédent").day()
}

/// Remplit un modèle de nom de fichier. Sans jeton, le nom est repris tel quel —
/// mais deux exécutions écriraient alors dans le même fichier, ce que
/// `scheduler` corrige en suffixant.
///
/// Jetons : `{db}`, `{name}`, `{engine}`, `{date}`, `{time}`, `{datetime}`.
pub fn render_file_name(template: &str, conn: &Connection, now: DateTime<Local>) -> String {
    let engine = match conn.engine {
        crate::engines::EngineId::Postgres => "postgres",
        crate::engines::EngineId::Mysql => "mysql",
        crate::engines::EngineId::Sqlite => "sqlite",
        crate::engines::EngineId::Mongodb => "mongodb",
    };
    // Pas de « : » dans l'heure : Windows le refuse dans un nom de fichier.
    let rendered = template
        .replace("{db}", &sanitize(&conn.database))
        .replace("{name}", &sanitize(&conn.name))
        .replace("{engine}", engine)
        .replace("{date}", &now.format("%Y-%m-%d").to_string())
        .replace("{time}", &now.format("%H-%M-%S").to_string())
        .replace("{datetime}", &now.format("%Y-%m-%d_%H-%M-%S").to_string());

    let cleaned = sanitize(&rendered);
    if cleaned.is_empty() {
        format!("dump-{}", now.format("%Y-%m-%d_%H-%M-%S"))
    } else {
        cleaned
    }
}

/// Neutralise ce qui ferait sortir du dossier de destination ou fâcherait un
/// système de fichiers.
fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engines::{EngineId, SslMode};

    fn at(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Local> {
        to_local(
            NaiveDate::from_ymd_opt(y, m, d)
                .unwrap()
                .and_hms_opt(h, min, 0)
                .unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn interval_adds_the_period() {
        let next = next_after(&Trigger::Interval { every_minutes: 90 }, at(2026, 8, 3, 10, 0));
        assert_eq!(next, Some(at(2026, 8, 3, 11, 30)));
    }

    #[test]
    fn interval_never_loops_on_zero() {
        let start = at(2026, 8, 3, 10, 0);
        let next = next_after(&Trigger::Interval { every_minutes: 0 }, start).unwrap();
        assert!(next > start, "une période nulle doit quand même avancer");
    }

    #[test]
    fn daily_takes_today_then_tomorrow() {
        let trigger = Trigger::Daily { time: "23:30".into() };
        // Avant l'heure : c'est pour ce soir.
        assert_eq!(
            next_after(&trigger, at(2026, 8, 3, 9, 0)),
            Some(at(2026, 8, 3, 23, 30))
        );
        // Après l'heure : c'est pour demain.
        assert_eq!(
            next_after(&trigger, at(2026, 8, 3, 23, 31)),
            Some(at(2026, 8, 4, 23, 30))
        );
        // Pile à l'heure : on ne rejoue pas la même occurrence.
        assert_eq!(
            next_after(&trigger, at(2026, 8, 3, 23, 30)),
            Some(at(2026, 8, 4, 23, 30))
        );
    }

    #[test]
    fn weekly_finds_the_next_checked_day() {
        // 2026-08-03 est un lundi. Programmé mardi (2) et vendredi (5).
        let trigger = Trigger::Weekly {
            time: "02:00".into(),
            weekdays: vec![2, 5],
        };
        assert_eq!(
            next_after(&trigger, at(2026, 8, 3, 12, 0)),
            Some(at(2026, 8, 4, 2, 0))
        );
        assert_eq!(
            next_after(&trigger, at(2026, 8, 4, 12, 0)),
            Some(at(2026, 8, 7, 2, 0))
        );
        // Depuis le vendredi soir, on repart au mardi suivant.
        assert_eq!(
            next_after(&trigger, at(2026, 8, 7, 12, 0)),
            Some(at(2026, 8, 11, 2, 0))
        );
    }

    #[test]
    fn weekly_without_any_day_is_frozen() {
        let trigger = Trigger::Weekly {
            time: "02:00".into(),
            weekdays: vec![],
        };
        assert_eq!(next_after(&trigger, at(2026, 8, 3, 12, 0)), None);
    }

    #[test]
    fn monthly_clamps_to_the_last_day_of_short_months() {
        let trigger = Trigger::Monthly {
            time: "04:00".into(),
            day_of_month: 31,
        };
        // Février 2027 n'a que 28 jours : l'exécution tombe le 28.
        assert_eq!(
            next_after(&trigger, at(2027, 2, 1, 0, 0)),
            Some(at(2027, 2, 28, 4, 0))
        );
        // Avril a 30 jours.
        assert_eq!(
            next_after(&trigger, at(2027, 4, 1, 0, 0)),
            Some(at(2027, 4, 30, 4, 0))
        );
        // Mars les a tous : le 31 est respecté.
        assert_eq!(
            next_after(&trigger, at(2027, 3, 1, 0, 0)),
            Some(at(2027, 3, 31, 4, 0))
        );
    }

    #[test]
    fn once_runs_only_in_the_future() {
        let trigger = Trigger::Once {
            at: "2026-12-24T20:00".into(),
        };
        assert_eq!(
            next_after(&trigger, at(2026, 8, 3, 12, 0)),
            Some(at(2026, 12, 24, 20, 0))
        );
        assert_eq!(next_after(&trigger, at(2027, 1, 1, 12, 0)), None);
    }

    #[test]
    fn unparseable_time_freezes_instead_of_looping() {
        let trigger = Trigger::Daily { time: "25h".into() };
        assert_eq!(next_after(&trigger, at(2026, 8, 3, 12, 0)), None);
    }

    fn conn() -> Connection {
        Connection {
            id: "c1".into(),
            name: "Prod / clients".into(),
            engine: EngineId::Postgres,
            host: "localhost".into(),
            port: 5432,
            username: "u".into(),
            database: "app_prod".into(),
            file_path: None,
            ssl_mode: SslMode::Prefer,
            created_at: "0".into(),
        }
    }

    #[test]
    fn file_name_template_fills_every_token() {
        let name = render_file_name(
            "{db}-{engine}-{date}_{time}.dump",
            &conn(),
            at(2026, 8, 3, 14, 5),
        );
        assert_eq!(name, "app_prod-postgres-2026-08-03_14-05-00.dump");
    }

    #[test]
    fn file_name_never_escapes_the_destination() {
        // Un nom de connexion contenant des séparateurs ne doit pas écrire ailleurs.
        let name = render_file_name("{name}.dump", &conn(), at(2026, 8, 3, 14, 5));
        assert_eq!(name, "Prod - clients.dump");

        // Le modèle lui-même ne doit pas permettre de remonter d'un dossier :
        // le nom rendu doit rester un seul segment de chemin.
        for template in ["../../{db}.dump", "{db}/../../etc/passwd", "..\\{db}.dump"] {
            let rendered = render_file_name(template, &conn(), at(2026, 8, 3, 14, 5));
            let parts = std::path::Path::new(&rendered).components().count();
            assert_eq!(parts, 1, "« {rendered} » n'est pas un simple nom de fichier");
        }
    }
}
