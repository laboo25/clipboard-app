import { ClipboardItem, AppSettings } from '../types';
import { analyzeText } from './textDetector';

const DB_NAME = 'TauriClipboardDB';
const DB_VERSION = 1;
const STORE_NAME = 'clipboard_history';
const SETTINGS_KEY = 'tauri_clipboard_settings';
const BACKUP_STORAGE_KEY = 'tauri_clipboard_backup_history';

export const DEFAULT_SETTINGS: AppSettings = {
  historyLimit: 100,
  autoSyncOnFocus: false,
  soundFeedback: true,
  compactView: false,
  theme: 'dark',
  trimWhitespaceOnCopy: false,
  alwaysOnTop: true,
  autoPasteOnSelect: true,
  closeAfterPaste: false,
};

const KNOWN_DEMO_TEXTS = new Set([
  '#3b82f6',
  'curl -X POST https://api.example.com/v1/sync \\\n  -H "Authorization: Bearer token_98a76" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"status":"active"}\'',
  '{\n  "app": "Desktop Clipboard",\n  "framework": "Tauri + React",\n  "offlineStorage": "IndexedDB",\n  "version": "2.4.0"\n}',
  'https://tauri.app/v1/guides/getting-started/setup/',
  'hello.developer@tauri-clipboard.internal',
  '💡 Pro tip: Press [⌘1] - [⌘9] or [Ctrl 1-9] to rapidly paste recent clips. Use arrow keys [↑] [↓] to navigate and [Enter] to copy.',
  'const { readText, writeText } = window.__TAURI__.clipboard;\nawait writeText("Copied natively!");',
]);

const INITIAL_SAMPLE_CLIPS: string[] = [];

// Open or initialize IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('isPinned', 'isPinned', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createClipItem(text: string, isPinned = false): ClipboardItem {
  const analysis = analyzeText(text);
  return {
    id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    text,
    type: analysis.type,
    createdAt: Date.now(),
    copiedCount: 0,
    isPinned,
    charCount: analysis.charCount,
    wordCount: analysis.wordCount,
    lineCount: analysis.lineCount,
    metadata: analysis.metadata,
  };
}

/**
 * Load all clips from offline storage (IndexedDB with LocalStorage fallback)
 */
export async function getStoredClips(): Promise<ClipboardItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        let items: ClipboardItem[] = (request.result || []).filter(
          (item) => !KNOWN_DEMO_TEXTS.has(item.text)
        );
        // Sort by pinned first, then by createdAt desc
        items.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return b.createdAt - a.createdAt;
        });
        resolve(items);
      };

      request.onerror = () => {
        resolve(getFallbackClips());
      };
    });
  } catch {
    return getFallbackClips();
  }
}

function getFallbackClips(): ClipboardItem[] {
  try {
    const data = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (data) {
      const parsed: ClipboardItem[] = JSON.parse(data);
      const filtered = parsed.filter((item) => !KNOWN_DEMO_TEXTS.has(item.text));
      saveFallbackClips(filtered);
      return filtered;
    }
    return [];
  } catch {
    return [];
  }
}

function saveFallbackClips(items: ClipboardItem[]) {
  try {
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('LocalStorage save failed', err);
  }
}

/**
 * Save or update a clip in offline storage
 */
export async function persistClip(clip: ClipboardItem, limit = 100): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(clip);

    tx.oncomplete = () => {
      // Auto prune if limit is set
      if (limit > 0) {
        pruneOldClips(limit);
      }
    };
  } catch {
    // LocalStorage fallback
    const items = getFallbackClips();
    const index = items.findIndex((i) => i.id === clip.id);
    if (index >= 0) {
      items[index] = clip;
    } else {
      items.unshift(clip);
    }
    saveFallbackClips(limit > 0 ? items.slice(0, limit) : items);
  }
}

/**
 * Delete a single clip
 */
export async function removeStoredClip(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
  } catch {
    const items = getFallbackClips().filter((i) => i.id !== id);
    saveFallbackClips(items);
  }
}

/**
 * Prune oldest unpinned clips beyond limit
 */
export async function pruneOldClips(limit: number): Promise<void> {
  if (limit <= 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const items: ClipboardItem[] = req.result || [];
      const unpinned = items.filter((i) => !i.isPinned).sort((a, b) => b.createdAt - a.createdAt);

      if (unpinned.length > limit) {
        const toDelete = unpinned.slice(limit);
        toDelete.forEach((item) => store.delete(item.id));
      }
    };
  } catch {
    // no-op
  }
}

/**
 * Clear all unpinned history
 */
export async function clearUnpinnedHistory(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const items: ClipboardItem[] = req.result || [];
      items.forEach((item) => {
        if (!item.isPinned) {
          store.delete(item.id);
        }
      });
    };
  } catch {
    const items = getFallbackClips().filter((i) => i.isPinned);
    saveFallbackClips(items);
  }
}

/**
 * Settings Persistence
 */
export function loadSettings(): AppSettings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (data) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/**
 * Export history as JSON
 */
export function exportClipsToJson(clips: ClipboardItem[]): string {
  return JSON.stringify(
    {
      version: 1,
      appName: 'Desktop Clipboard',
      exportedAt: new Date().toISOString(),
      itemCount: clips.length,
      clips,
    },
    null,
    2
  );
}

/**
 * Import history from JSON string
 */
export function parseClipsFromJson(jsonStr: string): ClipboardItem[] | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed.clips)) {
      return parsed.clips;
    }
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
