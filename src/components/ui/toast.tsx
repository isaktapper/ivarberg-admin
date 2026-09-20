'use client'

import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

interface ToastApi {
  toast: (t: Omit<ToastItem, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

const icons: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="size-4 text-kelp" />,
  error: <AlertTriangle className="size-4 text-poppy" />,
  info: <Info className="size-4 text-sea" />,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])
  const counter = React.useRef(0)

  const api = React.useMemo<ToastApi>(() => {
    const push = (t: Omit<ToastItem, 'id'>) => setItems((prev) => [...prev.slice(-3), { ...t, id: ++counter.current }])
    return {
      toast: push,
      success: (title, description) => push({ kind: 'success', title, description }),
      error: (title, description) => push({ kind: 'error', title, description }),
      info: (title, description) => push({ kind: 'info', title, description }),
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4500}>
        {children}
        {items.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={(open) => !open && setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className={cn(
              'animate-toast-in flex w-[360px] items-start gap-3 rounded-[10px] border bg-white p-3.5 shadow-[var(--shadow-pop)]',
              t.kind === 'error' ? 'border-poppy-line' : 'border-line'
            )}
          >
            <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ToastPrimitive.Title className="text-[13px] font-semibold text-ink">{t.title}</ToastPrimitive.Title>
              {t.description ? <ToastPrimitive.Description className="text-xs leading-relaxed text-ink-soft">{t.description}</ToastPrimitive.Description> : null}
              {t.action ? (
                <ToastPrimitive.Action altText={t.action.label} asChild>
                  <button type="button" onClick={t.action.onClick} className="mt-1 w-fit text-xs font-semibold text-sea hover:text-sea-dark">
                    {t.action.label}
                  </button>
                </ToastPrimitive.Action>
              ) : null}
            </div>
            <ToastPrimitive.Close aria-label="Stäng" className="-mr-1 -mt-1 rounded p-1 text-ink-faint hover:bg-stone hover:text-ink">
              <X className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast måste användas inom <ToastProvider>')
  return ctx
}
