import { VisitVarbergScraper } from '../visit-varberg-scraper';

async function test() {
  console.log('🧪 Testing Visit Varberg Scraper...\n');
  console.log('═'.repeat(60));

  const scraper = new VisitVarbergScraper({
    name: 'Visit Varberg',
    url: 'https://visitvarberg.se/evenemang?limit=500',
    enabled: true,
    organizerId: 7,
    defaultCategory: 'Okategoriserad'
  });

  try {
    const startTime = Date.now();
    const events = await scraper.scrape();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '═'.repeat(60));
    console.log(`✅ Success! Found ${events.length} events in ${duration}s\n`);

    if (events.length === 0) {
      console.log('⚠️  No events found. This might be expected if the calendar is empty.');
      return;
    }

    // Show first 5 events
    console.log('📋 Sample events:\n');
    events.slice(0, 5).forEach((event, i) => {
      console.log(`${i + 1}. ${event.name}`);
      console.log(`   📅 Date: ${new Date(event.date_time).toLocaleString('sv-SE')}`);
      console.log(`   📍 Venue: ${event.venue_name || 'N/A'}`);
      console.log(`   📌 Location: ${event.location}`);
      console.log(`   🖼️  Image: ${event.image_url ? '✓' : '✗'}`);
      console.log(`   📝 Description: ${event.description ? `${event.description.substring(0, 60)}...` : 'N/A'}`);
      console.log(`   💰 Price: ${event.price || 'N/A'}`);
      console.log(`   🔗 URL: ${event.organizer_event_url}`);
      console.log('');
    });

    // Statistics
    const withImages = events.filter(e => e.image_url).length;
    const withDescriptions = events.filter(e => e.description).length;
    const withVenue = events.filter(e => e.venue_name).length;
    const withPrice = events.filter(e => e.price).length;
    const freeEvents = events.filter(e => e.price === 'Gratis').length;

    console.log('═'.repeat(60));
    console.log('📊 Statistics:\n');
    console.log(`   Total events: ${events.length}`);
    console.log(`   With images: ${withImages} (${((withImages/events.length)*100).toFixed(1)}%)`);
    console.log(`   With descriptions: ${withDescriptions} (${((withDescriptions/events.length)*100).toFixed(1)}%)`);
    console.log(`   With venue name: ${withVenue} (${((withVenue/events.length)*100).toFixed(1)}%)`);
    console.log(`   With price info: ${withPrice} (${((withPrice/events.length)*100).toFixed(1)}%)`);
    console.log(`   Free events: ${freeEvents} (${((freeEvents/events.length)*100).toFixed(1)}%)`);

    // Venue distribution
    const venueCount = new Map<string, number>();
    events.forEach(e => {
      const venue = e.venue_name || 'Unknown';
      venueCount.set(venue, (venueCount.get(venue) || 0) + 1);
    });

    console.log('\n📍 Venue Distribution:');
    Array.from(venueCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([venue, count]) => {
        console.log(`   ${venue}: ${count} events`);
      });

    // Date range
    const dates = events.map(e => new Date(e.date_time).getTime());
    const earliestDate = new Date(Math.min(...dates));
    const latestDate = new Date(Math.max(...dates));

    console.log('\n📆 Date Range:');
    console.log(`   Earliest: ${earliestDate.toLocaleDateString('sv-SE')}`);
    console.log(`   Latest: ${latestDate.toLocaleDateString('sv-SE')}`);
    console.log(`   Span: ${Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24))} days`);

    // Quality check
    const missingData = {
      noImage: events.filter(e => !e.image_url).length,
      noDescription: events.filter(e => !e.description).length,
      noVenue: events.filter(e => !e.venue_name).length,
      noPrice: events.filter(e => !e.price).length
    };

    console.log('\n⚠️  Quality Issues:');
    console.log(`   Missing images: ${missingData.noImage}`);
    console.log(`   Missing descriptions: ${missingData.noDescription}`);
    console.log(`   Missing venue names: ${missingData.noVenue}`);
    console.log(`   Missing price info: ${missingData.noPrice}`);

    // Validation
    const invalid = events.filter(e => !e.name || !e.date_time || !e.location);
    if (invalid.length > 0) {
      console.log(`\n❌ VALIDATION FAILED: ${invalid.length} events missing required fields!`);
      invalid.forEach(e => {
        console.log(`   - ${e.name || 'NO NAME'}: missing ${!e.name ? 'name' : !e.date_time ? 'date' : 'location'}`);
      });
    } else {
      console.log('\n✅ All events have required fields (name, date_time, location)');
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 Test completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
test();

