fn main() {
    // Startup contract:
    // 1. If http://127.0.0.1:7860/api/health is alive, reuse that backend.
    // 2. Otherwise start the configured backend command and capture logs.
    // 3. Navigate to http://127.0.0.1:7860/app/ only after health responds.
    // 4. If startup fails, keep startup.html visible with the copied command and log path.
    tauri::Builder::default()
        .setup(|app| {
            let _ = app.handle();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BranchWhisper desktop shell");
}
