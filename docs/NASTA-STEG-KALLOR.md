# Nästa steg: lägga till källor från admin

Förslag från 2026-11-14, inte påbörjat. Mål: en ny stad (till exempel Halmstad)
ska kunna få sina källor inlagda från admin, utan betalda scrapertjänster och
med så lite ny kod som möjligt. Bakgrund: [SKALNINGSPLAN.md §6](SKALNINGSPLAN.md).

## Idén

De flesta evenemangssajter lämnar redan ut sina event maskinläsbart, eftersom de
vill synas i Google. En generell läsare provar i tur och ordning:

1. Strukturerad data i sidan (schema.org/Event, JSON-LD).
2. Färdiga flöden: WordPress The Events Calendar, kalenderfiler (.ics), RSS,
   biljettsystem som Tickster och ebiljett.
3. Plattformsstöd för system som finns i många städer (Sitevision-kalendrar hos
   kommuner, visit-sajternas gemensamma plattformar).
4. AI-läsning av sidan (OpenAI, gpt-4o-mini, strukturerat svar). Ören per sida.
5. Handskriven kod bara för sajter där inget annat fungerar. Varbergs fem
   befintliga scrapers ligger kvar som de är.

Utdata är alltid `ScrapedEvent`, så `event-importer` fungerar som i dag.

## I admin

1. **Lägg till källa:** klistra in en adress, provkör direkt, se vilka event som
   hittades och vilket sätt som fungerade, spara.
2. **Hitta källor:** förslag för en ny stad (kommunens kalender, visit-sajt,
   teatrar, arenor, bibliotek, barer via Google Places-nyckeln vi redan har).
   Varje förslag provkörs; man bockar i de som är bra.
3. **Källhälsa:** larm när en källa ger klart färre event än vanligt eller inte
   lyckats på tre dagar.

## Ordning

1. Tabellen `sources` + "Lägg till källa" med provkörning, generell läsare och
   AI-läsning.
2. Nya källor körs i den dagliga körningen, med stad och kommunkod satta
   automatiskt.
3. "Hitta källor" för en ny stad.
4. Egen liten server med svensk IP (cirka 50 kr/mån) om sajter blockerar GitHub
   Actions. Firecrawl blir sista utväg.

## Öppet att bestämma

- Ska event från en ny källa publiceras automatiskt vid hög kvalitet, eller gå
  till Granska först? Förslag: Granska de första veckorna per ny källa.
