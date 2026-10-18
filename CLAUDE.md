# Senza Mappa — contesto per Claude Code

Web app (PWA) per camminate urbane senza navigatore con soste nei "bangla". Il PRD completo è in `docs/PRD.md`.

## Regole di prodotto da non rompere
- **Modalità alla cieca (R4)**: prima della chiusura nessuna schermata mostra mappe, coordinate o direzioni. Eccezioni volute: "Mi sono perso" (R20), 30 secondi, e la **mappa nella nebbia** (`src/components/FogMap.tsx`), che scopre la città a quadrati da 120 m solo attorno ai punti già segnati, senza percorso, segnaposto né GPS dal vivo; si spegne dal menu. La sezione I POSTI nasconde la mappa durante una camminata.
- **Niente tracciamento continuo**: la posizione si legge solo al tap o quando l'app torna in primo piano (checkpoint automatico R27).
- **Birre = 0 punti**: si contano solo nel riepilogo, mai nel punteggio né in classifiche.
- **Ogni punto va su IndexedDB prima della conferma a schermo (R6)**.
- Il punteggio non si salva: si ricalcola da `src/lib/score.ts`.

## Stack
Vite + React 18 + TypeScript, Tailwind v4 (token in `src/index.css`), Dexie (`src/db/schema.ts`), vite-plugin-pwa, MapLibre + OpenFreeMap, Overpass per i nomi dei negozi, `/api/route` (funzione Vercel) per il percorso a piedi.

## Scelte prese rispetto al PRD
- **Routing**: `/api/route` usa OpenRouteService se `ORS_API_KEY` è impostata su Vercel, altrimenti il router pedonale pubblico di routing.openstreetmap.de (OSRM). Il client spezza in tratti da 25 waypoint e, se un tratto fallisce, lo disegna dritto.
- **Link condivisibile (R11)** senza Supabase: i dati della camminata chiusa sono compressi (lz-string) nel frammento `#/v/...`, che non arriva al server. Il percorso viene ricalcolato da chi apre il link. Di default i negozi diventano "BANGLA 1, 2…" (domanda aperta sulla privacy dei negozianti); si possono mostrare con un interruttore.
- **Archivio (R13)**: versione locale sul telefono. Bangla e bagni stanno nella sezione **I POSTI** (`src/screens/Posti.tsx`): bangla visti e "da provare", bagni gratis o a pagamento, aggiungibili anche senza camminata.
- **Soste bagno**: tappa `bagno` durante la camminata, con posto riconosciuto entro 40 m come i bangla. Non dà punti.

## Comandi
- `npm run dev` — sviluppo (la funzione `/api/route` gira solo su Vercel o con `vercel dev`)
- `npm test` — test unitari (vitest + fake-indexeddb)
- `npm run build` — typecheck + build

## Stile
Brutalismo su cemento: bordi neri 3 px, angoli a zero, ombre piene sfalsate, niente sfumature, niente emoji. Titoli Archivo Black maiuscolo, testo Space Mono ≥ 16 px. Pulsanti principali ≥ 64 px. Testi brevi, imperativi, un po' ironici, in italiano.
