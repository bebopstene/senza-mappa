# PRD — Senza Mappa: app per camminate e bangla

Versione del 17 ottobre 2026

## Contesto e problema

Senza Mappa è una web app per registrare camminate urbane senza navigatore, con soste nei bangla, e rivedere il percorso solo alla fine. Nasce dalla camminata di gruppo Easy Beer → Lucky Bar Isola: la regola è niente Google Maps, ma alla fine si vuole sapere dove si è passati e dove si è bevuto.

Oggi questa memoria si perde: le app di fitness tracciano il GPS di continuo ma non sanno cosa sia una tappa birra, e quelle di mappe rompono la regola del gioco. Il tracciamento continuo, inoltre, in una web app su iPhone si interrompe a schermo spento.

La scelta di prodotto: niente tracciamento continuo. Il percorso si ricostruisce alla chiusura dai punti segnati, cioè i check-in nei bangla e i checkpoint lungo la strada (manuali o automatici alla riapertura dell’app).

**Job to be done**: quando camminiamo per la città senza mappa, vogliamo segnare dove ci fermiamo con un gesto solo, per rivedere e raccontare il giro alla fine.

**Utente principale**: il segnatore, cioè una persona per camminata con l’app aperta. Utenti secondari: i partecipanti che ricevono il link.

## Obiettivi e non-obiettivi

**Obiettivi**

- Segnare un bangla o un checkpoint in 2 tap e meno di 5 secondi, senza guardare una mappa.
- Ricostruire alla chiusura un percorso credibile che segua le strade, non linee dritte sopra i palazzi.
- Tenere un archivio dei bangla visitati, riapribile camminata dopo camminata (dalla v2, R13).
- Funzionare su iPhone e Android senza installazione dallo store.

**Non-obiettivi (v1)**

- Tracciamento GPS continuo: è inaffidabile in una web app a schermo spento e contraddice il gioco.
- Navigazione o indicazioni stradali: l’app non deve mai dire dove andare.
- Social pubblico, classifiche pubbliche, profili: è per un gruppo di amici, non per sconosciuti.
- Recensioni pubbliche dei negozi: voti e premi dei bangla restano visibili solo al gruppo, per non esporre attività reali a giudizi online.
- Incentivi a bere di più: il conteggio delle birre per persona è solo un riepilogo e non entra mai nel punteggio né in una classifica.

## Ipotesi da validare

La v0 serve a verificare quattro ipotesi; se la prima o la seconda cadono, il modello a punti va ripensato prima di costruire altro.

| Ipotesi | Se è falsa | Test nella v0 | Segnale di successo |
| --- | --- | --- | --- |
| Il segnatore si ricorda di segnare i checkpoint anche dopo un paio di birre | percorso povero e poco credibile | contare i checkpoint per km | almeno 1 checkpoint ogni 500 m |
| Punti sparsi bastano per un percorso credibile | mappa finale “inventata” | il gruppo rivede il percorso a fine giro | il gruppo riconosce come reali almeno 7 tratti su 10 |
| Il GPS al tap è abbastanza preciso in centro città | bangla segnati nel palazzo sbagliato | registrare la precisione di ogni punto | almeno 85% dei punti entro 50 m |
| La modalità alla cieca diverte e non frustra | il gruppo apre Google Maps o abbandona | domanda a fine giro e uso di “Mi sono perso” | nessun abbandono, “Mi sono perso” usato al massimo una volta |

## Concetti chiave

Una camminata è una sequenza ordinata di punti; il percorso esiste solo dopo la chiusura.

| Concetto | Cosa è | Dati salvati |
| --- | --- | --- |
| Camminata | Sessione con squadra, inizio, punti, chiusura | nome, ora inizio e fine, stato |
| Squadra | I partecipanti della camminata | soprannomi (2–12) |
| Bangla | Tappa con birra, segnata all’arrivo | posizione, ora, nome negozio (suggerito da OSM o scritto a mano), birre per persona, voto generale 1–5 |
| Checkpoint | Punto di passaggio segnato ogni tot | posizione, ora, nota facoltativa; anche automatico quando l’app si riapre |
| Passante | Checkpoint speciale: il gruppo ha chiesto la strada | posizione, ora, chi ha chiesto (facoltativo) |
| Chiusura | Fine della camminata | genera il percorso dai punti, in ordine di tempo, più il percorso ottimale |
| Modalità alla cieca | Regola di gioco, attiva di default | durante la camminata nessuna mappa: solo contatori e pulsanti |

