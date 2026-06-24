#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesktopShellAction {
    None,
    ShowMainWindow,
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseRequestAction {
    HideToTray,
    AllowClose,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMouseButtonState {
    Down,
    Up,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayIconSignal {
    Click {
        button: TrayMouseButton,
        state: TrayMouseButtonState,
    },
    DoubleClick {
        button: TrayMouseButton,
    },
}

pub fn menu_action_for_id(id: &str) -> DesktopShellAction {
    match id {
        "show" => DesktopShellAction::ShowMainWindow,
        "quit" => DesktopShellAction::Quit,
        _ => DesktopShellAction::None,
    }
}

pub fn tray_icon_action(signal: TrayIconSignal) -> DesktopShellAction {
    match signal {
        TrayIconSignal::Click {
            button: TrayMouseButton::Left,
            state: TrayMouseButtonState::Up,
        } => DesktopShellAction::ShowMainWindow,
        TrayIconSignal::DoubleClick {
            button: TrayMouseButton::Left,
        } => DesktopShellAction::ShowMainWindow,
        _ => DesktopShellAction::None,
    }
}

pub fn close_request_action(is_quitting: bool) -> CloseRequestAction {
    if is_quitting {
        CloseRequestAction::AllowClose
    } else {
        CloseRequestAction::HideToTray
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_right_click_does_not_restore_window() {
        assert_eq!(
            tray_icon_action(TrayIconSignal::Click {
                button: TrayMouseButton::Right,
                state: TrayMouseButtonState::Up,
            }),
            DesktopShellAction::None
        );
        assert_eq!(
            tray_icon_action(TrayIconSignal::DoubleClick {
                button: TrayMouseButton::Right,
            }),
            DesktopShellAction::None
        );
    }

    #[test]
    fn left_button_down_does_not_restore_window_before_the_menu_decides_focus() {
        assert_eq!(
            tray_icon_action(TrayIconSignal::Click {
                button: TrayMouseButton::Left,
                state: TrayMouseButtonState::Down,
            }),
            DesktopShellAction::None
        );
    }

    #[test]
    fn left_button_up_restores_window() {
        assert_eq!(
            tray_icon_action(TrayIconSignal::Click {
                button: TrayMouseButton::Left,
                state: TrayMouseButtonState::Up,
            }),
            DesktopShellAction::ShowMainWindow
        );
    }

    #[test]
    fn left_double_click_restores_window() {
        assert_eq!(
            tray_icon_action(TrayIconSignal::DoubleClick {
                button: TrayMouseButton::Left,
            }),
            DesktopShellAction::ShowMainWindow
        );
    }

    #[test]
    fn quit_menu_item_requests_exit() {
        assert_eq!(menu_action_for_id("quit"), DesktopShellAction::Quit);
    }

    #[test]
    fn show_menu_item_requests_restore() {
        assert_eq!(
            menu_action_for_id("show"),
            DesktopShellAction::ShowMainWindow
        );
    }

    #[test]
    fn unknown_menu_item_does_nothing() {
        assert_eq!(menu_action_for_id("unknown"), DesktopShellAction::None);
    }

    #[test]
    fn close_button_hides_unless_quitting() {
        assert_eq!(close_request_action(false), CloseRequestAction::HideToTray);
        assert_eq!(close_request_action(true), CloseRequestAction::AllowClose);
    }
}
