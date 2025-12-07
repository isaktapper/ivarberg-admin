import { EmailService } from '../src/lib/services/email-service';
import { createClient } from '@supabase/supabase-js';

/**
 * Test-script för att skicka ett test-email lokalt
 * Kör: npx tsx --env-file=.env.local scripts/test-email.ts
 */

async function main() {
  console.log('📧 Testing email notification system...\n');

  // Validera environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY - Lägg till i .env.local');
  }

  console.log('✅ Environment variables loaded');

  // Skapa Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Hämta senaste scraper logs för att bygga en riktig rapport
  console.log('📊 Fetching recent scraper logs...');
  
  const { data: logs, error: logsError } = await supabase
    .from('scraper_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(10);

  if (logsError) {
    console.error('Error fetching logs:', logsError);
    // Fortsätt med mock-data istället
  }

  // Bygg rapport-data
  let reportData;
  
  if (logs && logs.length > 0) {
    console.log(`✅ Found ${logs.length} recent scraper logs`);
    
    // Räkna ut sammanfattning
    const successCount = logs.filter(l => l.status === 'success').length;
    const failedCount = logs.filter(l => l.status === 'failed').length;
    const totalEventsFound = logs.reduce((sum, l) => sum + (l.events_found || 0), 0);
    const totalEventsImported = logs.reduce((sum, l) => sum + (l.events_imported || 0), 0);
    const totalDuplicates = logs.reduce((sum, l) => sum + (l.duplicates_skipped || 0), 0);
    const avgDuration = logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / logs.length;

    reportData = {
      totalScrapers: logs.length,
      successfulScrapers: successCount,
      failedScrapers: failedCount,
      totalEventsFound: totalEventsFound,
      totalEventsImported: totalEventsImported,
      totalDuplicates: totalDuplicates,
      duration: avgDuration,
      scraperDetails: logs.map(log => ({
        name: log.scraper_name,
        status: log.status,
        eventsFound: log.events_found || 0,
        eventsImported: log.events_imported || 0,
        errors: log.errors || []
      })),
      runDate: new Date().toLocaleString('sv-SE', { 
        dateStyle: 'full', 
        timeStyle: 'short' 
      }),
      runUrl: 'https://github.com/isaktapper/ivarberg-admin/actions'
    };
  } else {
    console.log('⚠️  No logs found, using mock data for testing');
    
    // Mock-data för test
    reportData = {
      totalScrapers: 8,
      successfulScrapers: 7,
      failedScrapers: 1,
      totalEventsFound: 52,
      totalEventsImported: 45,
      totalDuplicates: 7,
      duration: 12340,
      scraperDetails: [
        {
          name: 'Arena Varberg',
          status: 'success',
          eventsFound: 15,
          eventsImported: 12,
          errors: []
        },
        {
          name: 'Varbergs Teater',
          status: 'success',
          eventsFound: 18,
          eventsImported: 15,
          errors: []
        },
        {
          name: 'Visit Varberg',
          status: 'success',
          eventsFound: 12,
          eventsImported: 10,
          errors: []
        },
        {
          name: 'Societetshuset',
          status: 'failed',
          eventsFound: 7,
          eventsImported: 8,
          errors: ['Connection timeout after 30s']
        }
      ],
      runDate: new Date().toLocaleString('sv-SE', { 
        dateStyle: 'full', 
        timeStyle: 'short' 
      }),
      runUrl: 'https://github.com/isaktapper/ivarberg-admin/actions'
    };
  }

  // Kontrollera mottagare
  console.log('👥 Checking for recipients...');
  const { data: recipients, error: recipientsError } = await supabase
    .from('email_recipients')
    .select('email, enabled')
    .eq('enabled', true);

  if (recipientsError) {
    console.error('❌ Error fetching recipients:', recipientsError);
    throw recipientsError;
  }

  if (!recipients || recipients.length === 0) {
    console.log('\n⚠️  No active recipients found!');
    console.log('   Add recipients in admin UI: /admin/settings/notifications');
    console.log('   Or run this SQL:');
    console.log('   INSERT INTO email_recipients (email, enabled) VALUES (\'your@email.com\', true);\n');
    return;
  }

  console.log(`✅ Found ${recipients.length} active recipient(s):`);
  recipients.forEach(r => console.log(`   - ${r.email}`));

  // Skicka email
  console.log('\n📧 Sending test email...');
  const emailService = new EmailService();
  
  try {
    const result = await emailService.sendDailyReport(reportData);
    console.log('\n✅ Email sent successfully!');
    console.log('   Result:', result);
    console.log('\n💡 Check your inbox (and spam folder) for the email');
  } catch (error) {
    console.error('\n❌ Error sending email:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  }
}

main().catch((error) => {
  console.error('\n💥 Fatal error:');
  console.error(error);
  process.exit(1);
});





