# Senza Mappa

Camminate per la città senza navigatore, con soste nei bangla. Si segnano i punti con un tap; il percorso si vede solo alla fine.

- PRD: [docs/PRD.md](docs/PRD.md)
- Contesto tecnico e scelte: [CLAUDE.md](CLAUDE.md)

```bash
npm install
npm run dev
npm test
```

Deploy: Vercel collegato a questo repo (preset Vite). Variabile facoltativa `ORS_API_KEY` (solo server) per usare OpenRouteService; senza, il routing usa routing.openstreetmap.de.
