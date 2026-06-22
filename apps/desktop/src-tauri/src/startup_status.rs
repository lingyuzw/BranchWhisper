use crate::backend_launcher::{BackendLaunchResult, StartedBackendProcess};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DesktopStartupState {
    Checking,
    Reusing,
    Starting,
    Ready,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopStartupStatus {
    pub state: DesktopStartupState,
    pub summary: String,
    pub detail: String,
    pub command_line: String,
    pub log_path: String,
    pub repair_hints: Vec<String>,
    pub app_url: String,
}

impl DesktopStartupStatus {
    pub fn checking(app_url: &str) -> Self {
        Self {
            state: DesktopStartupState::Checking,
            summary: "正在检查后端".to_string(),
            detail: "正在确认本机是否已有 BranchWhisper 后端运行。".to_string(),
            command_line: String::new(),
            log_path: String::new(),
            repair_hints: vec!["如果一直停留在这里，可以先进入 API 模式完成基础配置。".to_string()],
            app_url: app_url.to_string(),
        }
    }

    pub fn reusing(result: &BackendLaunchResult) -> Self {
        Self {
            state: DesktopStartupState::Reusing,
            summary: "已连接正在运行的后端".to_string(),
            detail: "检测到本机后端端口已可用，正在打开应用页面。".to_string(),
            command_line: String::new(),
            log_path: String::new(),
            repair_hints: Vec::new(),
            app_url: result.app_url.clone(),
        }
    }

    pub fn starting(result: &BackendLaunchResult) -> Self {
        let (command_line, log_path, repair_hints) = start_plan_parts(result);
        Self {
            state: DesktopStartupState::Starting,
            summary: "正在启动后端".to_string(),
            detail: "没有检测到已运行的后端，桌面应用正在启动本地后端进程。".to_string(),
            command_line,
            log_path,
            repair_hints,
            app_url: result.app_url.clone(),
        }
    }

    pub fn ready(result: &BackendLaunchResult, process: Option<&StartedBackendProcess>) -> Self {
        let (command_line, mut log_path, _) = start_plan_parts(result);
        if let Some(process) = process {
            log_path = process.log_path.clone();
        }

        let detail = match process {
            Some(process) => format!("后端进程已启动，PID：{}。正在打开应用页面。", process.pid),
            None => "后端已可用，正在打开应用页面。".to_string(),
        };

        Self {
            state: DesktopStartupState::Ready,
            summary: "后端已就绪".to_string(),
            detail,
            command_line,
            log_path,
            repair_hints: Vec::new(),
            app_url: result.app_url.clone(),
        }
    }

    pub fn failed(
        result: &BackendLaunchResult,
        process: Option<&StartedBackendProcess>,
        error: &str,
    ) -> Self {
        let (command_line, mut log_path, mut repair_hints) = start_plan_parts(result);
        if let Some(process) = process {
            log_path = process.log_path.clone();
        }

        repair_hints.insert(0, "可以先进入 API 模式，不需要本机模型环境。".to_string());
        if !log_path.is_empty() {
            repair_hints.push("查看或复制日志路径后，把日志内容用于诊断页面导出报告。".to_string());
        }

        Self {
            state: DesktopStartupState::Failed,
            summary: "后端启动失败".to_string(),
            detail: error.to_string(),
            command_line,
            log_path,
            repair_hints,
            app_url: result.app_url.clone(),
        }
    }

    pub fn to_json(&self) -> String {
        format!(
            "{{\"state\":\"{}\",\"summary\":\"{}\",\"detail\":\"{}\",\"command_line\":\"{}\",\"log_path\":\"{}\",\"repair_hints\":[{}],\"app_url\":\"{}\"}}",
            self.state.as_str(),
            json_escape(&self.summary),
            json_escape(&self.detail),
            json_escape(&self.command_line),
            json_escape(&self.log_path),
            self.repair_hints
                .iter()
                .map(|hint| format!("\"{}\"", json_escape(hint)))
                .collect::<Vec<_>>()
                .join(","),
            json_escape(&self.app_url),
        )
    }
}

impl DesktopStartupState {
    fn as_str(&self) -> &'static str {
        match self {
            DesktopStartupState::Checking => "checking",
            DesktopStartupState::Reusing => "reusing",
            DesktopStartupState::Starting => "starting",
            DesktopStartupState::Ready => "ready",
            DesktopStartupState::Failed => "failed",
        }
    }
}

