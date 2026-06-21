use crate::backend_contract::BackendLaunchContract;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

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
}