La partenza e l’arrivo sono semplicemente il primo e l’ultimo punto. Un bangla già visitato in passato viene riconosciuto se il check-in cade entro circa 40 m da uno salvato.

**Regola dei passanti**: in caso di dubbio sulla strada si chiede a un passante, mai al telefono. Il segnatore lo registra con “Passante”; “Mi sono perso” resta l’ultima risorsa.

**Squadra**: solo il segnatore ha l’app; all’avvio inserisce i soprannomi dei partecipanti, e a ogni bangla segna chi beve e il voto generale del bangla. Alla chiusura l’app calcola il punteggio finale. Il telefono può passare di mano: l’app non lega nulla a chi lo tiene.

**Percorso ottimale**: alla chiusura l’app calcola il percorso a piedi più breve tra partenza e arrivo e lo sovrappone a quello fatto, per vedere quanto vi siete allungati.

## User stories

Chi tiene il telefono durante la camminata (“il segnatore”):

1. Come segnatore voglio avviare una camminata con un tap, così da non perdere tempo alla partenza.
2. Come segnatore voglio fare check-in in un bangla appena entro, così la tappa resta registrata anche se poi mi dimentico.
3. Come segnatore voglio segnare un checkpoint ogni tot, così il percorso ricostruito segue la strada che abbiamo fatto davvero.
4. Come segnatore voglio chiudere la camminata e vedere il percorso solo allora, così la regola “senza mappa” resta intatta.
5. Come segnatore voglio correggere o cancellare un punto sbagliato dopo la chiusura, così un GPS impreciso non rovina la mappa.

Chi partecipa:

6. Come partecipante voglio aprire un link alla camminata chiusa, così vedo percorso, bangla e punteggio senza installare nulla.
7. Come habitué voglio vedere la mappa di tutti i bangla visitati nel tempo, così la prossima volta scegliamo una zona nuova.
8. Come gruppo vogliamo votare ogni bangla con un tap e premiare i migliori a fine giro, così la prossima volta sappiamo dove tornare.

Casi limite:

9. Come segnatore senza segnale voglio che i punti si salvino comunque, così li ritrovo quando torna la rete.
10. Come segnatore con GPS impreciso (oltre 50 m) voglio un avviso e la possibilità di riprovare, così non salvo un punto nel palazzo sbagliato.
11. Come segnatore che ha toccato il pulsante sbagliato voglio annullare l’ultimo punto, così un errore non resta nel percorso.
12. Come segnatore a cui si è chiuso il browser voglio ritrovare la camminata in corso, così non perdo i punti già segnati.
13. Come gruppo davvero perso voglio vedere dove siamo per un attimo, così torniamo sulla strada senza abbandonare il gioco.

## Requisiti

La v0 è il ciclo completo squadra → avvia → segna → chiudi → rivedi; tutto il resto è P1 o P2.

