import { useEffect, useState } from 'react'
import { go } from '../router'
import { useBundle } from '../components/useBundle'
import { RevealView } from '../components/RevealView'
import { BackLink, Btn, ScreenTitle, Sheet } from '../components/ui'
import { computeWalkRoute, deleteWalk, exportWalkJson } from '../lib/walks'
import { ConfirmDelete } from './Archivio'
import { encodeBundle, shareUrl } from '../lib/share'
import { isNative, nativeShareUrl } from '../lib/platform'
import { fileBase, saveFile } from '../lib/export'

export default function Rivela({ walkId }: { walkId: string }) {
  const bundle = useBundle(walkId)
  const [revealed, setRevealed] = useState<boolean | null>(null)
  const [calc, setCalc] = useState<'idle' | 'running' | 'offline' | 'error'>('idle')
  const [share, setShare] = useState(false)
  const [elimina, setElimina] = useState(false)

  useEffect(() => {
    if (bundle && revealed === null) setRevealed(bundle.walk.premiazioneFatta)
  }, [bundle, revealed])

  const stato = bundle?.walk.stato
  const recompute = async () => {
    setCalc('running')
    try {
      const r = await computeWalkRoute(walkId)
      setCalc(r === 'offline' ? 'offline' : 'idle')
    } catch {
      setCalc('error')
    }
  }

  useEffect(() => {
    if (stato === 'da-calcolare' && calc === 'idle') void recompute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato])

  useEffect(() => {
    const on = () => {
      if (stato === 'da-calcolare') void recompute()
    }
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato])

  if (bundle === undefined) return <main className="min-h-screen cemento-texture" />
  if (bundle === null)
    return (
      <main className="min-h-screen cemento-texture px-4 safe-top">
        <BackLink to="" />
        <ScreenTitle>CAMMINATA NON TROVATA</ScreenTitle>
      </main>
    )

  const { walk } = bundle
  const nBangla = new Set(bundle.points.filter((p) => p.tipo === 'bangla').map((p) => p.banglaId)).size

  if (!revealed) {
    return (
      <main className="min-h-screen bg-nero text-cemento px-4 safe-top safe-bottom flex flex-col">
        <div className="etichetta text-sm">{walk.nome}</div>
        <h1 className="titolo text-[clamp(48px,16vw,72px)] mt-6">ARRIVATI.</h1>
        <p className="text-lg mt-4">Adesso potete guardare dove siete passati.</p>
        <div className="mt-auto">
          <Btn variant="ambra" size="xl" className="w-full border-cemento shadow-pieno-cemento" onClick={() => setRevealed(true)} testId="rivela">
            RIVELA IL PERCORSO
          </Btn>
        </div>
      </main>
    )
  }

  const status =
    walk.stato === 'da-calcolare' ? (
      <div className="bordo bg-nero text-cemento p-3 mb-4" role="status" data-testid="stato-percorso">
        <div className="etichetta text-sm">
          {calc === 'running'
            ? 'CALCOLO IL PERCORSO A PIEDI…'
            : calc === 'offline'
              ? 'PERCORSO DA CALCOLARE: PARTE APPENA TORNA LA RETE'
              : calc === 'error'
                ? 'IL CALCOLO NON È RIUSCITO'
                : 'PERCORSO DA CALCOLARE'}
        </div>
        {calc !== 'running' && (
          <button type="button" className="etichetta text-sm underline mt-2 min-h-[44px]" onClick={recompute}>
            RIPROVA ORA
          </button>
        )}
      </div>
    ) : walk.percorsoTipo === 'dritte' ? (
      <div className="bordo bg-nero text-cemento p-3 mb-4" role="status">
        <div className="etichetta text-sm">{calc === 'running' ? 'RICALCOLO…' : 'ALCUNI TRATTI SONO LINEE DRITTE: IL ROUTER NON HA RISPOSTO'}</div>
        {calc !== 'running' && (
          <button type="button" className="etichetta text-sm underline mt-2 min-h-[44px]" onClick={recompute} data-testid="riprova-strade">
            RIPROVA SULLE STRADE
          </button>
        )}
      </div>
    ) : null

  const next = () => {
    if (!walk.premiazioneFatta && nBangla > 0) go(`premiazione/${walk.id}`)
    else go(`punteggio/${walk.id}`)
  }

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom">
      <BackLink to="" label="← HOME" />
      <ScreenTitle kicker={new Date(walk.startedAt).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}>
        {walk.nome}
      </ScreenTitle>
      <RevealView bundle={bundle} status={status} />

      <div className="grid gap-4 mt-8">
        <Btn variant="ambra" className="w-full" onClick={next} testId="avanti-punteggio">
          {!walk.premiazioneFatta && nBangla > 0 ? 'PREMIAZIONE' : 'PUNTEGGIO FINALE'}
        </Btn>
        <div className="grid grid-cols-2 gap-4">
          <Btn variant="cemento" size="md" onClick={() => go(`modifica/${walk.id}`)} testId="modifica">
            SISTEMA
          </Btn>
          <Btn variant="muschio" size="md" onClick={() => setShare(true)} testId="condividi">
            CONDIVIDI
          </Btn>
        </div>
        <button
          type="button"
          className="etichetta text-xs underline min-h-[44px]"
          onClick={async () => {
            const json = await exportWalkJson(walk.id)
            // foglio di condivisione su iPhone (Salva su File, AirDrop…), download altrove
            await saveFile(new Blob([json], { type: 'application/json' }), `${fileBase(bundle)}.json`)
          }}
        >
          ESPORTA JSON (BACKUP E METRICHE)
        </button>
        <button type="button" className="etichetta text-sm underline min-h-[44px]" onClick={() => setElimina(true)} data-testid="rivela-elimina">
          ELIMINA QUESTA CAMMINATA
        </button>
      </div>
      {share && <ShareSheet bundle={bundle} onClose={() => setShare(false)} />}
      {elimina && (
        <ConfirmDelete
          names={[walk.nome]}
          onCancel={() => setElimina(false)}
          onConfirm={() => {
            const id = walk.id
            go('archivio', true)
            void deleteWalk(id)
          }}
        />
      )}
    </main>
  )
}

