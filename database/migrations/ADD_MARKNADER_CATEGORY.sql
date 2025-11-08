-- Migration: Lägg till "Marknader" kategori
-- Datum: 2024-12-19
-- Beskrivning: Lägger till "Marknader" som en ny kategori i event_category enum

-- Lägg till "Marknader" i event_category enum
ALTER TYPE event_category ADD VALUE 'Marknader';

-- Verifiera att kategorin lades till korrekt
SELECT unnest(enum_range(NULL::event_category)) as categories;
