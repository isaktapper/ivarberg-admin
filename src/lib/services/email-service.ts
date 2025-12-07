import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

interface DailyReportData {
  totalScrapers: number;
  successfulScrapers: number;
  failedScrapers: number;
  totalEventsFound: number;
  totalEventsImported: number;
  totalDuplicates: number;
  duration: number;
  scraperDetails: Array<{
    name: string;
    status: string;
    eventsFound: number;
    eventsImported: number;
    errors?: string[];
  }>;
  runDate: string;
  runUrl?: string;
}

export class EmailService {
  private supabase;

  constructor() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Hämta alla aktiva mail-mottagare
   */
  async getActiveRecipients(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('email_recipients')
      .select('email')
      .eq('enabled', true)
      .contains('notification_types', ['daily_report']);

    if (error) {
      console.error('Error fetching recipients:', error);
      return [];
    }

    return data.map(r => r.email);
  }

  /**
   * Generera HTML för daglig rapport
   */
  private generateDailyReportHTML(data: DailyReportData): string {
    const statusEmoji = data.failedScrapers === 0 ? '✅' : 
                       data.successfulScrapers === 0 ? '❌' : '⚠️';
    
    const statusColor = data.failedScrapers === 0 ? '#22c55e' : 
                       data.successfulScrapers === 0 ? '#ef4444' : '#f59e0b';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: ${statusColor}; color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 24px; }
    .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat { background: #f8f9fa; padding: 16px; border-radius: 6px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: bold; color: #1a1a1a; margin: 0; }
    .stat-label { font-size: 14px; color: #666; margin: 4px 0 0 0; }
    .scrapers { margin-top: 24px; }
    .scraper { background: #f8f9fa; padding: 16px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid #ddd; }
    .scraper.success { border-left-color: #22c55e; }
    .scraper.failed { border-left-color: #ef4444; }
    .scraper.partial { border-left-color: #f59e0b; }
    .scraper-name { font-weight: 600; margin-bottom: 8px; }
    .scraper-stats { font-size: 14px; color: #666; }
    .error { background: #fee; color: #c00; padding: 8px 12px; border-radius: 4px; font-size: 13px; margin-top: 8px; }
    .footer { background: #f8f9fa; padding: 16px 24px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e5e5e5; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${statusEmoji} Daglig Scraper-rapport</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">${data.runDate}</p>
    </div>
    
    <div class="content">
      <div class="summary">
        <div class="stat">
          <p class="stat-value">${data.successfulScrapers}/${data.totalScrapers}</p>
          <p class="stat-label">Lyckade</p>
        </div>
        <div class="stat">
          <p class="stat-value">${data.totalEventsImported}</p>
          <p class="stat-label">Nya Events</p>
        </div>
        <div class="stat">
          <p class="stat-value">${data.totalEventsFound}</p>
          <p class="stat-label">Hittade</p>
        </div>
        <div class="stat">
          <p class="stat-value">${(data.duration / 1000).toFixed(1)}s</p>
          <p class="stat-label">Total tid</p>
        </div>
      </div>

      <div class="scrapers">
        <h3 style="margin: 0 0 16px 0;">Scraper-detaljer</h3>
        ${data.scraperDetails.map(scraper => `
          <div class="scraper ${scraper.status}">
            <div class="scraper-name">${scraper.name}</div>
            <div class="scraper-stats">
              Hittade: ${scraper.eventsFound} | 
              Importerade: ${scraper.eventsImported} | 
              Status: ${scraper.status === 'success' ? '✅ Lyckad' : scraper.status === 'failed' ? '❌ Misslyckad' : '⚠️ Delvis'}
            </div>
            ${scraper.errors && scraper.errors.length > 0 ? `
              <div class="error">
                <strong>Fel:</strong> ${scraper.errors[0]}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>

      ${data.runUrl ? `
        <div style="text-align: center;">
          <a href="${data.runUrl}" class="button">Se fullständiga loggar →</a>
        </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>iVarberg Admin · Automatisk rapport från daglig scraping</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Skicka daglig rapport
   */
  async sendDailyReport(data: DailyReportData) {
    if (!process.env.RESEND_API_KEY) {
      console.log('⚠️  RESEND_API_KEY not set, skipping email report');
      return;
    }

    const recipients = await this.getActiveRecipients();
    
    if (recipients.length === 0) {
      console.log('⚠️  No active recipients for daily report');
      return;
    }

    const subject = data.failedScrapers === 0 
      ? `✅ Scraper-rapport: ${data.totalEventsImported} nya events`
      : `⚠️ Scraper-rapport: ${data.failedScrapers} misslyckade`;

    try {
      const result = await resend.emails.send({
        from: 'iVarberg Admin <onboarding@resend.dev>', // Byt till din verifierade domän
        to: recipients,
        subject: subject,
        html: this.generateDailyReportHTML(data),
      });

      console.log(`✅ Daily report sent to ${recipients.length} recipient(s)`);
      console.log(`   Recipients: ${recipients.join(', ')}`);
      return result;
    } catch (error) {
      console.error('❌ Error sending daily report:', error);
      throw error;
    }
  }
}





