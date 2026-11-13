/**
 * Torsdagsbrevet – det adminsidan "Nyhetsbrev" får från /api/admin/newsletter.
 * Bara typer, så att både API-rutten och sidan i webbläsaren kan dela dem.
 */
import type { NewsletterIssueStatus } from '@/types/database'
import type { SubscriberCounts } from './issues'

export interface NewsletterIssueSummary {
  id: number
  issueDate: string
  status: NewsletterIssueStatus
  subject: string | null
  picks: string[]
  /** 'ai' eller 'fallback' (de högst rankade utan AI-text) */
  source: string | null
  approvalToken: string | null
  approvedAt: string | null
  scheduledFor: string | null
  sentAt: string | null
  recipientCount: number | null
  error: string | null
  createdAt: string
}

export interface NewsletterAdminData {
  issues: NewsletterIssueSummary[]
  subscribers: SubscriberCounts | null
  /** Torsdagen för nästa brev och helgen det handlar om */
  upcomingIssueDate: string
  weekendStart: string
  weekendEnd: string
  /** När nästa brev går ut om det godkänns i tid (ISO) */
  sendAt: string
  enabled: boolean
  /** Det som saknas för ett riktigt utskick */
  missingConfig: string[]
  canSendTest: boolean
  /** Satt när tabellerna inte gick att läsa, t.ex. om migrationen inte är körd */
  setupError: string | null
}