| ID | Priorità | Requisito | Criterio di accettazione |
| --- | --- | --- | --- |
| R1 | P0 | Avvio camminata | Dopo aver inserito la squadra (R23), un tap su “Parti” crea la camminata e salva il primo punto con la posizione corrente |
| R2 | P0 | Check-in bangla | Dal pulsante “Bangla” al salvataggio servono al massimo 2 tap; “Salta” è sempre visibile e il nome si può lasciare vuoto. Dopo il salvataggio: birre per persona (R24) e voto generale (R16), entrambi saltabili |
| R3 | P0 | Checkpoint | Un tap su “Checkpoint” salva posizione e ora; nessun altro campo obbligatorio. Vale per il punteggio solo se dista almeno 200 m dal punto precedente |
| R27 | P0 | Checkpoint automatico | Quando l’app torna in primo piano e il GPS si riaggancia, salva da sola un checkpoint se dista almeno 200 m dall’ultimo punto e la precisione è entro 50 m; lo segnala con un timbro discreto |
| R9 | P0 | Promemoria checkpoint | Con l’app aperta, ogni N minuti (default 10): vibrazione su Android; su iOS, che non la supporta, flash a schermo intero e suono breve |
| R4 | P0 | Modalità alla cieca | Prima della chiusura nessuna schermata mostra mappe, coordinate o direzioni, salvo R20 |
| R5 | P0 | Chiusura e percorso | Alla chiusura i punti vengono collegati in ordine di tempo con un percorso pedonale lungo le strade. Senza rete la camminata si chiude comunque in stato “percorso da calcolare” e il calcolo parte appena torna la connessione; linee dritte solo se il servizio fallisce |
| R6 | P0 | Salvataggio locale e offline | Ogni punto è scritto su IndexedDB prima della conferma a schermo; resta anche senza rete e dopo la chiusura del browser |
| R7 | P0 | Controllo precisione | Al tap l’app legge la posizione per massimo 10 secondi e tiene la lettura più precisa; oltre 50 m appare un avviso con “Riprova” o “Salva comunque” |
| R17 | P0 | Ripresa camminata | All’apertura, se esiste una camminata attiva, l’app torna direttamente alla schermata di camminata |
| R18 | P0 | Annulla ultimo punto | Dopo ogni punto compare “Annulla” per 5 secondi; il tap elimina il punto |
| R19 | P0 | Chiusura protetta | “Chiudi” richiede una pressione prolungata di 1 secondo; un tap singolo non chiude |
| R23 | P0 | Squadra | Prima di partire si inseriscono da 2 a 12 soprannomi; la squadra dell’ultima camminata è proposta con un tap |
| R24 | P0 | Birre per persona | Dopo il check-in compare la griglia dei soprannomi: tap = +1 birra a quella persona, “Tutti” = +1 a ciascuno, “Annulla” per l’ultimo tap; passo saltabile |
| R16 | P1 | Voto del bangla | Al check-in il gruppo dà un solo voto generale da 1 a 5 con un tap; saltabile |
| R25 | P1 | Premiazione bangla | Alla chiusura il gruppo sceglie, tra i bangla visitati, il vincitore di ogni categoria; una scelta per categoria, saltabile |
| R26 | P1 | Punteggio finale | Alla chiusura l’app calcola punteggio di squadra, punti personali e titoli secondo la tabella dedicata |
| R28 | P1 | Percorso ottimale | Alla chiusura l’app calcola il percorso pedonale più breve tra partenza e arrivo, lo sovrappone al vostro e mostra la deviazione in km e in percentuale; mai visibile prima della chiusura |
| R8 | P1 | Suggerimento nome bangla | Al check-in l’app propone i negozi OSM entro 60 m; se Overpass non risponde entro 8 secondi si passa al nome scritto a mano |
| R10 | P1 | Modifica dopo la chiusura | Si può spostare o cancellare un punto e il percorso si ricalcola; si possono correggere birre e voti |
| R11 | P1 | Link condivisibile | La camminata chiusa ha un link di sola lettura, non indicizzato dai motori di ricerca |
| R12 | P1 | Statistiche | Distanza, durata, bangla visitati, passanti consultati, tempo medio tra una tappa e l’altra, birre per persona (solo riepilogo) |
| R22 | P1 | Passante | Un tap su “Passante” salva un checkpoint di tipo passante e chiede chi ha fatto la domanda (saltabile); il contatore si aggiorna |
| R20 | P1 | “Mi sono perso” | Dal menu; prima chiede “Avete chiesto a un passante?”, solo confermando mostra la posizione su mappa per 30 secondi, e l’uso resta segnato nel percorso con un timbro |
| R21 | P1 | Schermo acceso | Interruttore nel menu che tiene lo schermo acceso durante la camminata (Screen Wake Lock API) |
| R13 | P2 | Archivio bangla di gruppo | Mappa unica di tutti i bangla visitati da tutte le camminate del gruppo |
| R14 | P2 | Più segnatori | Più telefoni segnano punti sulla stessa camminata |
| R15 | P2 | Locandina automatica | Alla chiusura genera un’immagine riassuntiva nello stile della locandina, con il punteggio finale |

### Voto e premiazione dei bangla (R16, R25)

Al check-in il gruppo dà un solo voto generale da 1 a 5. A fine camminata, al bar d’arrivo, si fa la premiazione: per ogni categoria il gruppo sceglie il bangla vincitore tra quelli visitati.

| Categoria | Chi vince |
| --- | --- |
| Bangla preferito | il migliore in assoluto della serata |
| Birra più fresca | quello con il frigo più freddo |
| Più varietà | la scelta più ampia, dalle industriali alle artigianali |
| Più gentili | l’accoglienza migliore al banco |
| Location migliore | posizione, spazio fuori, atmosfera della via |

Criteri di accettazione:

