'use client'

import * as React from 'react'
import { Dialog, DialogContent } from './dialog'
import { Button } from './button'
import { Input } from './input'

interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Kräv att användaren skriver detta ord (t.ex. "ta bort") */
  typeToConfirm?: string
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = React.useState('')

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    setTyped('')
    return new Promise<boolean>((resolve) => setState({ ...opts, resolve }))
  }, [])

  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }

  const needsTyping = !!state?.typeToConfirm
  const typedOk = !needsTyping || typed.trim().toLowerCase() === state!.typeToConfirm!.toLowerCase()

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => !o && close(false)}>
        {state ? (
          <DialogContent
            size="sm"
            title={state.title}
            description={state.description}
            footer={
              <>
                <Button variant="ghost" onClick={() => close(false)}>
                  {state.cancelLabel ?? 'Avbryt'}
                </Button>
                <Button variant={state.destructive ? 'destructive' : 'default'} disabled={!typedOk} onClick={() => close(true)} autoFocus={!needsTyping}>
                  {state.confirmLabel ?? 'Bekräfta'}
                </Button>
              </>
            }
          >
            {needsTyping ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] text-ink-soft">
                  Skriv <span className="font-mono font-medium text-ink">{state.typeToConfirm}</span> för att bekräfta.
                </span>
                <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && typedOk && close(true)} />
              </div>
            ) : (
              <span className="sr-only">Bekräfta åtgärden</span>
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  )
}

/** const confirm = useConfirm(); if (await confirm({ title: 'Ta bort?', destructive: true })) … */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm måste användas inom <ConfirmProvider>')
  return ctx
}
