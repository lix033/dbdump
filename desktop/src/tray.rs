//! Présence en arrière-plan : icône dans la barre de menus (macOS) ou la zone de
//! notification (Windows/Linux).
//!
//! L'ordonnanceur ne tourne que tant que le processus vit. Sans ce détour, fermer
//! la fenêtre tuerait l'app et donc les sauvegardes programmées. La croix de la
//! fenêtre **masque** donc la fenêtre au lieu de quitter ; « Quitter » depuis le
//! menu de l'icône (ou ⌘Q sur macOS) reste le vrai bouton d'arrêt.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WindowEvent,
};

use crate::i18n::{msg, Lang};

/// Construit l'icône et son menu. La langue est celle du système au démarrage :
/// le menu est natif, il n'est pas reconstruit quand l'UI change de langue.
pub fn setup<R: Runtime>(app: &AppHandle<R>, lang: Lang) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", msg::tray_show(lang), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", msg::tray_quit(lang), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("icône d'application absente".into())
        })?)
        .icon_as_template(true) // macOS : l'icône suit le thème de la barre de menus.
        .tooltip(msg::tray_tooltip(lang))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => reveal(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Clic gauche : on revient à la fenêtre. Le clic droit ouvre le menu.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Rend la fenêtre principale visible et au premier plan.
pub fn reveal<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Branche la fermeture de fenêtre sur un simple masquage.
pub fn keep_alive_on_close<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
    });
}
