use crate::backend_contract::BackendLaunchContract;
use std::fs::{create_dir_all, OpenOptions};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

const HEALTH_PROBE_TIMEOUT: Duration = Duration::from_millis(350);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendLaunchAction {
    Reuse,
    Start,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendStartPlan {
    pub cwd: String,
    pub command_line: String,
    pub log_path: String,
    pub repair_hints: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendLaunchResult {
    pub action: BackendLaunchAction,
    pub app_url: String,
    pub start_plan: Option<BackendStartPlan>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartedBackendProcess {
    pub pid: u32,
    pub log_path: String,
}

pub struct DesktopBackendLauncher {
    contract: BackendLaunchContract,
}

impl DesktopBackendLauncher {
    pub fn new(contract: BackendLaunchContract) -> Self {
        Self { contract }
    }

    pub fn ensure_backend(&self) -> BackendLaunchResult {
        if is_tcp_port_reachable(&self.contract.host, self.contract.port) {
            return BackendLaunchResult {
                action: BackendLaunchAction::Reuse,
                app_url: self.contract.app_url.clone(),
                start_plan: None,
            };
        }

        BackendLaunchResult {
            action: BackendLaunchAction::Start,
            app_url: self.contract.app_url.clone(),
            start_plan: Some(BackendStartPlan {
                cwd: self.contract.cwd.clone(),
                command_line: self.contract.command.command_line(),
                log_path: self.contract.log_path.clone(),
                repair_hints: vec![
                    "Confirm the qwen3-asr conda environment exists.".to_string(),
                    "Run the command manually from the repository root and inspect the log."
                        .to_string(),
                    "If the port is occupied, close the old backend or configure another port."
                        .to_string(),
                ],
            }),
        }
    }
}

pub fn is_tcp_port_reachable(host: &str, port: u16) -> bool {
    match (host, port).to_socket_addrs() {
        Ok(mut addresses) => addresses.any(|address| {
            TcpStream::connect_timeout(&address, HEALTH_PROBE_TIMEOUT).is_ok()
        }),
        Err(_) => false,
    }
}

pub fn start_backend_process(
    contract: &BackendLaunchContract,
) -> Result<StartedBackendProcess, String> {
    if let Some(parent) = Path::new(&contract.log_path).parent() {
        create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create backend log directory {}: {}",
                parent.display(),
                error
            )
        })?;
    }

    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&contract.log_path)
        .map_err(|error| format!("Failed to open backend log {}: {}", contract.log_path, error))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("Failed to clone backend log handle: {}", error))?;

    let child = Command::new(&contract.command.program)
        .args(&contract.command.args)
        .current_dir(&contract.cwd)
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to start backend command {}: {}",
                contract.command.command_line(),
                error
            )
        })?;

    Ok(StartedBackendProcess {
        pid: child.id(),
        log_path: contract.log_path.clone(),
    })
}

