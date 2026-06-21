mod backend_contract;

fn main() {
    // Startup contract:
    // 1. If http://127.0.0.1:7860/api/health is alive, reuse that backend.
    // 2. Otherwise start the configured backend command and capture logs.
    // 3. Navigate to http://127.0.0.1:7860/app/ only after health responds.
    // 4. If startup fails, keep startup.html visible with the copied command and log path.
    tauri::Builder::default()
        .setup(|app| {
            let _ = app.handle();
            let repo_root = std::env::current_dir()
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_else(|_| ".".to_string());
            let startup_contract =
                backend_contract::BackendLaunchContract::default_for_repo(&repo_root);
            let _startup_command = startup_contract.command.command_line();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BranchWhisper desktop shell");
}
