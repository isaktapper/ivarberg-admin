/**
 * Snabbtest för OpenAI API-nyckel
 * 
 * Kör: npx tsx scripts/test-openai.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import OpenAI from 'openai';

async function main() {
  console.log('🔑 Testar OpenAI API-nyckel...\n');

  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY saknas i .env.local');
    process.exit(1);
  }

  console.log(`API Key: ${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log(`Längd: ${apiKey.length} tecken\n`);

  const openai = new OpenAI({ apiKey });

  try {
    console.log('📡 Skickar test-request till gpt-4o-mini...');
    
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "Svara bara med ordet 'OK' om du kan läsa detta."
        }
      ],
      max_tokens: 10
    });

    const duration = Date.now() - startTime;
    
    console.log(`\n✅ API fungerar!`);
    console.log(`   Svar: "${response.choices[0].message.content}"`);
    console.log(`   Tid: ${duration}ms`);
    console.log(`   Model: ${response.model}`);
    console.log(`   Tokens: ${response.usage?.total_tokens || 'N/A'}`);

  } catch (error: any) {
    console.error('\n❌ API-fel:');
    console.error(`   Status: ${error.status}`);
    console.error(`   Meddelande: ${error.message}`);
    
    if (error.status === 429) {
      console.error('\n💡 RATE LIMIT - Möjliga orsaker:');
      console.error('   1. Du har nått din kvot - kolla https://platform.openai.com/usage');
      console.error('   2. Betalningsmetod saknas eller har gått ut');
      console.error('   3. Krediter är slut');
      console.error('   4. För många requests per minut (RPM limit)');
    } else if (error.status === 401) {
      console.error('\n💡 AUTHENTICATION FEL:');
      console.error('   - API-nyckeln är ogiltig eller har revokerats');
      console.error('   - Skapa en ny nyckel på https://platform.openai.com/api-keys');
    } else if (error.status === 403) {
      console.error('\n💡 FÖRBJUDEN:');
      console.error('   - API-nyckeln saknar behörighet för denna modell');
    }
    
    process.exit(1);
  }
}

main().catch(console.error);
