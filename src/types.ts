export type ClipType = 'text' | 'code' | 'url' | 'email' | 'color' | 'json';

export interface ClipboardItem {
  id: string;
  text: string;
  type: ClipType;
  createdAt: number;
  copiedCount: number;
  isPinned: boolean;
  charCount: number;
  wordCount: number;
  lineCount: number;
  metadata?: {
    language?: string;
    hexColor?: string;
    domain?: string;
    isValidJson?: boolean;
    formattedJson?: string;
  };
}

export type FilterType = 'all' | 'pinned' | 'code' | 'url' | 'color' | 'json' | 'text';

export type SortType = 'recent' | 'most-copied' | 'alphabetical';

export interface AppSettings {
  historyLimit: number; // e.g. 25, 50, 100, 250, 0 (0 = unlimited)
  autoSyncOnFocus: boolean;
  soundFeedback: boolean;
  compactView: boolean;
  theme: 'dark' | 'light' | 'system';
  trimWhitespaceOnCopy: boolean;
  alwaysOnTop: boolean;
  autoPasteOnSelect: boolean; // HWND restore + SendInput Ctrl+V
  closeAfterPaste: boolean;
}

export type ViewMode = 'compact' | 'sandbox' | 'split' | 'rust-code';

export interface ExternalTargetInfo {
  hwnd: string;
  appName: string;
  windowTitle: string;
  fieldLabel: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'info' | 'warning';
}
