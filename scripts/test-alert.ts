/**
 * Test-script för Alert Service
 * 
 * Kör: npx tsx scripts/test-alert.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { alertService } from '../src/lib/services/alert-service';

async function main() {
  console.log('🔔 Testar Alert Service\n');
  console.log('='.repeat(50));

  // Kolla konfiguration
  console.log('\n📋 Konfiguration:');
  console.log(`   Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅' : '❌'}`);
  console.log(`   Supabase Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌'}`);
  console.log(`   Twilio SID: ${process.env.TWILIO_ACCOUNT_SID ? '✅' : '❌ (SMS ej aktiverat)'}`);
  console.log(`   Twilio Token: ${process.env.TWILIO_AUTH_TOKEN ? '✅' : '❌'}`);
  console.log(`   Twilio From: ${process.env.TWILIO_PHONE_NUMBER || '❌'}`);
  console.log(`   Alert Phone: ${process.env.ALERT_PHONE_NUMBER || '❌'}`);
  console.log(`   Resend API: ${process.env.RESEND_API_KEY ? '✅' : '❌ (Email ej aktiverat)'}`);
  console.log(`   Alert Email: ${process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL || '❌'}`);

  // Test 1: Info alert (bara databas)
  console.log('\n📝 Test 1: Info alert (loggas till databas)...');
  await alertService.alert({
    severity: 'info',
    category: 'system',
    title: 'Test Alert - Info',
    message: 'Detta är ett test av alert-systemet (info-nivå).',
    source: 'test-alert.ts'
  });
  console.log('   ✅ Info alert skickad');

  // Test 2: Warning alert
  console.log('\n⚠️  Test 2: Warning alert...');
  await alertService.alert({
    severity: 'warning',
    category: 'system',
    title: 'Test Alert - Warning',
    message: 'Detta är ett test av alert-systemet (warning-nivå).',
    details: { test: true, timestamp: new Date().toISOString() },
    source: 'test-alert.ts'
  });
  console.log('   ✅ Warning alert skickad');

  // Test 3: Critical alert (triggar SMS + Email om konfigurerat)
  const sendSms = process.env.TWILIO_ACCOUNT_SID && process.env.ALERT_PHONE_NUMBER;
  const sendEmail = process.env.RESEND_API_KEY && (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL);

  console.log(`\n🚨 Test 3: Critical alert...`);
  console.log(`   SMS kommer skickas: ${sendSms ? 'JA' : 'NEJ (ej konfigurerat)'}`);
  console.log(`   Email kommer skickas: ${sendEmail ? 'JA' : 'NEJ (ej konfigurerat)'}`);
  
  if (!sendSms && !sendEmail) {
    console.log('\n   ⏭️  Hoppar över kritisk alert (ingen notifikationskanal konfigurerad)');
    console.log('   💡 Lägg till TWILIO_* eller ALERT_EMAIL i .env.local för att testa');
  } else {
    const confirm = await askConfirmation('\n   Vill du skicka en kritisk test-alert? (y/n): ');
    
    if (confirm) {
      await alertService.alert({
        severity: 'critical',
        category: 'system',
        title: '🚨 Test Alert - Critical',
        message: 'Detta är ett TEST av alert-systemet. Ingen åtgärd krävs.',
        details: { 
          test: true, 
          timestamp: new Date().toISOString(),
          note: 'Ignorera detta meddelande - det är bara ett test.'
        },
        source: 'test-alert.ts'
      });
      console.log('   ✅ Critical alert skickad!');
    } else {
      console.log('   ⏭️  Hoppade över kritisk alert');
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Test klart!');
  console.log('\n💡 Se varningar på: /admin/alerts');
  console.log('='.repeat(50) + '\n');
}

function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

main().catch((error) => {
  console.error('\n❌ Fel:', error);
  process.exit(1);
});
