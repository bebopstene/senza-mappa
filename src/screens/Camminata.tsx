// Schermata di camminata, alla cieca (R4): solo tempo, contatori e pulsanti. Variante notte.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting, type Bagno, type Bangla, type Point, type Walk } from '../db/schema'
import { go } from '../router'
import { distanceM, getBestFix, ACCURACY_LIMIT_M, MIN_SCORING_DISTANCE_M } from '../lib/geo'
import {
  addDrink,
  addParticipantMidWalk,
  addPoint,
  checkInBagno,
  checkInBangla,
  closeWalk,
  computeWalkRoute,
  deletePoint,
  lastPoint,
  nameBangla,
  removeDrinks,
  setPassanteAsker,
  setVote,
  updateBagno,
} from '../lib/walks'
import { nearbyShops, type ShopSuggestion } from '../lib/overpass'
import { beep, canVibrate, setWakeLock, unlockAudio, vibrate, wakeLockSupported } from '../lib/feedback'
import { useCapture } from '../components/useCapture'
import { Btn, Counter, HoldButton, MugIcon, FlagIcon, PersonIcon, WcIcon, Sheet, Stamp, UndoBar, VoteBlocks, useStamp } from '../components/ui'
import { WalkMap } from '../components/WalkMap'
import { FogMap } from '../components/FogMap'

const UNDO_MS = 5000
const LOST_MAP_MS = 30_000

