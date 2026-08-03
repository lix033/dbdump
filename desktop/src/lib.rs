mod commands;
mod delivery;
mod destinations;
mod engines;
mod gzip;
mod i18n;
mod monitor;
mod path_env;
mod provision;
mod runner;
mod schedule;
mod scheduler;
mod secrets;
mod store;
mod tray;

use commands::Jobs;
use scheduler::Scheduler;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Lancée depuis le Finder/Dock, l'app n'hérite pas du PATH du shell : sans
    // ça, psql/mysql/mongosh installés par Homebrew seraient « introuvables ».
    // À faire avant tout spawn de process enfant.
    path_env::harmonize();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Lancement au démarrage de session. `--hidden` : l'app se met en place
        // sans ouvrir sa fenêtre, elle n'existe que par son icône de barre de menus.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .manage(Jobs::default())
        .manage(Scheduler::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Icône de barre de menus + fermeture qui masque au lieu de quitter :
            // c'est ce qui laisse les programmations tourner sans fenêtre ouverte.
            let lang = i18n::Lang::from_tag(&system_language());
            tray::setup(app.handle(), lang)?;
            tray::keep_alive_on_close(app.handle());

            // Lancée au démarrage de session (`--hidden`), l'app ne montre rien :
            // elle attend ses échéances dans la barre de menus.
            if std::env::args().any(|arg| arg == "--hidden") {
                if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                    let _ = window.hide();
                }
            }

            // Les dumps programmés tournent tant que le processus vit. Le premier
            // tour rattrape les échéances passées pendant que l'app était fermée.
            scheduler::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_binary,
            commands::test_connection,
            commands::run_dump,
            commands::cancel_dump,
            commands::copy_to_downloads,
            commands::load_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::load_schedules,
            commands::save_schedule,
            commands::delete_schedule,
            commands::set_schedule_enabled,
            commands::run_schedule_now,
            commands::load_schedule_runs,
            commands::autostart_enabled,
            commands::set_autostart,
            commands::load_destinations,
            commands::save_destination,
            commands::delete_destination,
            commands::test_destination,
            commands::destination_space,
            commands::system_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Langue du système, pour les seuls textes construits avant que l'UI n'ait pu
/// dire la sienne (le menu natif de l'icône). Lue dans les variables d'env POSIX,
/// avec repli sur l'anglais — `Lang::from_tag` est tolérant.
fn system_language() -> String {
    std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LC_MESSAGES"))
        .or_else(|_| std::env::var("LANG"))
        .unwrap_or_default()
}
