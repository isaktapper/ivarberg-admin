/**
 * Alert Service - Skickar varningar via SMS och/eller Email
 * 
 * Kräver följande env-variabler:
 * - TWILIO_ACCOUNT_SID (för SMS)
 * - TWILIO_AUTH_TOKEN (för SMS)
 * - TWILIO_PHONE_NUMBER (för SMS)
 * - ALERT_PHONE_NUMBER (dit SMS ska skickas)
 * - RESEND_API_KEY (för email, du har redan detta)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory = 
  | 'openai'      // OpenAI API-problem (rate limit, credits)
  | 'scraper'     // Scraper-fel
  | 'database'    // Databasproblem
  | 'api'         // Andra API-fel
  | 'system'      // Systemfel
  | 'payment';    // Betalningsproblem

interface AlertConfig {
  sendSms?: boolean;      // Skicka SMS för denna alert
  sendEmail?: boolean;    // Skicka email för denna alert
  logToDb?: boolean;      // Logga till databas (default: true)
}

interface AlertData {
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  details?: Record<string, any>;
  source?: string;
}

// Vilka alerts som ska trigga SMS
const SMS_TRIGGERS: Record<AlertCategory, AlertSeverity[]> = {
  openai: ['critical'],           // SMS bara vid kritiska OpenAI-fel (credits slut)
  scraper: ['critical'],          // SMS vid kritiska scraper-fel
  database: ['critical'],         // SMS vid databasproblem
  api: ['critical'],              // SMS vid kritiska API-fel
  system: ['critical'],           // SMS vid systemfel
  payment: ['warning', 'critical'] // SMS vid alla betalningsproblem
};

export class AlertService {
  private supabase: SupabaseClient | null = null;

  /**
   * Lazy initialization av Supabase-klienten
   */
  private getSupabase(): SupabaseClient | null {
    if (this.supabase) return this.supabase;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ AlertService: Supabase credentials saknas, alerts loggas bara till console');
      return null;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    return this.supabase;
  }

  /**
   * Skicka en varning
   */
  async alert(data: AlertData, config: AlertConfig = {}): Promise<void> {
    const { 
      sendSms = this.shouldSendSms(data.category, data.severity),
      sendEmail = data.severity === 'critical',
      logToDb = true 
    } = config;

    // Logga alltid till console
    this.logToConsole(data);

    // Logga till databas
    let alertId: number | null = null;
    if (logToDb) {
      alertId = await this.logToDatabase(data);
    }

    // Skicka SMS om konfigurerat
    if (sendSms) {
      await this.sendSms(data, alertId);
    }

    // Skicka email om konfigurerat
    if (sendEmail) {
      await this.sendEmail(data, alertId);
    }
  }

  /**
   * Snabbmetoder för vanliga alerts
   */
  async openaiCreditsLow(): Promise<void> {
    await this.alert({
      severity: 'warning',
      category: 'openai',
      title: '⚠️ OpenAI credits låga',
      message: 'OpenAI-kontot har lite credits kvar. Fyll på snart för att undvika avbrott.',
      source: 'alert-service'
    });
  }

  async openaiCreditsExhausted(error?: Error): Promise<void> {
    await this.alert({
      severity: 'critical',
      category: 'openai',
      title: '🚨 OpenAI credits slut!',
      message: 'OpenAI-kontot har slut på credits. Kategorisering och andra AI-funktioner fungerar inte.',
      details: error ? { error: error.message, stack: error.stack } : undefined,
      source: 'alert-service'
    });
  }

  async scraperFailed(scraperName: string, error: Error): Promise<void> {
    await this.alert({
      severity: 'warning',
      category: 'scraper',
      title: `Scraper misslyckades: ${scraperName}`,
      message: `Scrapern "${scraperName}" kunde inte köras. Kontrollera loggen för detaljer.`,
      details: { scraperName, error: error.message, stack: error.stack },
      source: 'run-scrapers'
    });
  }

  async allScrapersFailed(errors: Array<{ name: string; error: string }>): Promise<void> {
    await this.alert({
      severity: 'critical',
      category: 'scraper',
      title: '🚨 Alla scrapers misslyckades!',
      message: `Ingen av scraperna kunde köras. Det kan vara ett nätverksproblem eller konfigurationsfel.`,
      details: { errors },
      source: 'run-scrapers'
    });
  }

  async apiRateLimited(apiName: string, retryAfter?: number): Promise<void> {
    await this.alert({
      severity: 'warning',
      category: 'api',
      title: `API Rate Limited: ${apiName}`,
      message: `API:et "${apiName}" har nått sin gräns. ${retryAfter ? `Försök igen om ${retryAfter}s` : ''}`,
      details: { apiName, retryAfter },
      source: 'api-call'
    });
  }

  /**
   * Kontrollera om SMS ska skickas för denna alert
   */
  private shouldSendSms(category: AlertCategory, severity: AlertSeverity): boolean {
    const triggers = SMS_TRIGGERS[category];
    return triggers?.includes(severity) ?? false;
  }

  /**
   * Logga till console med färgkodning
   */
  private logToConsole(data: AlertData): void {
    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨'
    }[data.severity];

    const color = {
      info: '\x1b[36m',    // Cyan
      warning: '\x1b[33m', // Yellow
      critical: '\x1b[31m' // Red
    }[data.severity];

    const reset = '\x1b[0m';

    console.log(`${color}${emoji} [${data.severity.toUpperCase()}] ${data.title}${reset}`);
    console.log(`   ${data.message}`);
    if (data.details) {
      console.log(`   Details:`, JSON.stringify(data.details, null, 2).substring(0, 200));
    }
  }

  /**
   * Logga till databas
   */
  private async logToDatabase(data: AlertData): Promise<number | null> {
    const supabase = this.getSupabase();
    if (!supabase) {
      console.log('   (Databas-loggning hoppas över - credentials saknas)');
      return null;
    }

    try {
      const { data: result, error } = await supabase
        .from('system_alerts')
        .insert({
          severity: data.severity,
          category: data.category,
          title: data.title,
          message: data.message,
          details: data.details || {},
          source: data.source
        })
        .select('id')
        .single();

      if (error) {
        console.error('❌ Kunde inte logga alert till databas:', error.message);
        return null;
      }

      return result?.id || null;
    } catch (error) {
      console.error('❌ Fel vid loggning till databas:', error);
      return null;
    }
  }

  /**
   * Skicka SMS via Twilio
   */
  private async sendSms(data: AlertData, alertId: number | null): Promise<void> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const toNumber = process.env.ALERT_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber || !toNumber) {
      console.log('📱 SMS ej konfigurerat (TWILIO_* env vars saknas)');
      return;
    }

    try {
      const message = `${data.title}\n\n${data.message}`;
      
      // Twilio API call
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            To: toNumber,
            From: fromNumber,
            Body: message.substring(0, 1600) // SMS max längd
          })
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Kunde inte skicka SMS:', error);
        return;
      }

      console.log('📱 SMS skickat!');

      // Uppdatera alert i databas
      if (alertId) {
        const supabase = this.getSupabase();
        if (supabase) {
          await supabase
            .from('system_alerts')
            .update({ sms_sent: true, sms_sent_at: new Date().toISOString() })
            .eq('id', alertId);
        }
      }

    } catch (error) {
      console.error('❌ Fel vid SMS-skickning:', error);
    }
  }

  /**
   * Skicka Email via Resend
   */
  private async sendEmail(data: AlertData, alertId: number | null): Promise<void> {
    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL || process.env.ALERT_EMAIL;

    if (!resendApiKey) {
      console.log('📧 Email ej konfigurerat (RESEND_API_KEY saknas)');
      return;
    }

    if (!adminEmail) {
      console.log('📧 Email ej konfigurerat (ADMIN_EMAIL/ALERT_EMAIL saknas)');
      return;
    }

    try {
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: ${data.severity === 'critical' ? '#fee2e2' : data.severity === 'warning' ? '#fef3c7' : '#dbeafe'}; padding: 20px; border-radius: 8px;">
            <h2 style="margin: 0 0 10px 0; color: ${data.severity === 'critical' ? '#dc2626' : data.severity === 'warning' ? '#d97706' : '#2563eb'};">
              ${data.title}
            </h2>
            <p style="margin: 0; color: #374151;">
              ${data.message}
            </p>
          </div>
          
          ${data.details ? `
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 15px;">
              <h4 style="margin: 0 0 10px 0; color: #6b7280;">Detaljer</h4>
              <pre style="margin: 0; font-size: 12px; overflow-x: auto; white-space: pre-wrap;">${JSON.stringify(data.details, null, 2)}</pre>
            </div>
          ` : ''}
          
          <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
            Kategori: ${data.category} | Källa: ${data.source || 'okänd'} | Tid: ${new Date().toLocaleString('sv-SE')}
          </p>
        </div>
      `;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Ivarberg Alerts <onboarding@resend.dev>',
          to: [adminEmail],
          subject: `[${data.severity.toUpperCase()}] ${data.title}`,
          html
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Kunde inte skicka email:', error);
        return;
      }

      console.log('📧 Email skickat!');

      // Uppdatera alert i databas
      if (alertId) {
        const supabase = this.getSupabase();
        if (supabase) {
          await supabase
            .from('system_alerts')
            .update({ email_sent: true, email_sent_at: new Date().toISOString() })
            .eq('id', alertId);
        }
      }

    } catch (error) {
      console.error('❌ Fel vid email-skickning:', error);
    }
  }
}

// Singleton export
export const alertService = new AlertService();
