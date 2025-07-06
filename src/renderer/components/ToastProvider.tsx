import React, { createContext, useContext, useState, useCallback } from "react";

interface Toast {
  id: number;
  message: string;
  leaving?: boolean;
}

// Context returns a function for pushing a new toast
const ToastContext = createContext<(msg: string) => void>(() => {
  /* no-op default */
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, leaving: false }]);

    // Start exit animation a bit before full removal
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));

      // Remove after animation finishes (300 ms matches CSS)
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 2700); // 2.7 s show + 0.3 s slide-out = 3 s total
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      {/* Toast stack */}
      <div className="fixed top-3 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`bg-green-600 text-white px-4 py-2 rounded shadow-lg pointer-events-auto ${t.leaving ? "toast-slide-out" : "toast-slide-in"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}; 