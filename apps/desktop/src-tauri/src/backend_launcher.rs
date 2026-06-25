use crate::backend_contract::BackendLaunchContract;
use std::fs::{create_dir_all, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

const HEALTH_PROBE_TIMEOUT: Duration = Duration::from_millis(350);
const DESKTOP_PROBE_ORIGIN: &str = "http://tauri.localhost";
#[cfg(test)]
const DESKTOP_CAPABILITIES_RESPONSE: &[u8] = b"HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: http://tauri.localhost\r\nConnection: close\r\n\r\n{\"ok\":true,\"product\":\"BranchWhisper\",\"desktop_api_version\":2,\"features\":[\"api_providers\",\"statistics\"]}";

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

#[derive(Debug, Clone, PartialEq, Eq)]
enum DesktopBackendPortState {
    Reusable,
    Incompatible,
    Unreachable,
}

pub struct DesktopBackendLauncher {
    contract: BackendLaunchContract,
}

impl DesktopBackendLauncher {
    pub fn new(contract: BackendLaunchContract) -> Self {
        Self { contract }
    }

    pub fn ensure_backend(&self) -> BackendLaunchResult {
        if desktop_backend_port_state(&self.contract.host, self.contract.port)
            == DesktopBackendPortState::Reusable
        {
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
        Ok(mut addresses) => addresses
            .any(|address| TcpStream::connect_timeout(&address, HEALTH_PROBE_TIMEOUT).is_ok()),
        Err(_) => false,
    }
}

pub fn is_desktop_backend_reusable(host: &str, port: u16) -> bool {
    let addresses = match (host, port).to_socket_addrs() {
        Ok(addresses) => addresses.collect::<Vec<_>>(),
        Err(_) => return false,
    };

    for address in addresses {
        let Ok(mut stream) = TcpStream::connect_timeout(&address, HEALTH_PROBE_TIMEOUT) else {
            continue;
        };
        let _ = stream.set_read_timeout(Some(HEALTH_PROBE_TIMEOUT));
        let _ = stream.set_write_timeout(Some(HEALTH_PROBE_TIMEOUT));

        let request = format!(
            "GET /api/desktop/capabilities HTTP/1.1\r\nHost: {}:{}\r\nOrigin: {}\r\nConnection: close\r\n\r\n",
            host, port, DESKTOP_PROBE_ORIGIN
        );

        if stream.write_all(request.as_bytes()).is_err() {
            continue;
        }

        let mut response = String::new();
        if stream.read_to_string(&mut response).is_err() {
            continue;
        }

        if desktop_probe_response_is_branchwhisper_config(&response, DESKTOP_PROBE_ORIGIN) {
            return true;
        }
    }

    false
}

fn desktop_backend_port_state(host: &str, port: u16) -> DesktopBackendPortState {
    if is_desktop_backend_reusable(host, port) {
        return DesktopBackendPortState::Reusable;
    }

    if is_tcp_port_reachable(host, port) {
        return DesktopBackendPortState::Incompatible;
    }

    DesktopBackendPortState::Unreachable
}

fn desktop_probe_response_is_branchwhisper_config(response: &str, origin: &str) -> bool {
    let Some((headers, body)) = response.split_once("\r\n\r\n") else {
        return false;
    };
    desktop_probe_headers_allow_origin(headers, origin)
        && body.contains("\"product\"")
        && body.contains("\"BranchWhisper\"")
        && body.contains("\"desktop_api_version\"")
        && body.contains("\"api_providers\"")
        && body.contains("\"statistics\"")
}

fn desktop_probe_headers_allow_origin(headers: &str, origin: &str) -> bool {
    let mut lines = headers.lines();
    let Some(status_line) = lines.next() else {
        return false;
    };
    let status_ok = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .is_some_and(|code| (200..400).contains(&code));
    if !status_ok {
        return false;
    }

    lines.any(|line| {
        let Some((name, value)) = line.split_once(':') else {
            return false;
        };
        let header_value = value.trim();
        name.trim().eq_ignore_ascii_case("access-control-allow-origin")
            && (header_value == "*" || header_value == origin)
    })
}

pub fn start_backend_process(
    contract: &BackendLaunchContract,
) -> Result<StartedBackendProcess, String> {
    release_incompatible_backend_port(contract)?;

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
        .map_err(|error| {
            format!(
                "Failed to open backend log {}: {}",
                contract.log_path, error
            )
        })?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("Failed to clone backend log handle: {}", error))?;

    let mut command = Command::new(&contract.command.program);
    configure_backend_command(&mut command);

    let child = command
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

fn release_incompatible_backend_port(contract: &BackendLaunchContract) -> Result<(), String> {
    release_incompatible_backend_port_with(
        &contract.host,
        contract.port,
        Duration::from_secs(3),
        Duration::from_millis(100),
        is_tcp_port_reachable,
        is_desktop_backend_reusable,
        stop_stale_backend_processes,
    )
}

fn release_incompatible_backend_port_with<TcpReachable, DesktopReusable, StopStale>(
    host: &str,
    port: u16,
    timeout: Duration,
    interval: Duration,
    mut tcp_reachable: TcpReachable,
    mut desktop_reusable: DesktopReusable,
    mut stop_stale: StopStale,
) -> Result<(), String>
where
    TcpReachable: FnMut(&str, u16) -> bool,
    DesktopReusable: FnMut(&str, u16) -> bool,
    StopStale: FnMut() -> Result<(), String>,
{
    if desktop_reusable(host, port) || !tcp_reachable(host, port) {
        return Ok(());
    }

    stop_stale()?;
    let deadline = Instant::now() + timeout;

    loop {
        if desktop_reusable(host, port) || !tcp_reachable(host, port) {
            return Ok(());
        }

        if Instant::now() >= deadline {
            return Err(format!(
                "Existing process on {}:{} is reachable but not compatible with BranchWhisper desktop. Stop old branchwhisper-backend.exe and reopen BranchWhisper.",
                host, port
            ));
        }

        sleep(interval);
    }
}

#[cfg(windows)]
fn stop_stale_backend_processes() -> Result<(), String> {
    let mut command = Command::new("taskkill");
    configure_backend_command(&mut command);
    let output = command
        .args(["/IM", "branchwhisper-backend.exe", "/F", "/T"])
        .output()
        .map_err(|error| format!("Failed to stop stale branchwhisper-backend.exe: {}", error))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!("{}{}", stdout, stderr).to_lowercase();
    if combined.contains("not found") || combined.contains("no tasks") {
        return Ok(());
    }

    Ok(())
}

#[cfg(not(windows))]
fn stop_stale_backend_processes() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn configure_backend_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn configure_backend_command(_command: &mut Command) {}

pub fn wait_for_backend_ready(
    host: &str,
    port: u16,
    timeout: Duration,
    interval: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;

    loop {
        if is_desktop_backend_reusable(host, port) {
            return Ok(());
        }

        if Instant::now() >= deadline {
            return Err(format!(
                "Backend desktop probe timed out after {} ms for {}:{}",
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
    fn launcher_reuses_backend_when_desktop_probe_succeeds() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener.local_addr().expect("test listener address").port();
        thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buffer = [0_u8; 1024];
                let _ = stream.read(&mut buffer);
                let _ = stream.write_all(DESKTOP_CAPABILITIES_RESPONSE);
            }
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
    fn launcher_starts_when_existing_port_lacks_desktop_cors() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener.local_addr().expect("test listener address").port();
        thread::spawn(move || {
            for _ in 0..2 {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let mut buffer = [0_u8; 1024];
                let _ = stream.read(&mut buffer);
                let _ = stream.write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                );
            }
        });

        let mut contract = BackendLaunchContract::default_for_repo("/tmp/BranchWhisper");
        contract.port = port;
        contract.health_url = format!("http://127.0.0.1:{}/api/health", port);
        contract.app_url = format!("http://127.0.0.1:{}/app/", port);

        let result = DesktopBackendLauncher::new(contract).ensure_backend();

        assert_eq!(result.action, BackendLaunchAction::Start);
        assert!(result.start_plan.is_some());
    }

    #[test]
    fn desktop_probe_rejects_non_branchwhisper_service_even_with_cors() {
        let response = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: http://tauri.localhost\r\nContent-Length: 2\r\n\r\n{}";

        assert!(!desktop_probe_response_is_branchwhisper_config(
            response,
            DESKTOP_PROBE_ORIGIN
        ));
    }

    #[test]
    fn desktop_probe_rejects_legacy_branchwhisper_backend_without_desktop_capabilities() {
        let response = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: http://tauri.localhost\r\nContent-Length: 27\r\n\r\n{\"asr_provider_mode\":\"api\"}";

        assert!(!desktop_probe_response_is_branchwhisper_config(
            response,
            DESKTOP_PROBE_ORIGIN
        ));
    }

    #[test]
    fn release_incompatible_backend_port_stops_stale_process_before_starting() {
        let mut stop_count = 0;
        let mut tcp_checks = 0;

        let result = release_incompatible_backend_port_with(
            "127.0.0.1",
            7860,
            Duration::ZERO,
            Duration::ZERO,
            |_, _| {
                tcp_checks += 1;
                tcp_checks == 1
            },
            |_, _| false,
            || {
                stop_count += 1;
                Ok(())
            },
        );

        assert_eq!(result, Ok(()));
        assert_eq!(stop_count, 1);
    }

    #[test]
    fn release_incompatible_backend_port_reports_still_blocked_port() {
        let result = release_incompatible_backend_port_with(
            "127.0.0.1",
            7860,
            Duration::ZERO,
            Duration::ZERO,
            |_, _| true,
            |_, _| false,
            || Ok(()),
        );

        assert!(result
            .expect_err("blocked port should report error")
            .contains("not compatible"));
    }

    #[test]
    fn launcher_returns_start_plan_when_backend_is_unreachable() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener.local_addr().expect("test listener address").port();
        drop(listener);

        let mut contract = BackendLaunchContract::for_platform_and_repo(
            "linux",
            "/tmp/BranchWhisper",
            |_| None,
            |_| false,
        );
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

        assert!(is_tcp_port_reachable(
            &address.ip().to_string(),
            address.port()
        ));
        let _ = TcpStream::connect(address);
    }

    #[test]
    fn start_backend_process_creates_log_and_returns_pid() {
        let temp_dir = std::env::temp_dir().join(format!(
            "branchwhisper-desktop-start-{}",
            std::process::id()
        ));
        let log_path = temp_dir.join("runtime/desktop/backend.log");
        let mut contract =
            BackendLaunchContract::default_for_repo(temp_dir.to_str().expect("temp dir path"));
        let (program, args) = test_log_command();
        contract.command.program = program;
        contract.command.args = args;
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
    fn backend_launcher_defines_windows_no_console_startup_flag() {
        let source = std::fs::read_to_string("src/backend_launcher.rs")
            .expect("backend launcher source should be readable");

        assert!(source.contains("CREATE_NO_WINDOW"));
        assert!(source.contains("creation_flags(CREATE_NO_WINDOW)"));
    }

    #[test]
    fn wait_for_backend_ready_succeeds_when_port_opens() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener.local_addr().expect("test listener address").port();
        drop(listener);

        thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            let listener = TcpListener::bind(("127.0.0.1", port)).expect("bind delayed listener");
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buffer = [0_u8; 1024];
                let _ = stream.read(&mut buffer);
                let _ = stream.write_all(DESKTOP_CAPABILITIES_RESPONSE);
            }
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

    #[cfg(windows)]
    fn test_log_command() -> (String, Vec<String>) {
        (
            "cmd".to_string(),
            vec![
                "/C".to_string(),
                "echo|set /p=backend-started & echo backend-error 1>&2".to_string(),
            ],
        )
    }

    #[cfg(not(windows))]
    fn test_log_command() -> (String, Vec<String>) {
        (
            "/bin/sh".to_string(),
            vec![
                "-c".to_string(),
                "printf backend-started; printf backend-error >&2".to_string(),
            ],
        )
    }
}
