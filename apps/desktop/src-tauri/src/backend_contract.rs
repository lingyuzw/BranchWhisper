#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendCommand {
    pub program: String,
    pub args: Vec<String>,
}

impl BackendCommand {
    pub fn for_platform<F>(platform: &str, get_env: F) -> Self
    where
        F: Fn(&str) -> Option<String>,
    {
        Self::for_platform_with_paths(platform, get_env, |_| false)
    }

    pub fn for_platform_with_paths<F, P>(platform: &str, get_env: F, path_exists: P) -> Self
    where
        F: Fn(&str) -> Option<String>,
        P: Fn(&str) -> bool,
    {
        let host = "127.0.0.1".to_string();
        let port = "7860".to_string();
        if let Some(program) = get_env("BRANCHWHISPER_BACKEND_EXECUTABLE") {
            return Self {
                program,
                args: vec!["--host".to_string(), host, "--port".to_string(), port],
            };
        }

        if let Some(program) = default_packaged_backend_path(platform, &get_env) {
            if path_exists(&program) {
                return Self {
                    program,
                    args: vec!["--host".to_string(), host, "--port".to_string(), port],
                };
            }
        }

        let env = get_env("BRANCHWHISPER_BACKEND_ENV").unwrap_or_else(|| "qwen3-asr".to_string());
        let program = get_env("BRANCHWHISPER_BACKEND_CONDA")
            .unwrap_or_else(|| default_conda_for_platform(platform).to_string());

        Self {
            program,
            args: vec![
                "run".to_string(),
                "-n".to_string(),
                env,
                "python".to_string(),
                "backend/main.py".to_string(),
                "--host".to_string(),
                host,
                "--port".to_string(),
                port,
            ],
        }
    }

    pub fn uses_repo_cwd(&self) -> bool {
        self.args.iter().any(|arg| arg == "backend/main.py")
    }