- Dopo il check-in compare una riga di 5 blocchi: un tap salva il voto, “Salta” non blocca nulla.
- Alla chiusura la premiazione propone una categoria per schermata, con i bangla visitati come blocchi da toccare.
- Con un solo bangla visitato la premiazione si salta e il bangla vince tutto d’ufficio.
- Voti e premi si vedono solo nell’app e nel link della camminata; nessuna pubblicazione esterna.

Per un bangla già visitato l’archivio mostra la media dei voti generali e i premi vinti nelle camminate precedenti.

### Squadra e punteggio finale (R23–R26)

Il punteggio premia esplorazione e rispetto delle regole; le birre bevute si contano per il riepilogo ma valgono zero punti.

| Voce | Punti | A chi |
| --- | --- | --- |
| Bangla visitato | +10 | squadra |
| Bangla mai visitato prima dal gruppo | +5 bonus | squadra |
| Passante consultato | +5 | squadra, e +5 a chi ha fatto la domanda |
| Checkpoint (almeno 200 m dal precedente) | +2 | squadra |
| Km percorsi | +3 per km | squadra |
| “Mi sono perso” | −15 | squadra |
| Birre bevute | 0 | solo riepilogo |

Titolo personale alla fine: **Navigatore** a chi ha fatto più domande ai passanti. I pesi sono un punto di partenza da tarare dopo la prima camminata.

## Flusso principale

Durante la camminata lo schermo mostra solo tempo trascorso, numero di bangla, numero di checkpoint e i pulsanti principali.

1. **Parti**: inserimento dei soprannomi della squadra, tap su “Parti”, salvataggio del punto di partenza.
2. **Cammina e segna**, ripetendo finché serve:
   1. ogni tot, tap su “Checkpoint” (quando l’app si riapre ne salva uno da sola);
   2. all’ingresso in un bangla, tap su “Bangla”, conferma del nome (o salta), poi birre per persona e voto generale (saltabili);
   3. in caso di dubbio sulla strada, si chiede a un passante e si segna con “Passante”; solo se non basta, “Mi sono perso” dal menu.
3. **Arriva**: pressione prolungata su “Chiudi” all’arrivo; l’ultimo punto diventa l’arrivo.
4. **Rivela**: l’app calcola il percorso a piedi tra i punti e mostra la mappa con il vostro percorso e quello ottimale sovrapposti, tappe numerate e statistiche; poi premiazione dei bangla e punteggio finale.
5. **Sistema e condividi**: correzione dei punti sbagliati, poi link al gruppo.

## Direzione grafica UI

L’app riprende la locandina: brutalismo su cemento, verde muschio della “foresta” e il percorso disegnato come una linea della metro milanese. Tutto deve restare leggibile e premibile camminando, di sera, dopo qualche birra.

### Colori

| Token | Hex | Uso |
| --- | --- | --- |
| `cemento` | #D6D3CB | sfondo principale |
| `nero` | #111111 | testo, bordi, ombre, pulsante Chiudi |
| `rosso-linea` | #D3121D | linea del percorso, timbri; solo grafica e testo grande (contrasto basso sul cemento) |
| `muschio` | #2E4B2F | blocchi di sezione, archivio, conferme |
| `ambra` | #F2B230 | tutto ciò che è birra: pulsante Bangla, icone, voti |
| `schiuma` | #FFFFFF | schiuma delle icone, testo su muschio |

### Tipografia

| Ruolo | Font | Regole |
| --- | --- | --- |
| Titoli, timer, numeri grandi | Archivo Black | maiuscolo, interlinea stretta (0.9), tracking negativo |
| Etichette, contatori, testo | Space Mono (400 e 700) | etichette in maiuscolo con spaziatura larga; testo minimo 16 px |

### Regole di stile

- Bordi neri da 3 px, angoli a zero, ombre piene sfalsate di 6–8 px, nessuna sfumatura.
- Pulsanti principali alti almeno 64 px e larghi quanto lo schermo; feedback a ogni tap: vibrazione su Android, flash del pulsante su iOS (che non supporta la vibrazione da web).
- Icone disegnate a tratto spesso nello stile del boccale della locandina; niente emoji.
- Conferme come timbri storti in rosso (“SEGNATO”, “BANGLA 3”), come il “VIETATO GOOGLE MAPS”.
- Variante notte per la schermata di camminata: sfondo nero, testo cemento, stessi accenti.

### Schermate