type Flow =
  | null
  | { step: 'nome'; point: Point; bangla: Bangla; giaVisto: boolean }
  | { step: 'birre'; point: Point; banglaId: string }
  | { step: 'voto'; point: Point; banglaId: string }
  | { step: 'passante'; point: Point }
  | { step: 'bagno'; point: Point; bagno: Bagno; giaVisto: boolean }
  | { step: 'perso-chiedi' }
  | { step: 'perso-umano' }
  | { step: 'perso-mappa'; point: Point; until: number }
  | { step: 'menu' }
  | { step: 'giocatore' }
  | { step: 'nebbia' }

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function Camminata({ walk }: { walk: Walk }) {
  const now = useNow()
  const points = useLiveQuery(() => db.points.where({ walkId: walk.id }).sortBy('createdAt'), [walk.id], [] as Point[])
  const participants = useLiveQuery(
    () => db.participants.where({ walkId: walk.id }).sortBy('ordine'),
    [walk.id],
    [],
  )
  const { capture, overlay, busy } = useCapture(true)
  const [flow, setFlow] = useState<Flow>(null)
  const [stamp, showStamp] = useStamp()
  const [undo, setUndo] = useState<{ pointId: string; label: string; until: number } | null>(null)
  const [alarm, setAlarm] = useState(0)
  const [reminderMin, setReminderMin] = useState(10)
  const [wake, setWake] = useState(false)
  const [wakeError, setWakeError] = useState(false)
  /** mappa nella nebbia: si può spegnere dal menu */
  const [nebbia, setNebbia] = useState(true)
  const [closing, setClosing] = useState(false)
  const autoBusy = useRef(false)
  /** un'azione alla volta: tap doppi non creano punti doppi */
  const acting = useRef(false)
  const once = (fn: () => Promise<void>) => async () => {
    if (acting.current) return
    acting.current = true
    try {
      await fn()
    } finally {
      // breve pausa: il secondo tap di un doppio tap arriva dopo il salvataggio
      setTimeout(() => {
        acting.current = false
      }, 700)
    }
  }
  const busyRef = useRef(false)
  busyRef.current = busy
  /** dopo un tap o un annulla niente checkpoint automatico per un po' */
  const lastManual = useRef(0)
  const lastReminder = useRef(Date.now())

  const banglaCount = new Set(points.filter((p) => p.tipo === 'bangla').map((p) => p.banglaId)).size
  const checkpointCount = points.filter((p) => p.tipo === 'checkpoint' || p.tipo === 'checkpoint-auto').length
  const passantiCount = points.filter((p) => p.tipo === 'passante').length

  useEffect(() => {
    getSetting('reminderMin', 10).then(setReminderMin)
    getSetting('nebbia', true).then(setNebbia)
    getSetting('wakeLock', false).then((on) => {
      setWake(on)
      if (on) void setWakeLock(true)
    })
    return () => void setWakeLock(false)
  }, [])

  // l'annulla resta 5 secondi
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()))
    return () => clearTimeout(t)
  }, [undo])

  const offerUndo = (pointId: string, label: string) => setUndo({ pointId, label, until: Date.now() + UNDO_MS })

  // --- promemoria checkpoint (R9) ---
  useEffect(() => {
    if (!reminderMin) return
    const lastAt = points.length ? points[points.length - 1].createdAt : walk.startedAt
    const since = Math.max(lastAt, lastReminder.current)
    if (now - since >= reminderMin * 60_000 && document.visibilityState === 'visible') {
      lastReminder.current = now
      setAlarm((a) => a + 1)
      if (!vibrate([250, 120, 250, 120, 250])) {
        beep(160, 880)
        setTimeout(() => beep(160, 660), 220)
      }
    }
  }, [now, reminderMin, points, walk.startedAt])

  // --- checkpoint automatico alla riapertura (R27) ---
  const tryAutoCheckpoint = useCallback(async () => {
    if (autoBusy.current || busyRef.current) return
    if (Date.now() - lastManual.current < 60_000) return
    autoBusy.current = true
    const prev = await lastPoint(walk.id)
    if (prev && Date.now() - prev.createdAt < 60_000) {
      autoBusy.current = false
      return
    }
    try {
      const fix = await getBestFix({ maxMs: 10_000, goodEnoughM: 20 })
      if (fix.accuracy > ACCURACY_LIMIT_M) return
      if (busyRef.current || Date.now() - lastManual.current < 60_000) return
      const last = await lastPoint(walk.id)
      if (last && distanceM(last, fix) < MIN_SCORING_DISTANCE_M) return
      if (last && Date.now() - last.createdAt < 60_000) return
      const fresh = await db.walks.get(walk.id)
      if (fresh?.stato !== 'attiva') return
      const p = await addPoint(walk.id, 'checkpoint-auto', fix)
      showStamp('AUTO', 1400)
      offerUndo(p.id, 'CHECKPOINT AUTOMATICO')
    } catch {
      /* silenzioso: è automatico */
    } finally {
      autoBusy.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk.id])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void tryAutoCheckpoint()
    }
    document.addEventListener('visibilitychange', onVis)
    // anche alla ripresa dopo chiusura del browser: solo al montaggio
    const t = setTimeout(() => void tryAutoCheckpoint(), 1500)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearTimeout(t)
    }
  }, [tryAutoCheckpoint])

  // --- azioni ---
  const doCheckpoint = once(async () => {
    unlockAudio()
    lastManual.current = Date.now()
    const fix = await capture('CHECKPOINT')
    if (!fix) return
    const p = await addPoint(walk.id, 'checkpoint', fix)
    lastReminder.current = Date.now()
    showStamp('SEGNATO')
    offerUndo(p.id, 'CHECKPOINT SEGNATO')
  })

  const doBangla = once(async () => {
    unlockAudio()
    lastManual.current = Date.now()
    const fix = await capture('BANGLA')
    if (!fix) return
    const r = await checkInBangla(walk.id, fix)
    lastReminder.current = Date.now()
    setUndo(null)
    setFlow({ step: 'nome', point: r.point, bangla: r.bangla, giaVisto: r.giaVisto })
  })

  const doBagno = once(async () => {
    unlockAudio()
    lastManual.current = Date.now()
    const fix = await capture('BAGNO')
    if (!fix) return
    const r = await checkInBagno(walk.id, fix)
    lastReminder.current = Date.now()
    setUndo(null)
    setFlow({ step: 'bagno', point: r.point, bagno: r.bagno, giaVisto: r.giaVisto })
  })

  const doPassante = once(async () => {
    unlockAudio()
    lastManual.current = Date.now()
    const fix = await capture('PASSANTE')
    if (!fix) return
    const p = await addPoint(walk.id, 'passante', fix)
    lastReminder.current = Date.now()
    setUndo(null)
    setFlow({ step: 'passante', point: p })
  })

  const doLost = async () => {
    const fix = await capture('MI SONO PERSO')
    if (!fix) {
      setFlow(null)
      return
    }
    const p = await addPoint(walk.id, 'perso', fix)
    setFlow({ step: 'perso-mappa', point: p, until: Date.now() + LOST_MAP_MS })
  }

  const endBanglaFlow = (point: Point, banglaId: string) => {
    setFlow(null)
    const n = new Set(
      [...points.filter((p) => p.tipo === 'bangla').map((p) => p.banglaId), banglaId],
    ).size
    showStamp(`BANGLA ${n}`)
    offerUndo(point.id, `BANGLA ${n} SEGNATO`)
  }

  const doClose = async () => {
    if (closing) return
    setClosing(true)
    setUndo(null)
    let fix = null
    try {
      fix = await getBestFix({ maxMs: 6000, goodEnoughM: 25 })
      if (fix.accuracy > 150) fix = null
    } catch {
      fix = null
    }
    try {
      await closeWalk(walk.id, fix)
    } catch {
      setClosing(false)
      showStamp('NON CHIUSA, RIPROVA', 2000)
      return
    }
    go(`rivela/${walk.id}`, true)
    void computeWalkRoute(walk.id).catch(() => {})
  }

  const toggleWake = async () => {
    const next = !wake
    const ok = await setWakeLock(next)
    setWake(next && ok)
    setWakeError(next && !ok)
    await setSetting('wakeLock', next && ok)
  }

  const lostRemaining = flow?.step === 'perso-mappa' ? Math.max(0, flow.until - now) : 0
  useEffect(() => {
    if (flow?.step === 'perso-mappa' && lostRemaining <= 0) setFlow(null)
  }, [flow, lostRemaining])

  return (
    <main className="min-h-screen bg-nero text-cemento px-4 safe-top flex flex-col">
      {alarm > 0 && (
        <div
          key={alarm}
          className="allarme fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
          onAnimationEnd={() => setAlarm(0)}
          role="alert"
        >
          <span className="titolo text-6xl text-rosso-linea bg-cemento bordo px-4 py-2 -rotate-6">CHECKPOINT?</span>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="etichetta text-xs truncate max-w-[60vw]">{walk.nome}</div>
          <div className="titolo text-[clamp(48px,16vw,112px)] tabular-nums mt-1 pr-2" data-testid="timer" aria-label="Tempo trascorso">
            {elapsed(now - walk.startedAt)}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFlow({ step: 'menu' })}
            className="bordo border-cemento etichetta text-sm min-h-[48px] px-3"
            aria-label="Menu"
            data-testid="menu"
          >
            MENU
          </button>
          {nebbia && (
            <button
              type="button"
              onClick={() => setFlow({ step: 'nebbia' })}
              className="bordo border-cemento bg-cemento text-nero etichetta text-sm min-h-[48px] px-3"
              data-testid="btn-nebbia"
            >
              NEBBIA
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 my-5">
        <Counter dark label="BANGLA" value={banglaCount} />
        <Counter dark label="CHECK" value={checkpointCount} />
        <Counter dark label="PASSANTI" value={passantiCount} />
      </div>

      <div className="grid gap-5">
        <Btn variant="ambra" size="xl" className="w-full border-cemento shadow-pieno-cemento" onClick={doBangla} disabled={busy} testId="btn-bangla">
          <MugIcon size={52} /> BANGLA
        </Btn>
        <Btn variant="cemento" size="xl" className="w-full shadow-pieno-cemento" onClick={doCheckpoint} disabled={busy} testId="btn-checkpoint">
          <FlagIcon size={40} /> CHECKPOINT
        </Btn>
        <div className="grid grid-cols-2 gap-4">
          <Btn variant="nero" size="md" className="w-full border-cemento shadow-pieno-cemento" onClick={doPassante} disabled={busy} testId="btn-passante">
            <PersonIcon size={26} color="#D6D3CB" /> PASSANTE
          </Btn>
          <Btn variant="muschio" size="md" className="w-full border-cemento shadow-pieno-cemento" onClick={doBagno} disabled={busy} testId="btn-bagno">
            <WcIcon size={26} /> BAGNO
          </Btn>
        </div>
      </div>

      {/* Chiudi in basso, lontano dal pollice, solo con pressione prolungata (R19) */}
      <div className="mt-auto pt-10 safe-bottom">
        <HoldButton onHold={doClose} className="w-full" testId="btn-chiudi">
          {closing ? 'CHIUDO…' : 'TIENI PREMUTO PER CHIUDERE'}
        </HoldButton>
      </div>

      {undo && !flow && (
        <UndoBar
          dark
          label={undo.label}
          onUndo={async () => {
            const id = undo.pointId
            lastManual.current = Date.now()
            setUndo(null)
            await deletePoint(id)
            showStamp('ANNULLATO', 900)
          }}
        />
      )}

      {flow?.step === 'nome' && (
        <NameSheet
          flow={flow}
          onCancel={async () => {
            lastManual.current = Date.now()
            setFlow(null)
            await deletePoint(flow.point.id)
            showStamp('ANNULLATO', 900)
          }}
          onDone={async () => {
            // dare un nome può ricollegare il check-in a un altro bangla: rileggiamo il punto
            const fresh = await db.points.get(flow.point.id)
            setFlow({ step: 'birre', point: flow.point, banglaId: fresh?.banglaId ?? flow.point.banglaId! })
          }}
        />
      )}
      {flow?.step === 'birre' && (
        <DrinksSheet
          walkId={walk.id}
          banglaId={flow.banglaId}
          participants={participants}
          onDone={async () => {
            // il bangla può essere stato ricollegato a uno già in archivio
            const fresh = await db.points.get(flow.point.id)
            setFlow({ step: 'voto', point: flow.point, banglaId: fresh?.banglaId ?? flow.banglaId })
          }}
        />
      )}
      {flow?.step === 'voto' && (
        <VoteSheet
          walkId={walk.id}
          banglaId={flow.banglaId}
          onDone={() => endBanglaFlow(flow.point, flow.banglaId)}
        />
      )}
      {flow?.step === 'bagno' && (
        <BagnoSheet
          flow={flow}
          onCancel={async () => {
            lastManual.current = Date.now()
            setFlow(null)
            await deletePoint(flow.point.id)
            showStamp('ANNULLATO', 900)
          }}
          onDone={() => {
            setFlow(null)
            showStamp('BAGNO')
            offerUndo(flow.point.id, 'SOSTA BAGNO SEGNATA')
          }}
        />
      )}
      {flow?.step === 'passante' && (
        <Sheet title="CHI HA CHIESTO?" dark>
          <button
            type="button"
            className="etichetta underline min-h-[44px] mb-3 mr-6 text-ambra"
            data-testid="annulla-passante"
            onClick={async () => {
              lastManual.current = Date.now()
              setFlow(null)
              await deletePoint(flow.point.id)
              showStamp('ANNULLATO', 900)
            }}
          >
            ANNULLA PASSANTE
          </button>
          <button
            type="button"
            className="etichetta underline min-h-[44px] mb-3"
            data-testid="salta"
            onClick={() => {
              setFlow(null)
              showStamp('PASSANTE')
              offerUndo(flow.point.id, 'PASSANTE SEGNATO')
            }}
          >
            SALTA
          </button>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {participants.map((p) => (
              <Btn
                key={p.id}
                variant="nero"
                size="md"
                className="border-cemento shadow-pieno-cemento"
                onClick={async () => {
                  await setPassanteAsker(flow.point.id, p.id)
                  setFlow(null)
                  showStamp('PASSANTE')
                  offerUndo(flow.point.id, `PASSANTE · ${p.soprannome}`)
                }}
              >
                {p.soprannome}
              </Btn>
            ))}
          </div>
        </Sheet>
      )}
      {flow?.step === 'menu' && (
        <Sheet title="MENU" dark onClose={() => setFlow(null)}>
          <div className="grid gap-4 mb-4">
            <Btn
              variant="cemento"
              size="lg"
              className="border-cemento"
              onClick={() => setFlow({ step: 'giocatore' })}
              disabled={participants.length >= 12}
              testId="menu-giocatore"
            >
              {participants.length >= 12 ? 'SQUADRA PIENA (12)' : '+ GIOCATORE'}
            </Btn>
            <Btn variant="nero" size="lg" className="border-rosso-linea text-rosso-linea shadow-pieno-cemento" onClick={() => setFlow({ step: 'perso-chiedi' })} testId="mi-sono-perso">
              MI SONO PERSO
            </Btn>
            <div className="bordo border-cemento p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="etichetta text-sm">SCHERMO SEMPRE ACCESO</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={wake}
                  disabled={!wakeLockSupported()}
                  onClick={toggleWake}
                  className={`bordo border-cemento etichetta min-h-[44px] min-w-[72px] ${wake ? 'bg-ambra text-nero' : 'bg-nero text-cemento'}`}
                  data-testid="wake-toggle"
                >
                  {wake ? 'SÌ' : 'NO'}
                </button>
              </div>
              {!wakeLockSupported() && <p className="text-sm mt-2">Questo browser non lo supporta.</p>}
              {wakeError && <p className="text-sm mt-2 text-ambra">Il telefono ha detto no (risparmio energetico?). Riprova.</p>}
            </div>
            <div className="bordo border-cemento p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="etichetta text-sm">MAPPA NELLA NEBBIA</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={nebbia}
                  onClick={() => {
                    setNebbia(!nebbia)
                    void setSetting('nebbia', !nebbia)
                  }}
                  className={`bordo border-cemento etichetta min-h-[44px] min-w-[72px] ${nebbia ? 'bg-ambra text-nero' : 'bg-nero text-cemento'}`}
                  data-testid="nebbia-toggle"
                >
                  {nebbia ? 'SÌ' : 'NO'}
                </button>
              </div>
              <p className="text-sm mt-2">Scopre solo un quadratino da 50 m per ogni punto segnato, molto da vicino. Niente percorso, niente nomi di vie.</p>
            </div>
            <div className="bordo border-cemento p-3">
              <div className="etichetta text-sm mb-2">
                PROMEMORIA CHECKPOINT {canVibrate() ? '(VIBRA)' : '(FLASH + SUONO)'}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[0, 5, 10, 15, 20].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setReminderMin(m)
                      void setSetting('reminderMin', m)
                    }}
                    aria-pressed={reminderMin === m}
                    className={`bordo border-cemento etichetta min-h-[44px] ${reminderMin === m ? 'bg-ambra text-nero' : ''}`}
                  >
                    {m === 0 ? 'OFF' : `${m}′`}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="etichetta underline min-h-[44px]" onClick={() => setFlow(null)}>
              CHIUDI MENU
            </button>
          </div>
        </Sheet>
      )}
      {flow?.step === 'perso-chiedi' && (
        <Sheet title="AVETE CHIESTO A UN PASSANTE?" dark onClose={() => setFlow(null)}>
          <p className="mb-5">“Mi sono perso” è l’ultima risorsa: mostra dove siete per 30 secondi e costa 15 punti.</p>
          <div className="grid gap-4 mb-4">
            <Btn variant="nero" className="border-rosso-linea text-rosso-linea shadow-pieno-cemento" onClick={doLost} testId="perso-conferma">
              SÌ, E NON È BASTATO
            </Btn>
            <Btn variant="ambra" className="border-cemento" onClick={() => setFlow({ step: 'perso-umano' })} testId="perso-no">
              NO, NON ANCORA
            </Btn>
          </div>
        </Sheet>
      )}
      {flow?.step === 'perso-umano' && (
        <Sheet title="CHIEDI A UN UMANO" dark onClose={() => setFlow(null)}>
          <p className="mb-5">Fermate qualcuno, chiedete la strada e segnatelo con PASSANTE. Vale 5 punti, non ne toglie 15.</p>
          <div className="grid gap-4 mb-4">
            <Btn variant="ambra" className="border-cemento" onClick={() => setFlow(null)}>
              OK, CHIEDIAMO
            </Btn>
          </div>
        </Sheet>
      )}
      {flow?.step === 'giocatore' && (
        <NuovoGiocatore
          team={participants.map((p) => p.soprannome)}
          onCancel={() => setFlow(null)}
          onAdd={async (nome) => {
            lastManual.current = Date.now()
            const fix = await capture(`ENTRA ${nome}`)
            const r = await addParticipantMidWalk(walk.id, nome, fix)
            setFlow(null)
            showStamp(`+ ${r.participant.soprannome}`)
            if (r.point) offerUndo(r.point.id, `${r.participant.soprannome} AGGIUNTO`)
          }}
        />
      )}
      {flow?.step === 'nebbia' && <FogMap points={points} onClose={() => setFlow(null)} />}
      {flow?.step === 'perso-mappa' && (
        <div className="fixed inset-0 z-30 bg-nero flex flex-col safe-top safe-bottom px-4" role="dialog" aria-label="Posizione per 30 secondi">
          <div className="flex items-center justify-between mb-3">
            <span className="titolo text-3xl text-rosso-linea">SIETE QUI</span>
            <span className="titolo text-4xl tabular-nums" data-testid="perso-countdown">{Math.min(30, Math.ceil(lostRemaining / 1000))}</span>
          </div>
          <WalkMap
            className="flex-1"
            markers={[{ id: flow.point.id, lat: flow.point.lat, lng: flow.point.lng, kind: 'qui', title: 'Siete qui' }]}
            zoom={16}
          />
          <Btn variant="cemento" className="w-full mt-4" onClick={() => setFlow(null)}>
            BASTA, HO CAPITO
          </Btn>
        </div>
      )}

      {overlay}
      {stamp && <Stamp text={stamp} small={stamp === 'AUTO' || stamp === 'ANNULLATO'} />}
    </main>
  )
}

