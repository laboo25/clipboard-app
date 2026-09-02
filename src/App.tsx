import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ClipboardItem,
  FilterType,
  AppSettings,
} from './types';
import {
  getStoredClips,
  persistClip,
  removeStoredClip,
  clearUnpinnedHistory,
  loadSettings,
  createClipItem,
} from './lib/storage';
import {
  copyTextToClipboard,
  readTextFromClipboard,
  playClipboardFeedback,
  invokePasteAndRestore,
  invokeSetAlwaysOnTop,
  invokeHidePopup,
  invokeStartDragging,
  isTauriEnvironment,
} from './lib/clipboard';
import {
  Search,
  Pin,
  Trash2,
  Check,
  X,
  Clock,
  Clipboard as ClipboardIcon,
} from 'lucide-react';

export default function App() {
  const [clips, setClips] = useState<ClipboardItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [settings] = useState<AppSettings>(() => ({
    ...loadSettings(),
    alwaysOnTop: true, // Permanent always-on-top for utility overlay
  }));
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Floating Window Position (movable via topbar drag)
  const [windowPos, setWindowPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      const defaultX = Math.max(16, Math.floor(window.innerWidth / 2 - 150));
      const defaultY = Math.max(16, Math.floor(window.innerHeight / 2 - 185));
      return { x: defaultX, y: defaultY };
    }
    return { x: 100, y: 100 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const lastKnownClipboardRef = useRef<string>('');
  const isTauri = isTauriEnvironment();

  // Ensure Always-on-top in Tauri & Dark theme + Disable browser context menu & browser defaults
  useEffect(() => {
    document.documentElement.classList.add('dark');
    invokeSetAlwaysOnTop(true);

    // Completely disable browser context menu globally
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // Disable browser zoom via Ctrl/Cmd + Mouse wheel
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // Disable dropping external files/text into the window
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    // Disable middle-click auto-scroll
    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu, { capture: true });
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    window.addEventListener('dragover', handleDragOver, { capture: true });
    window.addEventListener('drop', handleDrop, { capture: true });
    window.addEventListener('auxclick', handleAuxClick, { capture: true });

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      window.removeEventListener('wheel', handleWheel, { capture: true });
      window.removeEventListener('dragover', handleDragOver, { capture: true });
      window.removeEventListener('drop', handleDrop, { capture: true });
      window.removeEventListener('auxclick', handleAuxClick, { capture: true });
    };
  }, []);

  // Toggle Always on Top state and update Tauri window setting
  const handleToggleAlwaysOnTop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const nextVal = !isAlwaysOnTop;
      setIsAlwaysOnTop(nextVal);
      if (isTauri) {
        await invokeSetAlwaysOnTop(nextVal);
      }
    },
    [isAlwaysOnTop, isTauri]
  );

  // Load clips from storage on mount
  useEffect(() => {
    let isMounted = true;
    getStoredClips().then((loaded) => {
      if (isMounted) {
        setClips(loaded);
        if (loaded.length > 0) {
          setSelectedId(loaded[0].id);
          lastKnownClipboardRef.current = loaded[0].text;
        }
        setIsLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Topbar Dragging: Move the floating window across the screen
  const handleMouseDownTopbar = useCallback((e: React.MouseEvent) => {
    // If clicking on an action button, do not start window drag
    if ((e.target as HTMLElement).closest('button, input')) {
      return;
    }

    // Call native Tauri window drag if running in desktop app
    invokeStartDragging();

    // Handle mouse drag in web preview/desktop view
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: windowPos.x,
      startY: windowPos.y,
    };
  }, [windowPos]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      // Keep window within visible screen bounds
      const minX = 8;
      const maxX = Math.max(minX, window.innerWidth - 370);
      const minY = 8;
      const maxY = Math.max(minY, window.innerHeight - 80);

      const nextX = Math.min(Math.max(minX, dragStartRef.current.startX + dx), maxX);
      const nextY = Math.min(Math.max(minY, dragStartRef.current.startY + dy), maxY);

      setWindowPos({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Automatic Background Clipboard Polling (NO manual refresh button needed!)
  const checkClipboardAutomatically = useCallback(async () => {
    try {
      const text = await readTextFromClipboard();
      if (!text || !text.trim()) return;

      // If already recorded as last known clipboard text, ignore
      if (text === lastKnownClipboardRef.current) return;
      lastKnownClipboardRef.current = text;

      setClips((prev) => {
        // If it matches the very first item, nothing to do
        if (prev.length > 0 && prev[0].text === text) {
          return prev;
        }

        const existingIdx = prev.findIndex((c) => c.text === text);
        if (existingIdx !== -1) {
          // If already exists, update its timestamp to bring it to recent
          const existing = prev[existingIdx];
          const rest = prev.filter((_, idx) => idx !== existingIdx);
          const updated = { ...existing, createdAt: Date.now() };
          persistClip(updated, settings.historyLimit);
          return [updated, ...rest];
        }

        // New text copied! Add as temporary clip (permanent = false)
        const newClip = createClipItem(text, false);
        persistClip(newClip, settings.historyLimit);
        return [newClip, ...prev];
      });
    } catch {
      // Ignore background read errors (e.g. browser permission transitions)
    }
  }, [settings.historyLimit]);

  // Listen for window focus & run interval to auto-detect new copied text
  useEffect(() => {
    const onFocus = () => {
      checkClipboardAutomatically();
    };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(checkClipboardAutomatically, 900);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [checkClipboardAutomatically]);

  // Primary Action: Click item -> Copy text -> Hide overlay -> Restore target HWND -> SendInput(Ctrl+V)
  const handlePasteItem = useCallback(
    async (item: ClipboardItem, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();

      const textToPaste = settings.trimWhitespaceOnCopy ? item.text.trim() : item.text;

      // 1. Set text to system clipboard
      await copyTextToClipboard(textToPaste);
      lastKnownClipboardRef.current = textToPaste;

      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1200);

      if (settings.soundFeedback) {
        playClipboardFeedback('paste');
      }

      // Increment copied count
      setClips((prev) =>
        prev.map((c) => {
          if (c.id === item.id) {
            const updated = { ...c, copiedCount: c.copiedCount + 1 };
            persistClip(updated, settings.historyLimit);
            return updated;
          }
          return c;
        })
      );

      // 2. Tauri Native: hide popup -> restore external window HWND -> send Ctrl+V
      if (isTauri) {
        await invokePasteAndRestore(textToPaste);
      }
    },
    [settings.trimWhitespaceOnCopy, settings.soundFeedback, settings.historyLimit, isTauri]
  );

  // Toggle Permanent / Pinned Storage
  // Pinned items are PERMANENT and will NOT be removed until user explicitly deletes them from storage
  const handleTogglePin = useCallback(
    (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setClips((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const updated = { ...item, isPinned: !item.isPinned };
            persistClip(updated, settings.historyLimit);
            return updated;
          }
          return item;
        })
      );
    },
    [settings.historyLimit]
  );

  // Explicitly delete/remove item from storage (user initiated)
  const handleDeleteClip = useCallback(
    (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (settings.soundFeedback) {
        playClipboardFeedback('delete');
      }
      setClips((prev) => {
        const remaining = prev.filter((item) => item.id !== id);
        if (selectedId === id) {
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
      removeStoredClip(id);
    },
    [selectedId, settings.soundFeedback]
  );

  // Clear all temporary (unpinned) items — PERMANENT (pinned) items remain intact in storage!
  const handleClearTemporary = useCallback(async () => {
    await clearUnpinnedHistory();
    setClips((prev) => {
      const keptPinned = prev.filter((c) => c.isPinned);
      if (keptPinned.length > 0) setSelectedId(keptPinned[0].id);
      else setSelectedId(null);
      return keptPinned;
    });
  }, []);

  // Filtered Clips
  const filteredClips = useMemo(() => {
    return clips
      .filter((item) => {
        if (activeFilter === 'pinned' && !item.isPinned) return false;
        if (activeFilter === 'temporary' && item.isPinned) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesText = item.text.toLowerCase().includes(q);
          const matchesDomain = item.metadata?.domain?.toLowerCase().includes(q);
          const matchesLang = item.metadata?.language?.toLowerCase().includes(q);
          return matchesText || matchesDomain || matchesLang;
        }
        return true;
      })
      .sort((a, b) => {
        // Permanent (pinned) always stays at top
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.createdAt - a.createdAt;
      });
  }, [clips, activeFilter, searchQuery]);

  const selectedClip = useMemo(() => {
    return clips.find((c) => c.id === selectedId) || null;
  }, [clips, selectedId]);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Suppress browser default shortcuts (Refresh, Zoom, Devtools, Print, Save, etc.)
      if (
        e.key === 'F5' ||
        (isCtrlOrCmd && (e.key === 'r' || e.key === 'R')) || // Reload
        (isCtrlOrCmd && (e.key === 'p' || e.key === 'P')) || // Print
        (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) || // Save
        (isCtrlOrCmd && (e.key === 'u' || e.key === 'U')) || // View Source
        (isCtrlOrCmd && (e.key === 'o' || e.key === 'O')) || // Open file
        (isCtrlOrCmd && (e.key === 'g' || e.key === 'G')) || // Find next
        (isCtrlOrCmd && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '_' || e.key === '0')) || // Zoom
        e.key === 'F12' || // DevTools
        (isCtrlOrCmd && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Map Ctrl+F / Cmd+F to search input focus instead of browser search
      if (isCtrlOrCmd && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Escape to hide popup or clear search
      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
          return;
        }
        if (isTauri) {
          invokeHidePopup();
        }
        return;
      }

      if (isInput) {
        if (e.key === 'ArrowDown' && filteredClips.length > 0) {
          e.preventDefault();
          (target as HTMLInputElement).blur();
          setSelectedId(filteredClips[0].id);
        }
        return;
      }

      // 1-9 direct paste keys
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        const targetIndex = num - 1;
        if (targetIndex >= 0 && targetIndex < filteredClips.length) {
          e.preventDefault();
          const targetClip = filteredClips[targetIndex];
          setSelectedId(targetClip.id);
          handlePasteItem(targetClip);
        }
        return;
      }

      // Up/Down arrows
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredClips.length === 0) return;
        const currentIndex = filteredClips.findIndex((c) => c.id === selectedId);
        let nextIndex = 0;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex < filteredClips.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : filteredClips.length - 1;
        }
        setSelectedId(filteredClips[nextIndex].id);
        return;
      }

      // Enter to paste
      if (e.key === 'Enter' && selectedClip) {
        e.preventDefault();
        handlePasteItem(selectedClip);
        return;
      }

      // P to toggle pin
      if ((e.key === 'p' || e.key === 'P') && selectedClip) {
        e.preventDefault();
        handleTogglePin(selectedClip.id);
        return;
      }

      // Delete or Backspace to delete
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClip) {
        e.preventDefault();
        handleDeleteClip(selectedClip.id);
        return;
      }

      // '/' to focus search
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredClips, selectedClip, selectedId, searchQuery, handlePasteItem, handleTogglePin, handleDeleteClip, isTauri]);

  const permanentCount = useMemo(() => clips.filter((c) => c.isPinned).length, [clips]);
  const temporaryCount = useMemo(() => clips.filter((c) => !c.isPinned).length, [clips]);

  return (
    <div className="w-screen h-screen bg-transparent relative overflow-hidden font-sans select-none antialiased">
      {/* 
        Windows Native Style Floating Utility Window
        - Headbar: Low opacity (~28%), subtle, airy, and sleek
        - Body: Higher opacity background (~90%) for crisp contrast, readability, and beautiful UI hierarchy
        - No full blur or opacity filter over the container
        - Topbar dragging enabled (move window anywhere)
        - Native OS clipboard integration with automatic detection and paste
      */}
      <div
        id="floating-clipboard-overlay"
        style={
          isTauri
            ? {
                position: 'fixed',
                inset: '2px',
                width: 'calc(100% - 4px)',
                height: 'calc(100% - 4px)',
              }
            : {
                position: 'absolute',
                left: `${windowPos.x}px`,
                top: `${windowPos.y}px`,
                width: '300px',
                height: '370px',
              }
        }
        className={`floating-window-frame rounded-xl border border-white/15 shadow-2xl shadow-black/90 flex flex-col overflow-hidden text-zinc-100 transition-shadow ${
          isDragging ? 'shadow-blue-500/30 ring-1 ring-blue-400/50' : ''
        }`}
      >
        {/* Top subtle highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none z-10" />

        {/* Topbar: Drag Area to Move Window (Low opacity: ~28%) */}
        <header
          data-tauri-drag-region
          onMouseDown={handleMouseDownTopbar}
          title="Click and drag to move window"
          className={`h-8 px-2.5 border-b border-white/10 flex items-center justify-between shrink-0 headbar-surface transition-colors z-10 ${
            isDragging ? 'cursor-grabbing bg-white/15' : 'cursor-grab hover:bg-white/[0.05]'
          }`}
        >
          {/* Left: Clean Minimal Title */}
          <div className="flex items-center pointer-events-none">
            <span className="font-semibold text-xs text-zinc-200 tracking-wide select-none">
              Clipboard
            </span>
          </div>

          {/* Right: Modern Always on Top Toggle & Close Window Button */}
          <div className="flex items-center gap-1">
            <button
              id="btn-toggle-always-on-top"
              type="button"
              onClick={handleToggleAlwaysOnTop}
              title={
                isAlwaysOnTop
                  ? 'Always on top: Active (Click to disable)'
                  : 'Always on top: Inactive (Click to enable)'
              }
              className={`p-1 rounded transition-all cursor-pointer flex items-center justify-center ${
                isAlwaysOnTop
                  ? 'text-blue-400 bg-blue-500/20 border border-blue-400/40 shadow-xs shadow-blue-500/10'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/10 border border-transparent'
              }`}
            >
              <Pin
                className={`w-3 h-3 transition-transform ${
                  isAlwaysOnTop ? 'fill-blue-400 text-blue-400 rotate-45' : 'text-zinc-400'
                }`}
              />
            </button>

            <button
              id="btn-close-window"
              type="button"
              onClick={() => {
                if (isTauri) invokeHidePopup();
              }}
              title="Hide window (Esc)"
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-red-500/30 transition-all cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </header>

        {/* Body Section: Higher opacity background (~90%) than headbar (~28%) for beautiful UI contrast */}
        <div className="flex-1 flex flex-col min-h-0 body-surface">
          {/* Search Input */}
          <div className="p-1.5 border-b border-white/10 bg-black/15">
            <div className="relative flex items-center">
              <Search className="w-3 h-3 absolute left-2 text-zinc-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                id="clipboard-search-input"
                type="text"
                placeholder="Search clipboard... (/)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-6 pr-6 py-1 bg-black/30 text-xs text-white placeholder-zinc-400 rounded-md border border-white/15 focus:outline-hidden focus:border-blue-400 focus:ring-1 focus:ring-blue-400/40 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 p-0.5 text-zinc-400 hover:text-white rounded cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs & Clear Temporary Button */}
          <div className="px-2 py-1 border-b border-white/10 flex items-center justify-between bg-black/10 text-[10px]">
          <div className="flex items-center gap-1">
            <button
              id="tab-filter-all"
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-1.5 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white/15 text-white shadow-xs border border-white/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({clips.length})
            </button>

            <button
              id="tab-filter-pinned"
              type="button"
              onClick={() => setActiveFilter('pinned')}
              title="Permanent items kept until you delete them"
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                activeFilter === 'pinned'
                  ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Pin className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              <span>Permanent ({permanentCount})</span>
            </button>

            <button
              id="tab-filter-temporary"
              type="button"
              onClick={() => setActiveFilter('temporary')}
              title="Recent temporary items"
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                activeFilter === 'temporary'
                  ? 'bg-white/15 text-white border border-white/20 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Clock className="w-2.5 h-2.5" />
              <span>Temporary ({temporaryCount})</span>
            </button>
          </div>

          {/* Clear Temporary Items (Permanent Pinned items are NEVER deleted) */}
          {temporaryCount > 0 && (
            <button
              id="btn-clear-temporary"
              type="button"
              onClick={handleClearTemporary}
              title="Clear temporary history (permanent pinned items stay saved)"
              className="text-[9px] text-zinc-300 hover:text-red-200 hover:bg-red-500/25 px-1 py-0.5 rounded transition-all cursor-pointer font-medium border border-transparent hover:border-red-500/30"
            >
              Clear temp
            </button>
          )}
        </div>

        {/* Clipboard Items List: Minimal gap between items */}
        <div
          ref={listContainerRef}
          id="clipboard-items-list"
          className="flex-1 overflow-y-auto p-1.5 space-y-1 focus:outline-hidden"
        >
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-300 font-medium">
              Loading...
            </div>
          ) : filteredClips.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400">
              <ClipboardIcon className="w-6 h-6 mb-1.5 opacity-40 text-blue-400" />
              <p className="text-xs font-semibold text-zinc-200">
                {searchQuery ? 'No matching clips found' : 'Clipboard is empty'}
              </p>
              <p className="text-[10px] text-zinc-400 mt-0.5 max-w-[190px]">
                {searchQuery
                  ? 'Try another search keyword'
                  : 'Any text you copy in any app is automatically detected here.'}
              </p>
            </div>
          ) : (
            filteredClips.map((item) => {
              const isSelected = selectedId === item.id;
              const isCopied = copiedId === item.id;

              return (
                <div
                  key={item.id}
                  data-id={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    handlePasteItem(item);
                  }}
                  className={`group relative px-2 py-1.5 rounded-lg transition-all cursor-pointer border flex items-center justify-between gap-1.5 ${
                    isCopied
                      ? 'bg-emerald-950/85 border-emerald-400 ring-1 ring-emerald-400/60 shadow-md'
                      : isSelected
                      ? 'bg-blue-600/30 border-blue-400/80 ring-1 ring-blue-400/40 shadow-md'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 hover:border-white/20 shadow-xs'
                  }`}
                >
                  {/* Copied Text: Opaque, crisp, highly legible */}
                  <div className="text-xs text-zinc-100 line-clamp-2 leading-snug font-medium break-words whitespace-pre-wrap flex-1 min-w-0 select-text">
                    {item.text}
                  </div>

                  {/* Action Icons: Pin and Delete */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {/* Toggle Pin / Permanent Storage */}
                    <button
                      type="button"
                      onClick={(e) => handleTogglePin(item.id, e)}
                      title={
                        item.isPinned
                          ? 'Pinned (Permanent)'
                          : 'Pin to permanent'
                      }
                      className={`p-0.5 rounded transition-all cursor-pointer ${
                        item.isPinned
                          ? 'text-amber-300 bg-amber-500/25 border border-amber-400/30'
                          : 'text-zinc-500 hover:text-white opacity-40 group-hover:opacity-100 hover:bg-white/10'
                      }`}
                    >
                      <Pin className={`w-3 h-3 ${item.isPinned ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>

                    {/* Remove from Storage */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClip(item.id, e)}
                      title="Delete from storage (Del)"
                      className="p-0.5 rounded text-zinc-500 hover:text-red-300 opacity-40 group-hover:opacity-100 hover:bg-red-500/25 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Feedback overlay when clicked/pasted */}
                  {isCopied && (
                    <div className="absolute inset-0 rounded-lg bg-emerald-950/95 border border-emerald-400 flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-200 animate-in fade-in duration-75 shadow-sm">
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Pasted!</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

          {/* Footer Status Bar */}
          <footer className="h-5 px-2.5 border-t border-white/10 bg-black/20 flex items-center justify-between text-[9px] text-zinc-400 shrink-0 font-medium">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  isAlwaysOnTop ? 'bg-blue-400 shadow-xs shadow-blue-400/50' : 'bg-zinc-600'
                }`}
              />
              <span>{isAlwaysOnTop ? 'Always on Top' : 'Floating Window'}</span>
            </div>

            <div className="flex items-center gap-1 font-mono text-zinc-400 text-[9px]">
              <span>Click to paste</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
