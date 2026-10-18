# App iOS privata

La stessa web app dentro una shell nativa (Capacitor 8). Il sito su Vercel resta com'è: l'app è solo un'altra porta sullo stesso codice. In più, sul telefono, ha:

- **vibrazione vera** (Taptic Engine) a ogni tap e nei promemoria;
- **promemoria checkpoint come notifiche**, anche a schermo spento e telefono in tasca;
- **schermo acceso** affidabile durante la camminata;
- **GPS nativo**, con un solo permesso "Mentre usi l'app";
- **dati al sicuro** nello spazio dell'app, senza cache del browser né versioni vecchie;
- condivisione di immagine e GPX dal foglio di iOS (Salva immagine, File, WhatsApp).

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
