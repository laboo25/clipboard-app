import React, { useEffect } from 'react';
import { Check, Info, AlertCircle, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 2500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className="pointer-events-auto flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-900/95 dark:bg-zinc-100/95 text-white dark:text-zinc-900 shadow-xl border border-zinc-700/50 dark:border-zinc-300/50 text-xs backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200">
      <div className="shrink-0">
        {toast.type === 'warning' ? (
          <AlertCircle className="w-4 h-4 text-amber-400 dark:text-amber-600" />
        ) : toast.type === 'info' ? (
          <Info className="w-4 h-4 text-blue-400 dark:text-blue-600" />
        ) : (
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{toast.title}</div>
        {toast.description && (
          <div className="text-[11px] opacity-80 truncate">{toast.description}</div>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-0.5 opacity-60 hover:opacity-100 rounded cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