    pub fn command_line(&self) -> String {
        let mut parts = vec![quote_shell_arg(&self.program)];
        parts.extend(self.args.iter().map(|arg| quote_shell_arg(arg)));
        parts.join(" ")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendLaunchContract {
    pub host: String,
    pub port: u16,
    pub cwd: String,
    pub health_url: String,
    pub app_url: String,
    pub log_path: String,
    pub command: BackendCommand,
}

impl BackendLaunchContract {
    pub fn default_for_repo(repo_root: &str) -> Self {
        Self::for_platform_and_repo(
            std::env::consts::OS,
            repo_root,
            |key| std::env::var(key).ok(),
            |path| std::path::Path::new(path).exists(),
        )
    }

    pub fn for_platform_and_repo<F, P>(
        platform: &str,
        repo_root: &str,
        get_env: F,
        path_exists: P,
    ) -> Self
    where
        F: Fn(&str) -> Option<String>,
        P: Fn(&str) -> bool,
    {
        let host = "127.0.0.1".to_string();
        let port = 7860;
        let runtime_root = desktop_runtime_root(platform, repo_root, &get_env);
        let command = BackendCommand::for_platform_with_paths(platform, &get_env, path_exists);
        let cwd = if command.uses_repo_cwd() {
            repo_root.to_string()
        } else {
            runtime_root.clone()
        };

        Self {
            host: host.clone(),
            port,
            cwd,
            health_url: format!("http://{}:{}/api/health", host, port),
            app_url: format!("http://{}:{}/app/", host, port),
            log_path: join_path(platform, &runtime_root, &["backend.log"]),
            command,
        }
    }
}

fn default_conda_for_platform(platform: &str) -> &'static str {
    match platform {
        "windows" => "conda",
        _ => "/home/me/miniconda3/bin/conda",
    }
}

fn desktop_runtime_root<F>(platform: &str, repo_root: &str, get_env: &F) -> String
where
    F: Fn(&str) -> Option<String>,
{
    if let Some(root) = get_env("BRANCHWHISPER_DESKTOP_RUNTIME_ROOT") {
        return root;
    }

    if platform == "windows" {
        if let Some(local_app_data) = get_env("LOCALAPPDATA") {
            return join_path(platform, &local_app_data, &["BranchWhisper", "desktop-runtime"]);
        }
    }

    join_path(platform, repo_root, &["runtime", "desktop"])
}

fn default_packaged_backend_path<F>(platform: &str, get_env: &F) -> Option<String>
where
    F: Fn(&str) -> Option<String>,
{
    if platform != "windows" {
        return None;
    }

    let local_app_data = get_env("LOCALAPPDATA")?;
    Some(join_path(
        platform,
        &local_app_data,
        &[
            "BranchWhisper",
            "backend-build",
            "dist",
            "branchwhisper-backend",
            "branchwhisper-backend.exe",
        ],
    ))
}

fn join_path(platform: &str, root: &str, parts: &[&str]) -> String {
    let separator = if platform == "windows" { "\\" } else { "/" };
    let mut path = root.trim_end_matches(['/', '\\']).to_string();

    for part in parts {
        if !path.is_empty() {
            path.push_str(separator);
        }
        path.push_str(part.trim_matches(['/', '\\']));
    }

    path
}

fn quote_shell_arg(value: &str) -> String {
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '.' | '_' | '-' | ':' | '='))
    {
        return value.to_string();
    }

    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_contract_uses_qwen3_asr_backend_command() {
        let contract = BackendLaunchContract::default_for_repo("/home/me/workspace/BranchWhisper");

        assert_eq!(contract.host, "127.0.0.1");
        assert_eq!(contract.port, 7860);
        assert_eq!(contract.health_url, "http://127.0.0.1:7860/api/health");
        assert_eq!(contract.app_url, "http://127.0.0.1:7860/app/");
        assert_eq!(contract.cwd, "/home/me/workspace/BranchWhisper");
        assert_eq!(
            contract.log_path,
            "/home/me/workspace/BranchWhisper/runtime/desktop/backend.log"
        );
        assert_eq!(contract.command.program, "/home/me/miniconda3/bin/conda");
        assert_eq!(
            contract.command.args,
            vec![
                "run",
                "-n",
                "qwen3-asr",
                "python",
                "backend/main.py",
                "--host",
                "127.0.0.1",
                "--port",
                "7860"
            ]
        );
    }

    #[test]
    fn backend_command_defaults_to_plain_conda_on_windows() {
        let command = BackendCommand::for_platform("windows", empty_env);

        assert_eq!(command.program, "conda");
        assert_eq!(
            command.args,
            vec![
                "run",
                "-n",
                "qwen3-asr",
                "python",
                "backend/main.py",
                "--host",
                "127.0.0.1",
                "--port",
                "7860"
            ]
        );
    }

    #[test]
    fn backend_command_supports_environment_overrides() {
        let command = BackendCommand::for_platform("windows", |key| match key {
            "BRANCHWHISPER_BACKEND_CONDA" => {
                Some("C:\\Tools\\miniconda3\\Scripts\\conda.exe".to_string())
            }
            "BRANCHWHISPER_BACKEND_ENV" => Some("branchwhisper-api".to_string()),
            _ => None,
        });

        assert_eq!(command.program, "C:\\Tools\\miniconda3\\Scripts\\conda.exe");
        assert_eq!(command.args[2], "branchwhisper-api");
    }

    #[test]
    fn backend_command_uses_packaged_executable_before_conda() {
        let command = BackendCommand::for_platform("windows", |key| match key {
            "BRANCHWHISPER_BACKEND_EXECUTABLE" => Some(
                "C:\\Program Files\\BranchWhisper\\backend\\branchwhisper-backend.exe".to_string(),
            ),
            _ => None,
        });

        assert_eq!(
            command.program,
            "C:\\Program Files\\BranchWhisper\\backend\\branchwhisper-backend.exe"
        );
        assert_eq!(command.args, vec!["--host", "127.0.0.1", "--port", "7860"]);
    }

    #[test]
    fn backend_command_finds_default_packaged_backend_on_windows() {
        let expected =
            "C:\\Users\\Me\\AppData\\Local\\BranchWhisper\\backend-build\\dist\\branchwhisper-backend\\branchwhisper-backend.exe";
        let command = BackendCommand::for_platform_with_paths(
            "windows",
            |key| match key {
                "LOCALAPPDATA" => Some("C:\\Users\\Me\\AppData\\Local".to_string()),
                _ => None,
            },
            |path| path == expected,
        );

        assert_eq!(command.program, expected);
        assert_eq!(command.args, vec!["--host", "127.0.0.1", "--port", "7860"]);
    }

    #[test]
    fn windows_contract_uses_local_appdata_runtime_for_packaged_backend() {
        let expected_backend =
            "C:\\Users\\Me\\AppData\\Local\\BranchWhisper\\backend-build\\dist\\branchwhisper-backend\\branchwhisper-backend.exe";

        let contract = BackendLaunchContract::for_platform_and_repo(
            "windows",
            "C:\\Users\\Me\\Desktop",
            |key| match key {
                "LOCALAPPDATA" => Some("C:\\Users\\Me\\AppData\\Local".to_string()),
                _ => None,
            },
            |path| path == expected_backend,
        );

        assert_eq!(
            contract.cwd,
            "C:\\Users\\Me\\AppData\\Local\\BranchWhisper\\desktop-runtime"
        );
        assert_eq!(
            contract.log_path,
            "C:\\Users\\Me\\AppData\\Local\\BranchWhisper\\desktop-runtime\\backend.log"
        );
        assert_eq!(contract.command.program, expected_backend);
    }

    #[test]
    fn runtime_root_override_is_used_for_logs_and_packaged_backend_cwd() {
        let contract = BackendLaunchContract::for_platform_and_repo(
            "windows",
            "C:\\Users\\Me\\Desktop",
            |key| match key {
                "BRANCHWHISPER_DESKTOP_RUNTIME_ROOT" => Some("D:\\BranchWhisperRuntime".to_string()),
                "BRANCHWHISPER_BACKEND_EXECUTABLE" => Some("D:\\BranchWhisper\\backend.exe".to_string()),
                _ => None,
            },
            |_| false,
        );

        assert_eq!(contract.cwd, "D:\\BranchWhisperRuntime");
        assert_eq!(contract.log_path, "D:\\BranchWhisperRuntime\\backend.log");
        assert_eq!(contract.command.program, "D:\\BranchWhisper\\backend.exe");
    }

    #[test]
    fn command_line_quotes_paths_with_spaces() {
        let command = BackendCommand {
            program: "/path with spaces/conda".into(),
            args: vec!["run".into(), "-n".into(), "qwen3-asr".into()],
        };

        assert_eq!(
            command.command_line(),
            "'/path with spaces/conda' run -n qwen3-asr"
        );
    }

    fn empty_env(_key: &str) -> Option<String> {
        None
    }
}