| Schermata | Come appare |
| --- | --- |
| Primo avvio | una sola schermata con le regole (niente navigatore, si chiede ai passanti, birra a ogni tappa) e il perché serve la posizione, prima della richiesta di permesso del browser |
| Squadra | soprannomi come blocchi bordati; “Stessa squadra dell’ultima volta” con un tap |
| Camminata (alla cieca) | timer gigante, contatori bangla e checkpoint; BANGLA in ambra con boccale e CHECKPOINT su cemento, grandi; PASSANTE più piccolo sotto; menu per “Mi sono perso” e schermo acceso; CHIUDI nero da tenere premuto, in basso, lontano dal pollice; nessuna mappa |
| Check-in | foglio dal basso con i nomi OSM in blocchi bordati e “Salta” sempre visibile; poi griglia birre con i soprannomi; poi una riga di 5 blocchi quadrati per il voto, che si riempiono di ambra (non stelle); timbro di conferma |
| Chiusura e rivelazione | mappa in scala di grigi; percorso come linea metro rossa spessa, percorso ottimale come linea nera tratteggiata, bangla come boccali numerati, checkpoint come piccoli quadrati, partenza e arrivo come quadrati neri; sotto, statistiche in griglia bordata |
| Premiazione | una card per categoria, con i bangla visitati come blocchi da toccare |
| Punteggio finale | tabellone delle partenze della metro, riga per persona, titoli come timbri rossi |
| Archivio | card con ombra piena per camminata; mappa dei bangla con media voti in un blocco muschio |

### Tono di voce

Frasi brevi, imperative e un po’ ironiche, come la locandina: “PARTI”, “BIRRA QUI”, “DOVE SIAMO? NON SI SA”, “CHIEDI A UN UMANO”, “RIVELA IL PERCORSO”.

## Architettura tecnica

Decisione: PWA in Vite + React + TypeScript, codice su GitHub, deploy su Vercel, con una sola funzione serverless per tenere segreta la chiave del routing. Nessun server proprio oltre a questa; solo API aperte e gratuite.

### Stack

| Livello | Tecnologia | Note |
| --- | --- | --- |
| Build e linguaggio | Vite, React, TypeScript | avvio rapido, ben supportato da Claude Code |
| PWA | vite-plugin-pwa (Workbox) | manifest, icone, app usabile offline |
| Stile | Tailwind CSS | token di colore e font della direzione grafica |
| Dati locali | Dexie.js su IndexedDB | camminate, punti, birre, voti salvati offline |
| Posizione | Geolocation API, alta precisione, solo al tap o alla riapertura | nessun tracciamento in background |
| Mappa | MapLibre GL JS con OpenFreeMap | vettoriale, gratuita, senza chiave; caricata solo alla chiusura; attribuzione OSM visibile |
| Nomi bangla | Overpass API chiamata dal client: `shop=convenience`, `shop=alcohol`, `shop=supermarket` entro 60 m | una query solo al check-in |
| Percorso a piedi | OpenRouteService, profilo `foot-walking`, tramite `/api/route` | la chiave resta su Vercel, mai nel browser |
| Backend (v1) | Supabase: Postgres + accesso con magic link | link condivisi, archivio di gruppo |
| Hosting | Vercel collegato al repo GitHub | deploy a ogni push, anteprima per ogni PR, HTTPS (obbligatorio per il GPS) |

### Struttura del repo

```
senza-mappa/
├─ api/route.ts          # funzione Vercel: proxy verso OpenRouteService
├─ public/               # icone PWA
├─ src/
│  ├─ screens/           # Home, Squadra, Camminata, Chiusura, Premiazione, Archivio
│  ├─ components/        # pulsanti grandi, griglia birre, voto a blocchi, timbri
│  ├─ lib/geo.ts         # posizione e controllo precisione (R7, R27)
│  ├─ lib/overpass.ts    # negozi vicini (R8)
│  ├─ lib/route.ts       # chiamata a /api/route, fallback linee dritte (R5, R28)
│  ├─ lib/score.ts       # calcolo del punteggio (R26)
│  └─ db/schema.ts       # tabelle Dexie
├─ docs/PRD.md           # questo documento
├─ CLAUDE.md             # contesto e regole per Claude Code
└─ vite.config.ts
```

### Modello dati

| Tabella | Campi |
| --- | --- |
| walks | id, nome, startedAt, endedAt, stato (attiva / percorso da calcolare / chiusa), percorso e percorso ottimale (GeoJSON) |
| participants | id, walkId, soprannome |
| points | id, walkId, tipo (partenza / checkpoint / checkpoint auto / passante / perso / bangla / arrivo), lat, lng, accuracy, createdAt, banglaId, participantId (chi ha chiesto al passante) |
| bangla | id, nome, osmId, lat, lng |
| drinks | id, walkId, participantId, banglaId, quantità, createdAt |
| reviews | id, banglaId, walkId, voto (1–5) |
| awards | id, walkId, categoria, banglaId |

