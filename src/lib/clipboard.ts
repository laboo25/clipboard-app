// Tauri & Web Clipboard Bridge

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      clipboard?: {
        readText: () => Promise<string>;
        writeText: (text: string) => Promise<void>;
      };
      appWindow?: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        toggleMaximize: () => Promise<void>;
        close: () => Promise<void>;
        hide: () => Promise<void>;
        show: () => Promise<void>;
        setFocus: () => Promise<void>;
        setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
      };
    };
  }
}

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.__TAURI__);
};

/**
 * Invoke Tauri Rust command `paste_and_restore`:
 * 1. Writes text to clipboard
 * 2. Hides Tauri clipboard window
 * 3. Restores saved HWND (external app input)
 * 4. Dispatches SendInput Ctrl+V into focused input
 */
export async function invokePasteAndRestore(text: string): Promise<boolean> {
  if (isTauriEnvironment() && window.__TAURI__?.invoke) {
    try {
      const result = await window.__TAURI__.invoke<boolean>('paste_and_restore', { text });
      return Boolean(result);
    } catch (err) {
      console.warn('Tauri invoke paste_and_restore error, falling back', err);
    }
  }
  return false;
}

/**
 * Invoke Tauri command `set_always_on_top`
 */
export async function invokeSetAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean> {
  if (isTauriEnvironment() && window.__TAURI__) {
    try {
      if (window.__TAURI__.invoke) {
        await window.__TAURI__.invoke('set_always_on_top', { alwaysOnTop });
        return true;
      }
      if (window.__TAURI__.appWindow?.setAlwaysOnTop) {
        await window.__TAURI__.appWindow.setAlwaysOnTop(alwaysOnTop);
        return true;
      }
    } catch (err) {
      console.warn('Tauri set_always_on_top error', err);
    }
  }
  return false;
}

/**
 * Invoke Tauri command `hide_popup`
 */
export async function invokeHidePopup(): Promise<boolean> {
  if (isTauriEnvironment() && window.__TAURI__) {
    try {
      if (window.__TAURI__.invoke) {
        await window.__TAURI__.invoke('hide_popup');
        return true;
      }
      if (window.__TAURI__.appWindow?.hide) {
        await window.__TAURI__.appWindow.hide();
        return true;
      }
    } catch (err) {
      console.warn('Tauri hide_popup error', err);
    }
  }
  return false;
}

/**
 * Invoke Tauri native window dragging when topbar is held
 */
export async function invokeStartDragging(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const appWindow =
        window.__TAURI__?.appWindow ||
        (window as unknown as { __TAURI__?: { window?: { appWindow?: { startDragging: () => Promise<void> } } } })
          ?.__TAURI__?.window?.appWindow;
      if (appWindow && 'startDragging' in appWindow) {
        await (appWindow as { startDragging: () => Promise<void> }).startDragging();
      }
    } catch {
      // Ignored if unsupported in browser
    }
  }
}

/**
 * Simulate direct paste into an external or focused input/textarea
 * Preserves cursor position and fires native input events
 */
export function simulatePasteIntoElement(element: HTMLInputElement | HTMLTextAreaElement, text: string): boolean {
  try {
    element.focus();
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const currentValue = element.value;

    const newValue = currentValue.slice(0, start) + text + currentValue.slice(end);
    element.value = newValue;
    const newCursorPos = start + text.length;
    element.setSelectionRange(newCursorPos, newCursorPos);

    // Dispatch input & change events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (e) {
    console.error('Failed to paste into element', e);
    return false;
  }
}

/**
 * Play a subtle sound feedback using Web Audio API (zero external assets required)
 */
export function playClipboardFeedback(type: 'copy' | 'paste' | 'delete' = 'copy') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'copy') {
      // Crisp pleasant double beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08); // E6
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'paste') {
      // Low subtle soft tap
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'delete') {
      // Soft downward chirp
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch {
    // Audio contexts might be blocked until user interacts, safe to ignore
  }
}

/**
 * Write text to clipboard (Tauri native or Web Clipboard)
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  // 1. Try Tauri API if present
  if (isTauriEnvironment() && window.__TAURI__?.clipboard?.writeText) {
    try {
      await window.__TAURI__.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Tauri clipboard write failed, falling back to web clipboard', err);
    }
  }

  // 2. Try Web Clipboard API
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall back to execCommand
    }
  }

  // 3. Fallback for older browsers or if permission prompt was dismissed
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    return false;
  }
}

/**
 * Read text from clipboard
 */
export async function readTextFromClipboard(): Promise<string | null> {
  // 1. Try Tauri API if present
  if (isTauriEnvironment() && window.__TAURI__?.clipboard?.readText) {
    try {
      return await window.__TAURI__.clipboard.readText();
    } catch (err) {
      console.warn('Tauri clipboard read failed', err);
    }
  }

  // 2. Try Web Clipboard API
  if (navigator?.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      return text;
    } catch {
      // User may have denied clipboard-read permission in the browser
      return null;
    }
  }

  return null;
}
