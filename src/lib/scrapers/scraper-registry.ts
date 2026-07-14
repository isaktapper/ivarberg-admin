import { BaseScraper } from './base-scraper';
import { ScraperConfig } from './types';
import { ArenaVarbergScraper } from './arena-varberg-scraper';
import { VarbergsTeaternScraper } from './varbergs-teatern-scraper';
import { VisitVarbergScraper } from './visit-varberg-scraper';
import { SocietenScraper } from './societen-scraper';
import { FallbackScraper } from './fallback-scraper';
import { VarbergsTeaternFirecrawlScraper } from './varbergs-teatern-firecrawl-scraper';
import { VisitVarbergFirecrawlScraper } from './visit-varberg-firecrawl-scraper';
import { ArenaVarbergFirecrawlScraper } from './arena-varberg-firecrawl-scraper';
import { SocietenFirecrawlScraper } from './societen-firecrawl-scraper';
import { loadKnownEventUrls } from './known-urls';

// Tak för hur många detaljsidor Firecrawl-fallbacken får hämta per körning.
// Normalt är antalet nya events litet (databasen filtrerar bort kända URL:er),
// detta skyddar mot credit-rusning om databas-filtret inte kan läsas.
const FIRECRAWL_MAX_DETAIL_PAGES = 100;

export const SCRAPER_CONFIGS: ScraperConfig[] = [
  {
    name: 'Arena Varberg',
    url: 'https://arenavarberg.se/evenemang-varberg/',
    enabled: true,
    organizerId: 5,
    defaultCategory: 'Scen' // Default kategori för Arena Varberg events
  },
  {
    name: 'Varbergs Teater',
    url: 'https://varberg.se/kulturhuset-komedianten/kalender',
    enabled: true,
    organizerId: 6,
    defaultCategory: 'Scen' // Default kategori för Varbergs Teater events
  },
  {
    name: 'Visit Varberg',
    url: 'https://visitvarberg.se/evenemang?limit=500',
    enabled: true,
    organizerId: 7,
    defaultCategory: 'Okategoriserad' // Visit Varberg har blandade evenemang
  },
  {
    name: 'Societén',
    url: 'https://societen.se/kalender/',
    enabled: true,
    organizerId: 49,
    defaultCategory: 'Nattliv' // Default kategori för Societén events
  }
];

export function getScrapers(): BaseScraper[] {
  const scrapers = SCRAPER_CONFIGS
    .filter(config => config.enabled)
    .map(config => {
      switch (config.name) {
        case 'Arena Varberg':
          // arenavarberg.se svarar HTTP 415 till vissa GitHub Actions IP:n - Firecrawl som fallback
          return new FallbackScraper(config, new ArenaVarbergScraper(config), async () =>
            new ArenaVarbergFirecrawlScraper(config, {
              knownUrls: await loadKnownEventUrls('%arenavarberg.se%'),
              maxDetailPages: FIRECRAWL_MAX_DETAIL_PAGES,
            })
          );
        case 'Varbergs Teater':
          // varberg.se blockerar GitHub Actions IP:n intermittent - Firecrawl som fallback
          return new FallbackScraper(config, new VarbergsTeaternScraper(config), async () =>
            new VarbergsTeaternFirecrawlScraper(config, {
              knownUrls: await loadKnownEventUrls('%varberg.se/kulturhuset-komedianten%'),
              maxDetailPages: FIRECRAWL_MAX_DETAIL_PAGES,
            })
          );
        case 'Visit Varberg':
          // visitvarberg.se blockerar GitHub Actions IP:n intermittent - Firecrawl som fallback
          return new FallbackScraper(config, new VisitVarbergScraper(config), async () =>
            new VisitVarbergFirecrawlScraper(config, {
              knownUrls: await loadKnownEventUrls('%visitvarberg.se%'),
              maxDetailPages: FIRECRAWL_MAX_DETAIL_PAGES,
            })
          );
        case 'Societén':
          // societen.se svarar HTTP 415 till vissa GitHub Actions IP:n - Firecrawl som fallback
          return new FallbackScraper(config, new SocietenScraper(config), async () =>
            new SocietenFirecrawlScraper(config, {
              knownUrls: await loadKnownEventUrls('%societen.se%'),
              maxDetailPages: FIRECRAWL_MAX_DETAIL_PAGES,
            })
          );
        default:
          throw new Error(`Unknown scraper: ${config.name}`);
      }
    });
  
  // Sortera så att Visit Varberg alltid körs sist (aggregator-plattform)
  // Detta undviker att hämta dubbletter från Visit Varberg när vi redan har originalkällan
  return scrapers.sort((a, b) => {
    const aConfig = a.getConfig();
    const bConfig = b.getConfig();
    
    if (aConfig.name === 'Visit Varberg') return 1;  // Visit Varberg sist
    if (bConfig.name === 'Visit Varberg') return -1; // Visit Varberg sist
    return 0; // Behåll ordning för övriga
  });
}
