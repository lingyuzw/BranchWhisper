#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendCommand {
    pub program: String,
    pub args: Vec<String>,
}

impl BackendCommand {
    pub fn default() -> Self {
        Self::for_platform(std::env::consts::OS, |key| std::env::var(key).ok())
    }

    pub fn for_platform<F>(platform: &str, get_env: F) -> Self
    where
        F: Fn(&str) -> Option<String>,
    {
        let host = "127.0.0.1".to_string();
        let port = "7860".to_string();
        if let Some(program) = get_env("BRANCHWHISPER_BACKEND_EXECUTABLE") {
            return Self {
                program,
                args: vec!["--host".to_string(), host, "--port".to_string(), port],
            };
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
        let host = "127.0.0.1".to_string();
        let port = 7860;

        Self {
            host: host.clone(),
            port,
            cwd: repo_root.to_string(),
            health_url: format!("http://{}:{}/api/health", host, port),
            app_url: format!("http://{}:{}/app/", host, port),
            log_path: format!("{}/runtime/desktop/backend.log", repo_root),
            command: BackendCommand::default(),
        }
    }
}

fn default_conda_for_platform(platform: &str) -> &'static str {
    match platform {
        "windows" => "conda",
        _ => "/home/me/miniconda3/bin/conda",
    }
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