fn start_plan_parts(result: &BackendLaunchResult) -> (String, String, Vec<String>) {
    match &result.start_plan {
        Some(plan) => (
            plan.command_line.clone(),
            plan.log_path.clone(),
            plan.repair_hints.clone(),
        ),
        None => (String::new(), String::new(), Vec::new()),
    }
}

fn json_escape(value: &str) -> String {
    let mut escaped = String::new();

    for ch in value.chars() {
        match ch {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '<' => escaped.push_str("\\u003c"),
            '>' => escaped.push_str("\\u003e"),
            '&' => escaped.push_str("\\u0026"),
            ch if ch < ' ' => escaped.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => escaped.push(ch),
        }
    }

    escaped
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend_launcher::{
        BackendLaunchAction, BackendLaunchResult, BackendStartPlan, StartedBackendProcess,
    };

    #[test]
    fn failed_status_keeps_actionable_command_log_and_hints() {
        let result = start_result();
        let process = StartedBackendProcess {
            pid: 1234,
            log_path: "/tmp/BranchWhisper/runtime/desktop/backend.log".to_string(),
        };

        let status = DesktopStartupStatus::failed(
            &result,
            Some(&process),
            "Backend health probe timed out after 30000 ms for 127.0.0.1:7860",
        );

        assert_eq!(status.state, DesktopStartupState::Failed);
        assert_eq!(status.summary, "后端启动失败");
        assert!(status.detail.contains("timed out"));
        assert_eq!(
            status.command_line,
            "/home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 127.0.0.1 --port 7860"
        );
        assert_eq!(
            status.log_path,
            "/tmp/BranchWhisper/runtime/desktop/backend.log"
        );
        assert!(status
            .repair_hints
            .contains(&"可以先进入 API 模式，不需要本机模型环境。".to_string()));
        assert_eq!(status.app_url, "http://127.0.0.1:7860/app/");
    }

    #[test]
    fn ready_status_reports_reused_backend_without_local_command_noise() {
        let result = BackendLaunchResult {
            action: BackendLaunchAction::Reuse,
            app_url: "http://127.0.0.1:7860/app/".to_string(),
            start_plan: None,
        };

        let status = DesktopStartupStatus::reusing(&result);

        assert_eq!(status.state, DesktopStartupState::Reusing);
        assert_eq!(status.summary, "已连接正在运行的后端");
        assert_eq!(status.command_line, "");
        assert_eq!(status.log_path, "");
        assert_eq!(status.repair_hints, Vec::<String>::new());
    }

    #[test]
    fn status_json_escapes_frontend_injected_values() {
        let status = DesktopStartupStatus {
            state: DesktopStartupState::Failed,
            summary: "后端启动失败".to_string(),
            detail: "路径包含 \"引号\" 和换行\n继续".to_string(),
            command_line: "conda run -n qwen3-asr python backend/main.py".to_string(),
            log_path: "/tmp/backend.log".to_string(),
            repair_hints: vec!["检查 <conda> 环境".to_string()],
            app_url: "http://127.0.0.1:7860/app/".to_string(),
        };

        let json = status.to_json();

        assert!(json.contains("\"state\":\"failed\""));
        assert!(json.contains("\\\"引号\\\""));
        assert!(json.contains("\\n"));
        assert!(json.contains("\\u003cconda\\u003e"));
    }

    fn start_result() -> BackendLaunchResult {
        BackendLaunchResult {
            action: BackendLaunchAction::Start,
            app_url: "http://127.0.0.1:7860/app/".to_string(),
            start_plan: Some(BackendStartPlan {
                cwd: "/tmp/BranchWhisper".to_string(),
                command_line: "/home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 127.0.0.1 --port 7860".to_string(),
                log_path: "/tmp/BranchWhisper/runtime/desktop/backend.log".to_string(),
                repair_hints: vec![
                    "Confirm the qwen3-asr conda environment exists.".to_string(),
                    "Run the command manually from the repository root and inspect the log.".to_string(),
                ],
            }),
        }
    }
}
