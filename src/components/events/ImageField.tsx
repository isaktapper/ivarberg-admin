'use client'

import * as React from 'react'
import { ImageIcon, Upload } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/** Bildfält: förhandsvisning, dra-och-släpp/välj fil (laddas upp till Supabase Storage) samt URL. */
export function ImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const toast = useToast()
  const [uploading, setUploading] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [broken, setBroken] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => setBroken(false), [value])

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Bara bildfiler kan laddas upp')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Uppladdning misslyckades')
      onChange(json.url)
      toast.success('Bilden är uppladdad')
    } catch (e) {
      toast.error('Kunde inte ladda upp bilden', e instanceof Error ? e.message : undefined)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div className="flex h-[150px] w-[200px] items-center justify-center overflow-hidden rounded-[10px] bg-amber-light text-amber">
        {value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <ImageIcon className="size-7" strokeWidth={1.5} />
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) upload(f)
          }}
          className={cn('flex flex-col items-center gap-1 rounded-[10px] border border-dashed px-4 py-4 text-center', dragging ? 'border-sea bg-sea-lightest' : 'border-[#C9C0AE] bg-sand-soft')}
        >
          <span className="text-[13px] font-medium text-ink">
            {uploading ? 'Laddar upp…' : 'Släpp en bild här eller '}
            {!uploading ? (
              <button type="button" onClick={() => fileRef.current?.click()} className="text-sea hover:underline">
                välj fil
              </button>
            ) : null}
          </span>
          <span className="text-xs text-ink-muted">Laddas upp till Supabase Storage (event-images). Max 8 MB.</span>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <div className="flex items-center gap-2">
          <Input aria-label="Bild-URL" type="url" value={value} placeholder="https://…" onChange={(e) => onChange(e.target.value)} className="h-9" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] border border-line bg-white px-3 text-[13px] font-medium text-ink hover:bg-sand-soft disabled:opacity-50">
            <Upload className="size-3.5" />
            Ladda upp
          </button>
        </div>
        {broken && value ? <span className="text-xs text-poppy">Bilden kunde inte laddas från den här adressen.</span> : null}
      </div>
    </div>
  )
}
