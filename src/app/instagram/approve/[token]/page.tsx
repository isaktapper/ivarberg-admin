/**
 * Godkännandesida för dagens Instagram-post. Öppnas från ntfy-notisen på
 * mobilen - ingen inloggning, token i URL:en är behörigheten (middleware
 * släpper igenom /instagram/approve/*).
 */
import { approvalServiceClient, loadPostByToken, toApprovalView } from '@/lib/services/instagram-approval'
import ApprovalClient from './ApprovalClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Godkänn Instagram-post | iVarberg' }

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await loadPostByToken(approvalServiceClient(), token)

  if (!row) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold text-gray-900">Länken är ogiltig</h1>
          <p className="text-gray-600">Det finns inget Instagram-förslag kopplat till den här länken.</p>
        </div>
      </main>
    )
  }

  return <ApprovalClient token={token} initial={toApprovalView(row)} />
}