pub fn wait_for_backend_ready(
    host: &str,
    port: u16,
    timeout: Duration,
    interval: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;

    loop {
        if is_tcp_port_reachable(host, port) {
            return Ok(());
        }

        if Instant::now() >= deadline {
            return Err(format!(
                "Backend health probe timed out after {} ms for {}:{}",
                timeout.as_millis(),
                host,
                port
            ));
        }

        sleep(interval);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend_contract::BackendLaunchContract;
    use std::net::{TcpListener, TcpStream};
    use std::thread;

    #[test]
    fn launcher_reuses_backend_when_port_is_reachable() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener.local_addr().expect("test listener address").port();
        thread::spawn(move || {
            let _ = listener.accept();
        });

        let mut contract = BackendLaunchContract::default_for_repo("/tmp/BranchWhisper");
        contract.port = port;
        contract.health_url = format!("http://127.0.0.1:{}/api/health", port);
        contract.app_url = format!("http://127.0.0.1:{}/app/", port);

        let result = DesktopBackendLauncher::new(contract).ensure_backend();

        assert_eq!(result.action, BackendLaunchAction::Reuse);
        assert_eq!(result.app_url, format!("http://127.0.0.1:{}/app/", port));
        assert_eq!(result.start_plan, None);
    }

    #[test]
    fn launcher_returns_start_plan_when_backend_is_unreachable() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener.local_addr().expect("test listener address").port();
        drop(listener);

        let mut contract = BackendLaunchContract::default_for_repo("/tmp/BranchWhisper");
        contract.port = port;
        contract.health_url = format!("http://127.0.0.1:{}/api/health", port);
        contract.app_url = format!("http://127.0.0.1:{}/app/", port);

        let result = DesktopBackendLauncher::new(contract).ensure_backend();

        assert_eq!(result.action, BackendLaunchAction::Start);
        assert_eq!(result.app_url, format!("http://127.0.0.1:{}/app/", port));
        assert_eq!(
            result
                .start_plan
                .as_ref()
                .expect("start plan")
                .command_line,
            "/home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 127.0.0.1 --port 7860"
        );
    }

    #[test]
    fn health_probe_reports_reachable_tcp_port() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let address = listener.local_addr().expect("test listener address");
        thread::spawn(move || {
            let _ = listener.accept();
        });

        assert!(is_tcp_port_reachable(&address.ip().to_string(), address.port()));
        let _ = TcpStream::connect(address);
    }

    #[test]
    fn start_backend_process_creates_log_and_returns_pid() {
        let temp_dir = std::env::temp_dir().join(format!(
            "branchwhisper-desktop-start-{}",
            std::process::id()
        ));
        let log_path = temp_dir.join("runtime/desktop/backend.log");
        let mut contract = BackendLaunchContract::default_for_repo(
            temp_dir.to_str().expect("temp dir path"),
        );
        contract.command.program = "/bin/sh".to_string();
        contract.command.args = vec![
            "-c".to_string(),
            "printf backend-started; printf backend-error >&2".to_string(),
        ];
        contract.log_path = log_path.to_string_lossy().into_owned();

        let result = start_backend_process(&contract).expect("process should start");
        let output = wait_for_log_text(&contract.log_path, "backend-error");

        assert!(result.pid > 0);
        assert_eq!(result.log_path, contract.log_path);
        assert!(output.contains("backend-started"));
        assert!(output.contains("backend-error"));

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn start_backend_process_reports_spawn_failure() {
        let mut contract = BackendLaunchContract::default_for_repo("/tmp/BranchWhisper");
        contract.command.program = "/definitely/missing/branchwhisper-backend".to_string();

        let error = start_backend_process(&contract).expect_err("spawn should fail");

        assert!(error.contains("/definitely/missing/branchwhisper-backend"));
    }

    #[test]
    fn wait_for_backend_ready_succeeds_when_port_opens() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener.local_addr().expect("test listener address").port();
        drop(listener);

        thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            let listener = TcpListener::bind(("127.0.0.1", port)).expect("bind delayed listener");
            let _ = listener.accept();
        });

        let result = wait_for_backend_ready(
            "127.0.0.1",
            port,
            Duration::from_millis(500),
            Duration::from_millis(25),
        );

        assert_eq!(result, Ok(()));
    }

    #[test]
    fn wait_for_backend_ready_times_out_when_port_stays_closed() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener.local_addr().expect("test listener address").port();
        drop(listener);

        let result = wait_for_backend_ready(
            "127.0.0.1",
            port,
            Duration::from_millis(75),
            Duration::from_millis(25),
        );

        assert!(result.expect_err("timeout expected").contains("timed out"));
    }

    fn wait_for_log_text(path: &str, expected: &str) -> String {
        for _ in 0..20 {
            let output = std::fs::read_to_string(path).unwrap_or_default();
            if output.contains(expected) {
                return output;
            }
            std::thread::sleep(Duration::from_millis(25));
        }

        std::fs::read_to_string(path).unwrap_or_default()
    }
}
