# Kustkontoret – designsystem för iVarberg Admin

Adminen delar palett med ivarberg.nu men är byggd för tabeller och köer:
tätare, lugnare, med tydliga statusar och kortkommandon.

Designförslaget (artboards): https://claude.ai/artifact/P6YCpdxk6fA1Df7eNrbxb6

## Tokens (`src/app/globals.css`)

| Token | Hex | Används till |
| --- | --- | --- |
| `sand` | #F9F4EF | Sidans bakgrund |
| `sand-deep` | #F1EADF | Sidomenyn |
| `sand-soft` | #FBF8F4 | Tabellhuvud, hover |
| `stone` | #ECE9E3 | Neutrala chips |
| `line` / `line-soft` | #E3DBCA / #F0EBE3 | Kantlinjer |
| `ink` / `ink-soft` / `ink-muted` / `ink-faint` | #10214B … #8B92A3 | Text i fyra nivåer |
| `sea` / `sea-dark` / `sea-light` / `sea-lightest` | #0F5AA6 … #EEF4FB | Primär, länkar, vald rad |
| `kelp` / `kelp-light` | #1B6F49 / #DDF1E6 | Ok, publicerad |
| `amber` / `amber-light` | #8A5A00 / #FBEFD0 | Väntar, varning |
| `poppy` / `poppy-light` / `poppy-line` | #B84A14 / #FBE4D7 / #F3C9B3 | Fel, destruktivt |

Typsnitt: `font-display` (Poppins 600) för rubriker, `font-sans` (IBM Plex Sans)
för gränssnitt, `font-mono` (IBM Plex Mono) för tider, id:n och siffror.
Radier: 12 px kort, 8 px kontroller. Rader i tabeller: 48 px (44 px tät).

## Statusar – ett register

`src/lib/status.ts` mappar varje domän (event, organizer, page, scraper, tip,
alert, alertSeverity, instagram) till en ton (`ok | wait | neutral | bad | info | running`)
och en svensk etikett. Rendera alltid med `<StatusBadge domain="event" value={status} />`.
Inga lokala färghjälpare.

## Komponenter (`src/components/ui/`)

- Layout: `PageHeader`, `Card`/`CardHeader`/`CardBody`/`CardFooter`, `SectionLabel`
- Data: `DataTable` (grid-baserad, markering, sortering, skelett, tomt läge), `TitleCell`, `Thumb`, `Pagination`, `StatCard`
- Filter: `FilterBar`, `FilterChip`, `SelectFilter`, `MultiFilter`, `SearchInput` (debounce), `Tabs`, `Segmented`
- Formulär: `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Label`, `TagInput`, `CategoryPicker`
- Feedback: `useToast()` (ersätter `alert()`), `useConfirm()` (ersätter `confirm()`, stöd för "skriv ordet"), `Banner`, `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton`
- Overlay: `Dialog`/`DialogContent`, `DropdownMenu`, `Tooltip`/`IconButton`, `BulkBar`
- Övrigt: `Button` (default, secondary, ghost, destructive, success, dark, link), `Kbd`, `StatusBadge`, `ToneBadge`, `CategoryChip`, `QualityDot`

## Skal (`src/components/shell/`)

`AppShell` renderas av `src/app/(admin)/layout.tsx` runt alla adminsidor:
sidomeny med realtidsbadges (granska, tips, larm), topprad med brödsmulor,
⌘K-kommandopalett (sidor, åtgärder, sök event/arrangörer), mobilmeny.
Menyn definieras i `nav.ts`.

## Hooks (`src/hooks/`)

- `useUrlState(defaults)` – filter, sortering och sida i URL:en
- `useLocalStorage(key, initial)` – kolumner, sidstorlek, avfärdade dubletter
- `useHotkeys({ 'mod+s': fn, a: fn })` – kortkommandon som ignorerar fält

## Regler

- Inga `alert()`/`confirm()`/`prompt()`.
- Hämta listor sidvis från servern (`.range()`), aldrig alla rader för att filtrera i klienten.
- Filtrering, sortering och sida lever i URL:en.
- Destruktiva åtgärder är kantlinje-knappar och kräver bekräftelse.
- Ingen Tailwind-grå (`gray-*`, `blue-600`) – bara tokens ovan.
