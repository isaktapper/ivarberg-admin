/**
 * Godkännandesida för Torsdagsbrevet. Öppnas från ntfy-notisen på mobilen -
 * ingen inloggning, token i URL:en är behörigheten (middleware släpper igenom
 * /newsletter/approve/*).
 */
import { loadIssueByToken, newsletterServiceClient, refreshIssueStatus, toApprovalView } from '@/lib/newsletter/issues'
import ApprovalClient from './ApprovalClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Godkänn Torsdagsbrevet | iVarberg' }

export default async function ApproveNewsletterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = newsletterServiceClient()
  const row = await loadIssueByToken(supabase, token)

  if (!row) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold text-gray-900">Länken är ogiltig</h1>
          <p className="text-gray-600">Det finns inget nyhetsbrev kopplat till den här länken.</p>
        </div>
      </main>
    )
  }

  const view = await toApprovalView(supabase, await refreshIssueStatus(supabase, row))
  return <ApprovalClient token={token} initial={view} />
}
