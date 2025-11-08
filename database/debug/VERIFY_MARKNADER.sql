-- Verifiera att "Marknader" finns i event_category enum
SELECT unnest(enum_range(NULL::event_category)) as categories
ORDER BY categories;
