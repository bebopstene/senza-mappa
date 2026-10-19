# App iOS privata

La stessa web app dentro una shell nativa (Capacitor 8). Il sito su Vercel resta com'è: l'app è solo un'altra porta sullo stesso codice. In più, sul telefono, ha:

- **vibrazione vera** (Taptic Engine) a ogni tap e nei promemoria;
- **promemoria checkpoint come notifiche**, anche a schermo spento e telefono in tasca;
- **schermo acceso** affidabile durante la camminata;
- **GPS nativo**, con un solo permesso "Mentre usi l'app";
- **dati al sicuro** nello spazio dell'app, senza cache del browser né versioni vecchie;
- condivisione di immagine e GPX dal foglio di iOS (Salva immagine, File, WhatsApp).
- **Live Activity**: tempo e contatori sulla schermata di blocco e nella Dynamic Island;
- **Siri, Comandi e tasto Azione**: "Checkpoint" e "Bangla" senza cercare l'app.

Le differenze tra web e app stanno tutte in `src/lib/platform.ts`.

## Prima volta

1. Installa **Xcode** dal Mac App Store, aprilo una volta e accetta i componenti aggiuntivi.
2. Nel Terminale:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```
3. Collega l'iPhone al Mac con il cavo. Sull'iPhone: **Impostazioni → Privacy e sicurezza → Modalità sviluppatore → Attiva** (il telefono si riavvia).
4. Dalla cartella del progetto:
   ```bash
   npm run ios
   ```
   Si apre Xcode con il progetto `ios/App`.
5. In Xcode: clic su **App** nella colonna a sinistra → scheda **Signing & Capabilities** → **Team**: scegli il tuo Apple ID (Add Account… se non c'è). Se il Bundle Identifier `it.senzamappa.app` risulta già preso, cambialo (es. `it.senzamappa.stefano`).
6. In alto scegli il tuo iPhone come destinazione e premi **▶︎ Play**.
7. La prima volta l'iPhone dirà "sviluppatore non attendibile": **Impostazioni → Generali → VPN e gestione dispositivi → il tuo Apple ID → Autorizza**.

## Aggiornare l'app dopo modifiche al codice

```bash
npm run ios
```
poi ▶︎ in Xcode con l'iPhone collegato.

## Scadenza

- **Apple ID gratuito**: l'app smette di aprirsi dopo 7 giorni. Si rinnova rifacendo ▶︎ da Xcode (i dati restano).
- **Apple Developer Program (99 €/anno)**: dura un anno e si può distribuire agli amici con TestFlight.

## Live Activity e Siri

**Live Activity.** Parte da sola quando inizia una camminata: sulla schermata di blocco e nella Dynamic Island si vedono il tempo che scorre, i bangla, i checkpoint e da quanto non segnate un punto. Niente mappa, niente posizione: alla cieca anche lì (R4). Si aggiorna a ogni punto e sparisce quando chiudete la camminata. Si spegne da **Impostazioni → Senza Mappa → Attività in tempo reale**.

**Comandi vocali e tasto Azione.** Due azioni, "Checkpoint" e "Bangla": aprono l'app sulla camminata e premono il pulsante, come se l'aveste toccato voi (GPS compreso). Si usano così:

- **Siri**: "Checkpoint su Senza Mappa", "Segna un bangla su Senza Mappa";
- **Comandi**: app Comandi → + → cerca "Senza Mappa";
- **tasto Azione** (iPhone 15 Pro e successivi): Impostazioni → Tasto Azione → Comando rapido → Senza Mappa → Checkpoint.

Se non c'è una camminata in corso l'app si apre e basta. Se è aperto un foglio (nome del bangla, birre, menu) compare PRIMA FINITE QUI e non succede niente.

**Firma in Xcode (una volta).** Il widget della Live Activity è un secondo pezzo dell'app, con un suo Bundle Identifier `it.senzamappa.app.widget`:

1. In Xcode, colonna a sinistra → **App** (il progetto) → nella lista **TARGETS** scegli **SenzaMappaWidget**.
2. Scheda **Signing & Capabilities** → **Team**: lo stesso Apple ID dell'app. Lascia "Automatically manage signing" acceso.
3. Se hai cambiato il Bundle Identifier dell'app (es. `it.senzamappa.stefano`), quello del widget deve iniziare uguale: `it.senzamappa.stefano.widget`.

Con l'Apple ID gratuito va bene lo stesso, ma Apple conta il widget come un'app in più (massimo 10 identificativi nuovi a settimana). Siri e i comandi non chiedono nulla di speciale: niente capability da aggiungere.

Pezzi nel codice: `ios/App/App/SenzaMappaPlugin.swift` (plugin locale, registrato in `MainViewController.swift`), `ios/App/App/WalkIntents.swift` (Siri e Comandi), `ios/App/SenzaMappaWidget/` (aspetto della Live Activity), `ios/App/Shared/WalkActivityAttributes.swift` (dati in comune). Dal lato web: `liveWalkUpdate`, `liveWalkEnd` e `onShortcut` in `src/lib/platform.ts`, che sul sito non fanno niente.

## Note tecniche

- Le chiamate a `/api/route` partono da `capacitor://localhost` verso `https://senza-mappa.vercel.app`: la funzione risponde con i permessi CORS per quell'origine (`api/route.ts`).
- I link condivisi puntano sempre al sito, così si aprono anche senza app.
- Il service worker non serve nell'app: i file sono già dentro il pacchetto.

## Portare le camminate dal sito all'app

Sito e app hanno archivi separati sul telefono (Safari da una parte, l'app dall'altra).

1. Sul **sito** (Safari o l'icona sulla schermata Home, quella con cui hai fatto la camminata): **ARCHIVIO → ESPORTA TUTTO**, oppure apri una camminata → **ESPORTA JSON**. Scegli "Salva su File".
2. Nell'**app**: **ARCHIVIO → IMPORTA** → scegli il file da File.

In alternativa si può incollare il link condiviso (meno dettagli: niente nomi dei negozi se erano nascosti). Reimportare lo stesso file non crea doppioni.

## Installare senza premere Play

Con l'iPhone collegato via cavo e il Team già scelto in Xcode:

```bash
npm run ios:sync
cd ios/App && xcodebuild -project App.xcodeproj -scheme App -destination 'platform=iOS,name=<nome iPhone>' -allowProvisioningUpdates build
xcrun devicectl device install app --device <UDID> <percorso App.app>
```