Tutti gli id sono UUID generati sul telefono e ogni riga ha `updatedAt`, così il passaggio a Supabase in v1 non cambia il modello. Il punteggio non si salva: si ricalcola dai dati, così cambiare i pesi aggiorna anche le camminate passate.

### Deploy con GitHub e Vercel

1. Crea il repo su GitHub e fai il primo push.
2. Su Vercel: Import Project dal repo, preset Vite; la cartella `api/` diventa funzione serverless in automatico.
3. Variabili d’ambiente su Vercel: `ORS_API_KEY` (solo server); in v1 anche `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. `.env` va in `.gitignore`: nessuna chiave nel repo.
5. Ogni push su `main` pubblica; ogni PR genera un link di anteprima da provare sul telefono, fuori casa, con il GPS vero.

### Note tecniche

- **iOS**: niente Vibration API dal web; il feedback passa da animazione e suono (R9).
- **Permesso posizione**: una PWA installata su iPhone può richiederlo più spesso di Safari; va gestito con un messaggio chiaro se viene negato.
- **Checkpoint automatico (R27)**: sull’evento `visibilitychange` l’app chiede una posizione nuova e salva il punto solo se rispetta distanza e precisione.
- **Routing**: il numero di waypoint per richiesta a OpenRouteService è limitato; con molti punti il percorso si calcola a tratti e si unisce. Il percorso ottimale (R28) è una chiamata in più con soli partenza e arrivo.
- **Limiti d’uso**: le chiamate a Overpass e al routing partono solo al check-in e alla chiusura, mai in continuo. Overpass ha timeout di 8 secondi e risultati in cache per zona.
- **Supabase**: Row Level Security attiva su tutte le tabelle, dato che la chiave anon è pubblica.
- **Test del GPS**: in sviluppo con la simulazione posizione dei DevTools; prima della camminata, prova sul telefono tramite l’anteprima Vercel.

## Metriche di successo

Per un gruppo di amici contano tre cose: che il ciclo si chiuda, che segnare sia veloce, che si torni a usarla.

| Metrica | Tipo | Obiettivo | Come si misura |
| --- | --- | --- | --- |
| Camminate avviate e chiuse con percorso | anticipatore | ≥ 9 su 10 | conteggio locale |
| Tempo medio di un check-in bangla | anticipatore | < 5 secondi | timestamp tap → salvataggio |
| Punti salvati con precisione ≤ 50 m | anticipatore | ≥ 85% | campo `accuracy` della Geolocation API |
| Percorsi che non richiedono correzioni | ritardato | ≥ 70% | camminate chiuse senza modifiche ai punti |
| Seconda camminata del gruppo | ritardato | entro 30 giorni dalla prima | data della seconda camminata |

Con un solo gruppo i numeri sono indicativi. In v0 si misurano con un export JSON dalla schermata di chiusura, senza strumenti di analytics.

## Domande aperte e fasi

**Domande aperte**

- [ ] Ogni quanto segnare un checkpoint: a tempo (10 minuti?) o a incroci importanti? Da testare nella prima camminata. (prodotto)
- [ ] Il percorso pedonale tra due punti lontani può inventare deviazioni: oltre quale distanza tra punti mostrare un tratteggio invece della strada? (tecnico)
- [ ] Un solo segnatore basta, o il gruppo vuole segnare da più telefoni già in v1? (gruppo)
- [ ] Il link condiviso mostra il nome del negozio o solo “Bangla 3”? Pesa sulla privacy dei negozianti. (prodotto)
- [ ] I pesi del punteggio vanno tarati dopo la prima camminata. (gruppo)

**Fasi**

1. **v0, prototipo**: R1–R7, R9, R17–R19, R23–R24 e R27; dati solo sul telefono; da provare alla prossima camminata.
2. **v1**: R8, R10–R12, R16, R20–R22, R25–R26 e R28, cioè nomi da OSM, modifiche, link, statistiche, voto dei bangla, “Mi sono perso”, schermo acceso, passanti, premiazione, punteggio finale e percorso ottimale.
3. **v2**: R13–R15, cioè archivio di gruppo, più segnatori, locandina automatica.
