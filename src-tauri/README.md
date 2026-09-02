# Desktop Clipboard (Tauri + Rust)

A fast, lightweight, and compact desktop clipboard popup built with **Tauri + Rust + React**.

## Flow Implemented
```
Global Hotkey (Ctrl+Shift+V)
       │
       ▼
1. Save External App HWND (GetForegroundWindow)
       │
       ▼
2. Show Compact Always-On-Top Popup Window
       │
       ▼
3. User Clicks Clip Item (or presses 1-9 / Enter)
       │
       ▼
4. Set OS Clipboard (write_text)
       │
       ▼
5. Hide Clipboard Popup Window
       │
       ▼
6. Restore Target App HWND (SetForegroundWindow)
       │
       ▼
7. SendInput Ctrl+V (Direct paste into focused input/textarea)
```

## Features
- **Compact Window**: 440px width popup, framed like a native floating spotlight/palette (not full-screen).
- **Always on Top**: Window stays above external apps while open (`always_on_top: true`).
- **Focus Preservation**: Clicks inside the clipboard popup preserve the external application's HWND so that pasting into any input, textarea, terminal, or code editor works seamlessly.
- **Pin & Remove**: Keep frequently used items pinned at the top with `P`; remove unwanted clips with `Delete` / `Backspace`.
- **Global Hotkey**: `Ctrl+Shift+V` registered system-wide.

## Building and Running

```bash
# Install Tauri CLI if not already installed:
cargo install tauri-cli

# Run in development mode:
cargo tauri dev

# Build production executable for Windows (.exe / .msi):
cargo tauri build
```