function NameSheet({
  flow,
  onDone,
  onCancel,
}: {
  flow: { point: Point; bangla: Bangla; giaVisto: boolean }
  onDone: () => void
  onCancel: () => void
}) {
  const [shops, setShops] = useState<ShopSuggestion[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    let alive = true
    nearbyShops(flow.point.lat, flow.point.lng)
      .then((s) => alive && setShops(s))
      .catch(() => {
        if (!alive) return
        setFailed(true)
        setShops([])
      })
    return () => {
      alive = false
    }
  }, [flow.point.lat, flow.point.lng])

  const pick = async (nome: string, osmId: string | null, pos?: { lat: number; lng: number }) => {
    await nameBangla(flow.point.id, nome, osmId, pos)
    onDone()
  }

  const known = flow.giaVisto && flow.bangla.nome
  const list = (shops ?? []).filter((s) => !(known && s.osmId === flow.bangla.osmId))

  return (
    <Sheet title="BIRRA QUI" dark>
      <div className="sticky top-0 bg-nero pb-3 z-10">
        <Btn variant="nero" size="md" className="w-full border-cemento shadow-pieno-cemento" onClick={onDone} testId="salta">
          SALTA
        </Btn>
        <button type="button" className="etichetta text-sm underline text-ambra min-h-[44px] mt-2" onClick={onCancel} data-testid="annulla-checkin">
          TAP SBAGLIATO? ANNULLA CHECK-IN
        </button>
      </div>
      <div className="grid gap-3 mb-4">
        {known && (
          <Btn variant="muschio" size="md" className="w-full border-cemento justify-start text-left" onClick={onDone} testId="gia-visto">
            {flow.bangla.daProvare ? 'ERA DA PROVARE' : 'GIÀ VISTO'}: {flow.bangla.nome}
          </Btn>
        )}
        {shops === null && <p className="etichetta text-sm py-3">CERCO NEGOZI VICINI…</p>}
        {list.map((s) => (
          <Btn
            key={s.osmId}
            variant="cemento"
            size="md"
            className="w-full shadow-pieno-cemento"
            onClick={() => pick(s.nome, s.osmId, s)}
          >
            <span className="flex-1 text-left break-words">{s.nome}</span>
            <span className="etichetta text-xs">{s.distanza} M</span>
          </Btn>
        ))}
        {shops !== null && list.length === 0 && !known && (
          <p className="etichetta text-sm">{failed ? 'OSM NON RISPONDE: SCRIVILO TU' : 'NESSUN NEGOZIO IN MAPPA QUI'}</p>
        )}
      </div>
      {/* il nome si può scrivere subito, senza aspettare OSM */}
      <form
        className="flex gap-3 mb-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) void pick(text, null)
        }}
      >
        <label htmlFor="nome-bangla" className="sr-only">Nome del bangla</label>
        <input
          id="nome-bangla"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="SCRIVI IL NOME"
          maxLength={60}
          autoComplete="off"
          className="bordo border-cemento bg-nero text-cemento flex-1 min-w-0 min-h-[52px] px-3 etichetta placeholder:text-cemento/50"
          data-testid="input-nome-bangla"
        />
        <Btn type="submit" variant="ambra" size="md" className="border-cemento" disabled={!text.trim()}>
          OK
        </Btn>
      </form>
    </Sheet>
  )
}

