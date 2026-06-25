#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_contract;
mod backend_launcher;
mod desktop_shell;
mod startup_status;

use backend_launcher::StartedBackendProcess;
use desktop_shell::{
    CloseRequestAction, DesktopShellAction, TrayIconSignal, TrayMouseButton, TrayMouseButtonState,
};
use startup_status::DesktopStartupStatus;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::Duration;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, WindowEvent};

const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";
static IS_QUITTING: AtomicBool = AtomicBool::new(false);
static STARTED_BACKEND_PID: AtomicU32 = AtomicU32::new(0);

fn main() {
    // Startup contract:
    // 1. If http://127.0.0.1:7860/api/health is alive, reuse that backend.
    // 2. Otherwise start the configured backend command and capture logs.
    // 3. Keep studio.html visible as the standalone desktop Studio after health responds.
    // 4. If startup fails, keep the hub visible with the copied command and log path.
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .setup(|app| {
            setup_tray(app)?;
            let window = app
                .get_webview_window("main")
                .expect("main window should exist");
            let repo_root = std::env::current_dir()
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_else(|_| ".".to_string());
            let startup_contract = backend_contract_for_app(app, &repo_root);
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
                        Ok(process) => {
                            remember_started_backend(&process);
                            Some(process)
                        }
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
                match desktop_shell::close_request_action(IS_QUITTING.load(Ordering::SeqCst)) {
                    CloseRequestAction::AllowClose => {}
                    CloseRequestAction::HideToTray => {
                        api.prevent_close();
                        if let Err(error) = window.hide() {
                            eprintln!("Failed to hide BranchWhisper window: {}", error);
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running BranchWhisper desktop shell");
}

fn backend_contract_for_app(app: &App, repo_root: &str) -> backend_contract::BackendLaunchContract {
    let resource_dir = app
        .path()
        .resource_dir()
        .ok()
        .map(|path| path.to_string_lossy().into_owned());

    backend_contract::BackendLaunchContract::for_platform_and_repo(
        std::env::consts::OS,
        repo_root,
        |key| {
            if key == "BRANCHWHISPER_RESOURCE_DIR" {
                return resource_dir.clone();
            }
            std::env::var(key).ok()
        },
        |path| std::path::Path::new(path).exists(),
    )
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
        .on_menu_event(
            |app, event| match desktop_shell::menu_action_for_id(event.id().as_ref()) {
                DesktopShellAction::ShowMainWindow => show_main_window(app),
                DesktopShellAction::Quit => {
                    IS_QUITTING.store(true, Ordering::SeqCst);
                    shutdown_started_backend_process();
                    app.exit(0);
                }
                DesktopShellAction::None => {}
            },
        )
        .on_tray_icon_event(|tray, event| {
            let action = match event {
                TrayIconEvent::Click {
                    button,
                    button_state,
                    ..
                } => desktop_shell::tray_icon_action(TrayIconSignal::Click {
                    button: tray_mouse_button(button),
                    state: tray_mouse_button_state(button_state),
                }),
                TrayIconEvent::DoubleClick { button, .. } => {
                    desktop_shell::tray_icon_action(TrayIconSignal::DoubleClick {
                        button: tray_mouse_button(button),
                    })
                }
                _ => DesktopShellAction::None,
            };

            if action == DesktopShellAction::ShowMainWindow {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

fn tray_mouse_button(button: MouseButton) -> TrayMouseButton {
    match button {
        MouseButton::Left => TrayMouseButton::Left,
        MouseButton::Right => TrayMouseButton::Right,
        MouseButton::Middle => TrayMouseButton::Middle,
    }
}

fn tray_mouse_button_state(state: MouseButtonState) -> TrayMouseButtonState {
    match state {
        MouseButtonState::Down => TrayMouseButtonState::Down,
        MouseButtonState::Up => TrayMouseButtonState::Up,
    }
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

fn remember_started_backend(process: &StartedBackendProcess) {
    STARTED_BACKEND_PID.store(process.pid, Ordering::SeqCst);
}

fn shutdown_started_backend_process() {
    let pid = STARTED_BACKEND_PID.swap(0, Ordering::SeqCst);
    if pid == 0 {
        return;
    }

    if let Err(error) = stop_process_tree(pid) {
        eprintln!(
            "Failed to stop BranchWhisper backend PID {}: {}",
            pid, error
        );
    }
}

#[cfg(windows)]
fn stop_process_tree(pid: u32) -> Result<(), String> {
    let pid_text = pid.to_string();
    let output = Command::new("taskkill")
        .args(["/PID", &pid_text, "/F", "/T"])
        .output()
        .map_err(|error| format!("failed to run taskkill: {}", error))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("{}{}", stdout, stderr).trim().to_string())
    }
}

#[cfg(not(windows))]
fn stop_process_tree(pid: u32) -> Result<(), String> {
    let pid_text = pid.to_string();
    let output = Command::new("kill")
        .args(["-TERM", &pid_text])
        .output()
        .map_err(|error| format!("failed to run kill: {}", error))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("{}{}", stdout, stderr).trim().to_string())
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
