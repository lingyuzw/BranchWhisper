mod backend_contract;
mod backend_launcher;

use std::time::Duration;
use tauri::{Manager, Url};

fn main() {
    // Startup contract:
    // 1. If http://127.0.0.1:7860/api/health is alive, reuse that backend.
    // 2. Otherwise start the configured backend command and capture logs.
    // 3. Navigate to http://127.0.0.1:7860/app/ only after health responds.
    // 4. If startup fails, keep startup.html visible with the copied command and log path.
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main window should exist");
            let repo_root = std::env::current_dir()
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_else(|_| ".".to_string());
            let startup_contract =
                backend_contract::BackendLaunchContract::default_for_repo(&repo_root);
            let startup_result =
                backend_launcher::DesktopBackendLauncher::new(startup_contract.clone())
                    .ensure_backend();
            if let Some(start_plan) = startup_result.start_plan {
                let _startup_command = start_plan.command_line;
                let _startup_log_path = start_plan.log_path;
                if let Err(error) = backend_launcher::start_backend_process(&startup_contract) {
                    eprintln!("{}", error);
                    return Ok(());
                }

                if let Err(error) = backend_launcher::wait_for_backend_ready(
                    &startup_contract.host,
                    startup_contract.port,
                    Duration::from_secs(30),
                    Duration::from_millis(250),
                ) {
                    eprintln!("{}", error);
                    return Ok(());
                }
            }

            if let Ok(url) = Url::parse(&startup_result.app_url) {
                if let Err(error) = window.navigate(url) {
                    eprintln!("Failed to navigate to app: {}", error);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BranchWhisper desktop shell");
}
