mod commands;
mod engines;
mod gzip;
mod path_env;
mod provision;
mod runner;
mod secrets;
mod store;

use commands::Jobs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Lancée depuis le Finder/Dock, l'app n'hérite pas du PATH du shell : sans
    // ça, psql/mysql/mongosh installés par Homebrew seraient « introuvables ».
    // À faire avant tout spawn de process enfant.
    path_env::harmonize();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Jobs::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
