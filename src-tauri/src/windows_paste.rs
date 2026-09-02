//! Windows HWND Focus & SendInput (Ctrl+V) Automation Module
//!
//! Workflow:
//! 1. Global hotkey (e.g. Ctrl+Shift+V) fires -> save_current_foreground_window() saves the HWND
//!    of the active external app (Notepad, VSCode, Chrome, Slack, etc.).
//! 2. Clipboard popup appears (always on top, compact window).
//! 3. User clicks any item or presses 1-9 / Enter.
//! 4. App sets clipboard text.
//! 5. App hides clipboard popup window.
//! 6. restore_focus_and_paste() switches foreground back to saved HWND and sends Ctrl+V keystrokes.

#[cfg(windows)]
pub mod windows {
    use std::sync::atomic::{AtomicIsize, Ordering};
    use std::thread::sleep;
    use std::time::Duration;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
    };
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, SetForegroundWindow, ShowWindow, SW_RESTORE,
        GetWindowThreadProcessId,
    };

    static LAST_FOCUSED_HWND: AtomicIsize = AtomicIsize::new(0);

    /// Saves the current foreground window HWND before the clipboard popup takes focus.
    pub fn save_current_foreground_window() -> isize {
        unsafe {
            let hwnd = GetForegroundWindow();
            LAST_FOCUSED_HWND.store(hwnd, Ordering::SeqCst);
            hwnd
        }
    }

    /// Returns the currently stored HWND.
    pub fn get_saved_hwnd() -> isize {
        LAST_FOCUSED_HWND.load(Ordering::SeqCst)
    }

    /// Restores focus to the saved HWND and dispatches a native SendInput (Ctrl + V).
    pub fn restore_focus_and_paste() -> bool {
        let hwnd_val = LAST_FOCUSED_HWND.load(Ordering::SeqCst);
        if hwnd_val == 0 {
            return false;
        }

        let hwnd: HWND = hwnd_val;

        unsafe {
            // Optional: attach thread input to ensure robust focus stealing bypass on Windows 10/11
            let _foreground_hwnd = GetForegroundWindow();
            let cur_thread_id = GetCurrentThreadId();
            let target_thread_id = GetWindowThreadProcessId(hwnd, std::ptr::null_mut());

            if cur_thread_id != target_thread_id && target_thread_id != 0 {
                AttachThreadInput(cur_thread_id, target_thread_id, 1);
            }

            // Restore target external app window & bring to foreground
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);

            if cur_thread_id != target_thread_id && target_thread_id != 0 {
                AttachThreadInput(cur_thread_id, target_thread_id, 0);
            }

            // Small 40ms pause to ensure Windows window manager completes focus transition
            sleep(Duration::from_millis(40));

            // Prepare SendInput for Ctrl + V:
            // 1. Ctrl Down
            // 2. V Down
            // 3. V Up
            // 4. Ctrl Up
            let mut inputs: [INPUT; 4] = std::mem::zeroed();

            // INPUT 0: Ctrl KeyDown
            inputs[0].r#type = INPUT_KEYBOARD;
            inputs[0].Anonymous.ki = KEYBDINPUT {
                wVk: VK_CONTROL,
                wScan: 0,
                dwFlags: 0,
                time: 0,
                dwExtraInfo: 0,
            };

            // INPUT 1: V KeyDown
            inputs[1].r#type = INPUT_KEYBOARD;
            inputs[1].Anonymous.ki = KEYBDINPUT {
                wVk: VK_V,
                wScan: 0,
                dwFlags: 0,
                time: 0,
                dwExtraInfo: 0,
            };

            // INPUT 2: V KeyUp
            inputs[2].r#type = INPUT_KEYBOARD;
            inputs[2].Anonymous.ki = KEYBDINPUT {
                wVk: VK_V,
                wScan: 0,
                dwFlags: KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            };

            // INPUT 3: Ctrl KeyUp
            inputs[3].r#type = INPUT_KEYBOARD;
            inputs[3].Anonymous.ki = KEYBDINPUT {
                wVk: VK_CONTROL,
                wScan: 0,
                dwFlags: KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            };

            let count_sent = SendInput(
                4,
                inputs.as_mut_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            );

            count_sent == 4
        }
    }
}

#[cfg(not(windows))]
pub mod fallback {
    use std::sync::atomic::{AtomicIsize, Ordering};
    static LAST_FOCUSED_HWND: AtomicIsize = AtomicIsize::new(0);

    pub fn save_current_foreground_window() -> isize {
        LAST_FOCUSED_HWND.store(1, Ordering::SeqCst);
        1
    }

    pub fn get_saved_hwnd() -> isize {
        LAST_FOCUSED_HWND.load(Ordering::SeqCst)
    }

    pub fn restore_focus_and_paste() -> bool {
        // macOS AppleScript fallback: tell application "System Events" to keystroke "v" using command down
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("osascript")
                .args(["-e", "tell application \"System Events\" to keystroke \"v\" using command down"])
                .output();
        }
        true
    }
}
