#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod windows_paste;

use tauri::{
    ClipboardManager, CustomMenuItem, GlobalShortcutManager, Manager, SystemTray, SystemTrayEvent,
    SystemTrayMenu,
};
use std::thread::sleep;
use std::time::Duration;

#[cfg(windows)]
use windows_paste::windows as paste_engine;
#[cfg(not(windows))]
use windows_paste::fallback as paste_engine;

/// Tauri Command: Save current foreground window HWND before popup opens
#[tauri::command]
fn save_foreground_hwnd() -> isize {
    paste_engine::save_current_foreground_window()
}

/// Tauri Command: Get the last saved HWND
#[tauri::command]
fn get_saved_hwnd() -> isize {
    paste_engine::get_saved_hwnd()
}

/// Tauri Command: Set Always on Top dynamically
#[tauri::command]
fn set_always_on_top(window: tauri::Window, always_on_top: bool) -> Result<(), String> {
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

/// Tauri Command: Full Pipeline Requested by User:
/// click item > set clipboard > hide clipboard > restore HWND > sendinput(ctrl+V)
#[tauri::command]
async fn paste_and_restore(
    app_handle: tauri::AppHandle,
    window: tauri::Window,
    text: String,
) -> Result<bool, String> {
    // 1. Set clipboard content
    let mut clipboard = app_handle.clipboard_manager();
    clipboard.write_text(text).map_err(|e| e.to_string())?;

    // 2. Hide the clipboard popup window
    window.hide().map_err(|e| e.to_string())?;

    // 3. Small sleep to allow OS window manager to transfer focus back
    sleep(Duration::from_millis(40));

    // 4. Restore HWND and send Ctrl+V via SendInput
    let success = paste_engine::restore_focus_and_paste();

    Ok(success)
}

/// Tauri Command: Hide popup window
#[tauri::command]
fn hide_popup(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

/// Tauri Command: Show popup window
#[tauri::command]
fn show_popup(window: tauri::Window) -> Result<(), String> {
    paste_engine::save_current_foreground_window();
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// Tauri Command: Check native status
#[tauri::command]
fn get_native_status() -> serde_json::Value {
    serde_json::json!({
        "is_native": true,
        "os": std::env::consts::OS,
        "has_saved_hwnd": paste_engine::get_saved_hwnd() != 0,
        "saved_hwnd": paste_engine::get_saved_hwnd(),
    })
}

fn main() {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("toggle", "Open Clipboard (Ctrl+Shift+V)"))
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                match id.as_str() {
                    "toggle" => {
                        let window = app.get_window("main").unwrap();
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            paste_engine::save_current_foreground_window();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
        })
        .setup(|app| {
            let app_handle = app.handle();
            let mut shortcuts = app.global_shortcut_manager();

            // Native Windows Acrylic backdrop on transparent window
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_window("main") {
                    let _ = window_vibrancy::apply_acrylic(&window, Some((20, 20, 26, 125)));
                }
            }
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_window("main") {
                    let _ = window_vibrancy::apply_vibrancy(
                        &window,
                        window_vibrancy::NSVisualEffectMaterial::HudWindow,
                        None,
                        None,
                    );
                }
            }

            // Register global hotkey: Ctrl+Shift+V
            let app_handle_clone = app_handle.clone();
            let _ = shortcuts.register("Ctrl+Shift+V", move || {
                // 1. Immediately save current foreground HWND before showing clipboard popup!
                paste_engine::save_current_foreground_window();

                if let Some(window) = app_handle_clone.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.set_always_on_top(true);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_foreground_hwnd,
            get_saved_hwnd,
            set_always_on_top,
            paste_and_restore,
            hide_popup,
            show_popup,
            get_native_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
