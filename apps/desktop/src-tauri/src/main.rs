#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_contract;
mod backend_launcher;
mod startup_status;

use startup_status::DesktopStartupStatus;
use std::time::Duration;
use tauri::menu::MenuBuilder;
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, WindowEvent};

const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";

fn main() {
    // Startup contract:
    // 1. If http://127.0.0.1:7860/api/health is alive, reuse that backend.
    // 2. Otherwise start the configured backend command and capture logs.
    // 3. Keep studio.html visible as the standalone desktop Studio after health responds.
    // 4. If startup fails, keep the hub visible with the copied command and log path.
    tauri::Builder::default()
        .setup(|app| {
            setup_tray(app)?;
            let window = app
                .get_webview_window("main")
                .expect("main window should exist");
            let repo_root = std::env::current_dir()
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_else(|_| ".".to_string());
            let startup_contract =
                backend_contract::BackendLaunchContract::default_for_repo(&repo_root);
            send_startup_status(
                &window,
                &DesktopStartupStatus::checking(&startup_contract.app_url),
            );
            let startup_result =
                backend_launcher::DesktopBackendLauncher::new(startup_contract.clone())
                    .ensure_backend();
            if let Some(ref start_plan) = startup_result.start_plan {
                let _startup_command = &start_plan.command_line;
                let _startup_log_path = &start_plan.log_path;
                send_startup_status(&window, &DesktopStartupStatus::starting(&startup_result));

                let started_process =
                    match backend_launcher::start_backend_process(&startup_contract) {
                        Ok(process) => Some(process),
                        Err(error) => {
                            send_startup_status(
                                &window,
                                &DesktopStartupStatus::failed(&startup_result, None, &error),
                            );
                            eprintln!("{}", error);
                            return Ok(());
                        }
                    };

                if let Err(error) = backend_launcher::wait_for_backend_ready(
                    &startup_contract.host,
                    startup_contract.port,
                    Duration::from_secs(30),
                    Duration::from_millis(250),
                ) {
                    send_startup_status(
                        &window,
                        &DesktopStartupStatus::failed(
                            &startup_result,
                            started_process.as_ref(),
                            &error,
                        ),
                    );
                    eprintln!("{}", error);
                    return Ok(());
                }

                send_startup_status(
                    &window,
                    &DesktopStartupStatus::ready(&startup_result, started_process.as_ref()),
                );
            } else {
                send_startup_status(&window, &DesktopStartupStatus::reusing(&startup_result));
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Err(error) = window.hide() {
                    eprintln!("Failed to hide BranchWhisper window: {}", error);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running BranchWhisper desktop shell");
}

fn setup_tray(app: &App) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text(TRAY_SHOW_ID, "显示 BranchWhisper")
        .separator()
        .text(TRAY_QUIT_ID, "退出")
        .build()?;

    let mut tray = TrayIconBuilder::with_id("branchwhisper-main")
        .menu(&menu)
        .tooltip("BranchWhisper 正在后台运行")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == TRAY_SHOW_ID {
                show_main_window(app);
            } else if event.id().as_ref() == TRAY_QUIT_ID {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click { .. } | TrayIconEvent::DoubleClick { .. } => {
                show_main_window(tray.app_handle());
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.show() {
            eprintln!("Failed to show BranchWhisper window: {}", error);
        }
        if let Err(error) = window.unminimize() {
            eprintln!("Failed to unminimize BranchWhisper window: {}", error);
        }
        if let Err(error) = window.set_focus() {
            eprintln!("Failed to focus BranchWhisper window: {}", error);
        }
    }
}

fn send_startup_status(window: &tauri::WebviewWindow, status: &DesktopStartupStatus) {
    let script = format!(
        "window.__BRANCHWHISPER_STARTUP_STATUS__ = {}; window.dispatchEvent(new CustomEvent('branchwhisper:startup-status', {{ detail: window.__BRANCHWHISPER_STARTUP_STATUS__ }}));",
        status.to_json()
    );

    if let Err(error) = window.eval(&script) {
        eprintln!("Failed to update startup status: {}", error);
    }
}
