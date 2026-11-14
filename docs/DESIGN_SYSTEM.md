# Designsystem för adminen

Omdesign november 2026: vitt och svart med limegrön accent från inu, i stil
med en finansdashboard. Tekniskt, rent och minimalistiskt. Funktionerna är
desamma som tidigare.

## Grundregler

- **Inga borders.** Ytor skiljs åt med bakgrundsfärg: ljusgrå sida, vita kort,
  genomskinligt grå fyllning för fält, sekundärknappar och chips. Lägg inte
  till `border` för att avgränsa något. Undantag: understrykningen på aktiv
  flik och svaga radavdelare i tabeller (`line-soft`).
- **Svart är primärt.** Primärknappar, valt menyval och valt filter är svarta.
- **Limegrönt är accenten**, alltid som fyllning med svart text (för ljust för
  vit text eller som textfärg). Används för valt läge, dagens stapel, "ok"-märken,
  fokusring på fält och knappen `accent`.
- **Siffror** i `tabular`/`font-mono` så att de står still.

## Tokens (`src/app/globals.css`)

Tokennamnen är kvar från förra designen så att alla sidor följde med. Läs dem
som roller:

| Token | Värde | Används till |
| --- | --- | --- |
| `sand` / `sand-deep` | #F1F1F0 | Sidans och sidomenyns bakgrund |
| `sand-soft` | #F7F7F6 | Tabellhuvud, hover inuti vita kort |
| `stone` | svart 6 % | Sekundärknappar, chips, knappgrupper |
| `field` | svart 4,5 % | Fält (input, textarea, uppladdning) på vita kort |
| `line` | genomskinlig | Borders, osynliga med flit |
| `line-soft` | #F2F2F1 | Svaga radavdelare i tabeller |
| `ink` / `ink-soft` / `ink-muted` / `ink-faint` | #111 … #A3A3A3 | Text i fyra nivåer |
| `sea` / `sea-dark` | #111 / #000 | Primär handling (svart) |
| `sea-light` / `sea-lightest` / `lime-light` | #EEF9C9 / #F7FCE6 | Valt läge, info (limegrön ton) |
| `lime` / `lime-dark` | #C6F135 / #B4DE22 | Accent |
| `kelp` / `amber` / `poppy` (+ `-light`) | grön / orange / röd | Ok, väntar, fel |

Typsnitt: Inter för allt (`font-sans`, `font-display` med tätare spärrning),
Geist Mono för tider, id:n och siffror. Radier: 16 px kort, 10 px kontroller,
18 px dialoger.

## BoardUI

Komponenter från [BoardUI](https://www.boardui.com) (MIT, React 19 + Tailwind 4)
ger den extra finishen. De ligger i `src/components/base/` och
`src/components/foundations/`, med tokens i `src/styles/theme.css` och
`typography.css` (importeras i `globals.css`; `src/styles/globals.css` används
inte). BoardUI:s accentramp är omställd till svart, så deras komponenter följer
stilen.

- Lägg till fler: `BOARDUI_TELEMETRY_DISABLED=1 npx boardui@latest add <namn> --yes`.
  Ta bort `AGENTS.md` och `.cursor/` om verktyget skapar dem.
- I bruk nu: `Chip` (statusmärken via `ToneBadge`, märken i siffrorkorten),
  `SegmentedControl` (via `Segmented`), `StatusDot`.
- Ikoner: Lucide som tidigare. BoardUI:s Remix-ikoner följer med deras
  komponenter men behövs inte i egen kod.

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
- Övrigt: `Button` (default svart, accent limegrön, secondary, outline, ghost, destructive, success, dark, link), `Kbd`, `StatusBadge`, `ToneBadge`, `CategoryChip`, `QualityDot`

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
- Destruktiva åtgärder är röda tonade knappar och kräver bekräftelse.
- Ingen Tailwind-grå (`gray-*`, `blue-600`) och inga hårdkodade färger – bara tokens ovan.
- Inga borders för att avgränsa ytor, se Grundregler.
