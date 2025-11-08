import { BaseScraper } from './base-scraper';
import { ScraperConfig } from './types';
import { ArenaVarbergScraper } from './arena-varberg-scraper';
import { VarbergsTeaternScraper } from './varbergs-teatern-scraper';
import { VisitVarbergScraper } from './visit-varberg-scraper';
import { SocietenScraper } from './societen-scraper';

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
  return SCRAPER_CONFIGS
    .filter(config => config.enabled)
    .map(config => {
      switch (config.name) {
        case 'Arena Varberg':
          return new ArenaVarbergScraper(config);
        case 'Varbergs Teater':
          return new VarbergsTeaternScraper(config);
        case 'Visit Varberg':
          return new VisitVarbergScraper(config);
        case 'Societén':
          return new SocietenScraper(config);
        default:
          throw new Error(`Unknown scraper: ${config.name}`);
      }
    });
}
