import { useCallback, useRef, useState } from 'react'
import { ACCURACY_LIMIT_M, GeoError, getBestFix, type Fix } from '../lib/geo'
import { Btn, Sheet } from './ui'

type State =
  | { phase: 'idle' }
  | { phase: 'reading'; label: string; best: Fix | null }
  | { phase: 'imprecise'; label: string; fix: Fix }
  | { phase: 'error'; label: string; message: string; denied: boolean }

/**
 * Lettura della posizione al tap (R7): fino a 10 s, tiene la più precisa;
 * oltre 50 m chiede "Riprova" o "Salva comunque". Restituisce null se l'utente rinuncia.
 */
export function useCapture(dark = false) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const resolver = useRef<((f: Fix | null) => void) | null>(null)
  const busy = useRef(false)

  const read = useCallback(async (label: string) => {
    setState({ phase: 'reading', label, best: null })
    try {
      const fix = await getBestFix({
        onProgress: (best) => setState((s) => (s.phase === 'reading' ? { ...s, best } : s)),
      })
      if (fix.accuracy > ACCURACY_LIMIT_M) {
        setState({ phase: 'imprecise', label, fix })
      } else {
        finish(fix)
      }
    } catch (e) {
      const ge = e instanceof GeoError ? e : null
      setState({
        phase: 'error',
        label,
        denied: ge?.code === 'denied',
        message:
          ge?.code === 'denied'
            ? 'IL TELEFONO NON CI DÀ LA POSIZIONE'
            : ge?.code === 'unsupported'
              ? 'QUESTO BROWSER NON DÀ LA POSIZIONE'
              : 'IL GPS NON RISPONDE',
      })
    }
  }, [])

  const finish = (f: Fix | null) => {
    busy.current = false
    setState({ phase: 'idle' })
    const r = resolver.current
    resolver.current = null
    r?.(f)
  }

  const capture = useCallback(
    (label: string): Promise<Fix | null> => {
      if (busy.current) return Promise.resolve(null)
      busy.current = true
      return new Promise((resolve) => {
        resolver.current = resolve
        void read(label)
      })
    },
    [read],
  )

  const overlay =
    state.phase === 'idle' ? null : state.phase === 'reading' ? (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-nero/70 px-6" role="status" aria-live="polite">
        <div className={`bordo shadow-pieno-lg p-6 w-full max-w-sm ${dark ? 'bg-nero text-cemento border-cemento' : 'bg-cemento'}`}>
          <div className="etichetta text-sm">{state.label}</div>
          <div className="titolo text-4xl mt-2">CERCO IL GPS…</div>
          <div className="etichetta text-sm mt-3">
            {state.best ? `PRECISIONE ±${state.best.accuracy} M` : 'NESSUNA LETTURA ANCORA'}
          </div>
        </div>
      </div>
    ) : state.phase === 'imprecise' ? (
      <Sheet title="GPS IMPRECISO" dark={dark}>
        <p className="text-lg mb-5">
          Precisione ±{state.fix.accuracy} m: il punto potrebbe finire nel palazzo sbagliato.
        </p>
        <div className="grid gap-4 mb-2">
          <Btn variant="ambra" testId="gps-riprova" onClick={() => void read(state.label)}>
            RIPROVA
          </Btn>
          <Btn variant={dark ? 'nero' : 'cemento'} className={dark ? 'border-cemento' : ''} testId="gps-salva-comunque" onClick={() => finish(state.fix)}>
            SALVA COMUNQUE
          </Btn>
          <button type="button" className="etichetta underline min-h-[44px]" onClick={() => finish(null)}>
            LASCIA STARE
          </button>
        </div>
      </Sheet>
    ) : (
      <Sheet title="NIENTE POSIZIONE" dark={dark}>
        <p className="titolo text-2xl mb-3">{state.message}</p>
        {state.denied ? (
          <p className="text-base mb-5">
            Serve la posizione per segnare i punti. Su iPhone: Impostazioni → Privacy → Localizzazione → Safari (o l’app) →
            “Mentre usi l’app”. Su Android: tocca il lucchetto nella barra dell’indirizzo → Autorizzazioni → Posizione.
          </p>
        ) : (
          <p className="text-base mb-5">Spostati all’aperto, lontano dai portici, e riprova.</p>
        )}
        <div className="grid gap-4 mb-2">
          <Btn variant="ambra" testId="gps-riprova" onClick={() => void read(state.label)}>
            RIPROVA
          </Btn>
          <button type="button" className="etichetta underline min-h-[44px]" onClick={() => finish(null)}>
            LASCIA STARE
          </button>
        </div>
      </Sheet>
    )

  return { capture, overlay, busy: state.phase !== 'idle' }
}