function DrinksSheet({
  walkId,
  banglaId,
  participants,
  onDone,
}: {
  walkId: string
  banglaId: string
  participants: { id: string; soprannome: string }[]
  onDone: () => void
}) {
  const [history, setHistory] = useState<string[][]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})

  const bump = (pids: string[], delta: number) =>
    setCounts((c) => {
      const n = { ...c }
      for (const p of pids) n[p] = Math.max(0, (n[p] ?? 0) + delta)
      return n
    })

  const tap = async (pids: string[]) => {
    const ids: string[] = []
    for (const p of pids) ids.push(await addDrink(walkId, banglaId, p))
    setHistory((h) => [...h, ids])
    bump(pids, 1)
  }

  const undoLast = async () => {
    const last = history[history.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    const rows = await db.drinks.bulkGet(last)
    await removeDrinks(last)
    bump(rows.filter(Boolean).map((r) => r!.participantId), -1)
  }

  return (
    <Sheet title="CHI BEVE?" dark>
      <p className="etichetta text-xs mb-4">TAP = +1 BIRRA · SOLO RIEPILOGO, NON FA PUNTI</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {participants.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              vibrate(15)
              void tap([p.id])
            }}
            className="premuto bordo border-cemento shadow-pieno-cemento bg-nero text-cemento min-h-[64px] px-3 flex items-center justify-between gap-2"
            data-testid={`birra-${p.soprannome}`}
          >
            <span className="titolo text-xl break-all text-left">{p.soprannome}</span>
            <span className="titolo text-2xl text-ambra tabular-nums">{counts[p.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Btn variant="ambra" size="md" className="border-cemento" onClick={() => tap(participants.map((p) => p.id))} testId="birra-tutti">
          TUTTI +1
        </Btn>
        <Btn variant="nero" size="md" className="border-cemento" disabled={!history.length} onClick={undoLast} testId="birra-annulla">
          ANNULLA
        </Btn>
      </div>
      <Btn variant="cemento" className="w-full mb-3" onClick={onDone} testId="birre-fatto">
        {Object.values(counts).some((x) => x > 0) ? 'FATTO' : 'SALTA'}
      </Btn>
    </Sheet>
  )
}

function VoteSheet({ walkId, banglaId, onDone }: { walkId: string; banglaId: string; onDone: () => void }) {
  return (
    <Sheet title="VOTO DEL BANGLA" dark>
      <p className="etichetta text-xs mb-4">UN SOLO VOTO DEL GRUPPO · TAP PER SALVARE</p>
      <div className="mb-6">
        <VoteBlocks
          dark
          value={null}
          onChange={async (v) => {
            await setVote(walkId, banglaId, v)
            onDone()
          }}
        />
      </div>
      <Btn variant="nero" className="w-full border-cemento mb-3" onClick={onDone} testId="salta">
        SALTA
      </Btn>
    </Sheet>
  )
}

function BagnoSheet({
  flow,
  onDone,
  onCancel,
}: {
  flow: { point: Point; bagno: Bagno; giaVisto: boolean }
  onDone: () => void
  onCancel: () => void
}) {
  const [nome, setNome] = useState('')
  const save = async (gratis: boolean | null) => {
    const patch: Parameters<typeof updateBagno>[1] = {}
    if (gratis !== null) patch.gratis = gratis
    if (nome.trim()) patch.nome = nome
    if (Object.keys(patch).length) await updateBagno(flow.bagno.id, patch)
    onDone()
  }
  return (
    <Sheet title="BAGNO QUI" dark>
      <div className="sticky top-0 bg-nero pb-3 z-10">
        <Btn variant="nero" size="md" className="w-full border-cemento shadow-pieno-cemento" onClick={() => void save(null)} testId="salta">
          SALTA
        </Btn>
        <button type="button" className="etichetta text-sm underline text-ambra min-h-[44px] mt-2" onClick={onCancel} data-testid="annulla-bagno">
          TAP SBAGLIATO? ANNULLA
        </button>
      </div>
      {flow.giaVisto && (
        <p className="etichetta text-sm mb-4" data-testid="bagno-gia-visto">
          GIÀ IN MAPPA{flow.bagno.nome ? `: ${flow.bagno.nome}` : ''}
          {flow.bagno.gratis === true ? ' · GRATIS' : flow.bagno.gratis === false ? ' · A PAGAMENTO' : ''}
        </p>
      )}
      <label htmlFor="nome-bagno" className="etichetta text-sm">DOVE (FACOLTATIVO)</label>
      <input
        id="nome-bagno"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder={flow.bagno.nome || 'BAR, PARCO, STAZIONE…'}
        maxLength={60}
        autoComplete="off"
        className="bordo border-cemento bg-nero text-cemento w-full min-h-[52px] px-3 etichetta placeholder:text-cemento/50 mt-2 mb-5"
        data-testid="input-nome-bagno"
      />
      <div className="etichetta text-sm mb-3">SI PAGA?</div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Btn variant="ambra" size="md" className="border-cemento" onClick={() => void save(true)} testId="bagno-gratis">
          GRATIS
        </Btn>
        <Btn variant="nero" size="md" className="border-cemento shadow-pieno-cemento" onClick={() => void save(false)} testId="bagno-pagamento">
          A PAGAMENTO
        </Btn>
      </div>
    </Sheet>
  )
}

function NuovoGiocatore({
  team,
  onAdd,
  onCancel,
}: {
  team: string[]
  onAdd: (nome: string) => Promise<void>
  onCancel: () => void
}) {
  const [nome, setNome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const clean = nome.trim().replace(/\s+/g, ' ').toUpperCase()

  const submit = async () => {
    if (!clean || saving) return
    if (team.includes(clean)) return setError('C’È GIÀ')
    setSaving(true)
    try {
      await onAdd(clean)
    } catch (e) {
      setError(e instanceof Error ? e.message.toUpperCase() : 'ERRORE')
      setSaving(false)
    }
  }

  return (
    <Sheet title="ENTRA UN GIOCATORE" dark onClose={onCancel}>
      <p className="mb-4">Segniamo dove e quando entra: alla fine lo vedete sulla mappa.</p>
      <form
        className="flex gap-3 mb-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor="nuovo-giocatore" className="sr-only">Soprannome</label>
        <input
          id="nuovo-giocatore"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value)
            setError(null)
          }}
          placeholder="SOPRANNOME"
          maxLength={16}
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="done"
          className="bordo border-cemento bg-nero text-cemento flex-1 min-w-0 min-h-[56px] px-3 text-lg etichetta placeholder:text-cemento/50"
          data-testid="input-nuovo-giocatore"
        />
        <Btn type="submit" variant="ambra" size="md" className="border-cemento" disabled={!clean || saving} testId="conferma-giocatore">
          ENTRA
        </Btn>
      </form>
      <p className="etichetta text-sm min-h-6 text-ambra mb-3" role="alert">{error}</p>
      <p className="etichetta text-xs mb-4">IN SQUADRA: {team.join(' · ')}</p>
      <button type="button" className="etichetta underline min-h-[44px] mb-3" onClick={onCancel}>
        LASCIA STARE
      </button>
    </Sheet>
  )
}
