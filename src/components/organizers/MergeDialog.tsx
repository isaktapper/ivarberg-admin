'use client'

import { useState } from 'react'
import { Organizer } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import OrganizerSearchableDropdown from '@/components/OrganizerSearchableDropdown'

/**
 * Slår ihop `source` in i en målarrangör: flyttar event, hanterar
 * arrangörssidan (UNIQUE per arrangör) och tar bort källan.
 * Samma steg som tidigare – ej transaktionellt.
 */
export async function mergeOrganizers(source: Organizer, targetId: number): Promise<string> {
  const { count: eventCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('organizer_id', source.id)

  const { error: updateError } = await supabase.from('events').update({ organizer_id: targetId }).eq('organizer_id', source.id)
  if (updateError) throw updateError

  const { data: sourcePage } = await supabase.from('organizer_pages').select('*').eq('organizer_id', source.id).maybeSingle()
  const { data: targetPage } = await supabase.from('organizer_pages').select('*').eq('organizer_id', targetId).maybeSingle()

  if (sourcePage) {
    if (targetPage) {
      const { error } = await supabase.from('organizer_pages').delete().eq('id', sourcePage.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('organizer_pages').update({ organizer_id: targetId }).eq('id', sourcePage.id)
      if (error) throw error
    }
  }

  const { error: deleteError } = await supabase.from('organizers').delete().eq('id', source.id)
  if (deleteError) throw deleteError

  const pageInfo = sourcePage ? (targetPage ? ' Källans arrangörssida togs bort (målet hade redan en).' : ' Arrangörssidan flyttades.') : ''
  return `${eventCount ?? 0} event flyttades.${pageInfo}`
}

export function MergeDialog({
  source,
  organizers,
  presetTargetId,
  onClose,
  onMerged,
}: {
  source: Organizer | null
  organizers: Organizer[]
  presetTargetId?: number | null
  onClose: () => void
  onMerged: (sourceId: number) => void
}) {
  const toast = useToast()
  const [targetId, setTargetId] = useState<number | null>(presetTargetId ?? null)
  const [merging, setMerging] = useState(false)

  const target = organizers.find((o) => o.id === targetId)

  const run = async () => {
    if (!source || !targetId) return
    setMerging(true)
    try {
      const info = await mergeOrganizers(source, targetId)
      toast.success(`”${source.name}” slogs ihop med ”${target?.name}”`, info)
      onMerged(source.id)
      onClose()
    } catch (error) {
      toast.error('Kunde inte slå ihop', error instanceof Error ? error.message : 'Okänt fel')
    } finally {
      setMerging(false)
    }
  }

  return (
    <Dialog open={!!source} onOpenChange={(o) => !o && onClose()}>
      {source ? (
        <DialogContent
          title={`Slå ihop ”${source.name}”`}
          description="Alla event flyttas till målarrangören och den här arrangören tas bort. Går inte att ångra."
          footer={
            <>
              <Button variant="ghost" onClick={onClose}>
                Avbryt
              </Button>
              <Button variant="destructive" disabled={!targetId} loading={merging} onClick={run}>
                Slå ihop och ta bort ”{source.name}”
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <label className="text-[13px] font-medium text-ink">Behåll och flytta till</label>
            <OrganizerSearchableDropdown organizers={organizers} value={targetId} onChange={setTargetId} excludeIds={[source.id]} showStatus placeholder="Välj målarrangör…" />
            {target ? (
              <Banner tone="wait">
                Event från <strong>{source.name}</strong> hamnar under <strong>{target.name}</strong>. Om båda har arrangörssidor tas källans sida bort.
              </Banner>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