function ShareSheet({ bundle, onClose }: { bundle: NonNullable<ReturnType<typeof useBundle>>; onClose: () => void }) {
  const [nomi, setNomi] = useState(false)
  const [copied, setCopied] = useState(false)
  const url = shareUrl(encodeBundle(bundle, { nomiNegozi: nomi }))

  const send = async () => {
    if (isNative) {
      if (await nativeShareUrl(url, bundle.walk.nome)) return
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: bundle.walk.nome, url })
        return
      } catch {
        /* annullato: proviamo a copiare */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Sheet title="LINK PER IL GRUPPO" onClose={onClose}>
      <p className="mb-4">
        Link di sola lettura: i dati viaggiano dentro il link, non su un server, e la pagina non è indicizzata.
      </p>
      <label className="flex items-center justify-between gap-3 bordo p-3 mb-4">
        <span className="etichetta text-sm">MOSTRA I NOMI DEI NEGOZI</span>
        <input type="checkbox" className="w-7 h-7 accent-nero" checked={nomi} onChange={(e) => setNomi(e.target.checked)} data-testid="nomi-negozi" />
      </label>
      <p className="text-sm mb-4">{nomi ? 'Chi apre il link vede i nomi dei negozi.' : 'Nel link i negozi diventano “BANGLA 1, 2, 3…”.'}</p>
      <input readOnly value={url} className="bordo bg-schiuma w-full min-h-[48px] px-3 text-sm mb-4" onFocus={(e) => e.target.select()} aria-label="Link" data-testid="share-url" />
      <div className="grid gap-4 mb-3">
        <Btn variant="muschio" onClick={send}>{copied ? 'COPIATO' : 'MANDA IL LINK'}</Btn>
        <button type="button" className="etichetta underline min-h-[44px]" onClick={onClose}>CHIUDI</button>
      </div>
    </Sheet>
  )
}
