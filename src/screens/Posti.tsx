// I posti: bangla (visti e da provare) e bagni, su lista e mappa, anche senza fare una camminata.
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Map as MlMap } from 'maplibre-gl'
import { db } from '../db/schema'
import { BackLink, Btn, ScreenTitle, Sheet, Stamp, useStamp } from '../components/ui'
import { WalkMap, type MapMarker } from '../components/WalkMap'
import { CATEGORIE } from '../components/RevealView'
import { useCapture } from '../components/useCapture'
import { addSavedBagno, addSavedBangla, removeSavedPlace, updateBagno, updateBangla } from '../lib/walks'

type Filtro = 'tutti' | 'bangla' | 'da-provare' | 'bagni'

interface Riga {
  kind: 'bangla' | 'bagno'
  id: string
  nome: string
  lat: number
  lng: number
  // bangla
  visite?: number
  daProvare?: boolean
  media?: number | null
  premi?: string[]
  // bagno
  gratis?: boolean | null
  soste?: number
}

const FILTRI: { id: Filtro; label: string }[] = [
  { id: 'tutti', label: 'TUTTI' },
  { id: 'bangla', label: 'BANGLA' },
  { id: 'da-provare', label: 'DA PROVARE' },
  { id: 'bagni', label: 'BAGNI' },
]

const gratisLabel = (g: boolean | null | undefined) => (g === true ? 'GRATIS' : g === false ? 'A PAGAMENTO' : 'NON SI SA SE È GRATIS')

export default function Posti() {
  const data = useLiveQuery(async () => {
    const [bangla, bagni, points, reviews, awards, active] = await Promise.all([
      db.bangla.toArray(),
      db.bagni.toArray(),
      db.points.filter((p) => !!p.banglaId || !!p.bagnoId).toArray(),
      db.reviews.toArray(),
      db.awards.toArray(),
      db.walks.where('stato').equals('attiva').count(),
    ])
    return { bangla, bagni, points, reviews, awards, active: active > 0 }
  }, [])
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [aperto, setAperto] = useState<string | null>(null)
  const [pick, setPick] = useState(false)
  const [nuovo, setNuovo] = useState<{ lat: number; lng: number } | null>(null)
  const [map, setMap] = useState<MlMap | null>(null)
  const [stamp, showStamp] = useStamp()
  const { capture, overlay } = useCapture()

  const righe = useMemo<Riga[]>(() => {
    if (!data) return []
    const banglaRows: Riga[] = data.bangla
      .map((b) => {
        const visite = new Set(data.points.filter((p) => p.banglaId === b.id && p.tipo === 'bangla').map((p) => p.walkId)).size
        const votes = data.reviews.filter((r) => r.banglaId === b.id).map((r) => r.voto)
        return {
          kind: 'bangla' as const,
          id: b.id,
          nome: b.nome,
          lat: b.lat,
          lng: b.lng,
          visite,
          daProvare: visite === 0 && !!b.daProvare,
          media: votes.length ? votes.reduce((s, v) => s + v, 0) / votes.length : null,
          premi: data.awards.filter((a) => a.banglaId === b.id).map((a) => CATEGORIE.find((c) => c.id === a.categoria)?.nome ?? a.categoria),
          salvato: !!b.salvato,
        }
      })
      .filter((b) => b.visite > 0 || b.salvato)
    const bagnoRows: Riga[] = data.bagni.map((b) => ({
      kind: 'bagno',
      id: b.id,
      nome: b.nome,
      lat: b.lat,
      lng: b.lng,
      gratis: b.gratis,
      soste: data.points.filter((p) => p.bagnoId === b.id).length,
    }))
    return [...banglaRows, ...bagnoRows]
  }, [data])

  const visibili = righe.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'bagni' ? r.kind === 'bagno' : filtro === 'bangla' ? r.kind === 'bangla' : r.kind === 'bangla' && r.daProvare,
  )
  const ordinate = [...visibili].sort((a, z) => {
    if (a.kind !== z.kind) return a.kind === 'bangla' ? -1 : 1
    if (a.kind === 'bangla') return (z.media ?? -1) - (a.media ?? -1) || (a.nome || '~').localeCompare(z.nome || '~')
    return Number(z.gratis === true) - Number(a.gratis === true) || (a.nome || '~').localeCompare(z.nome || '~')
  })

  const markers: MapMarker[] = visibili.map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    kind: r.kind === 'bagno' ? 'bagno' : r.daProvare ? 'da-provare' : 'archivio',
    label: r.kind === 'bagno' ? 'WC' : undefined,
    title: r.kind === 'bagno' ? `${r.nome || 'Bagno'} · ${gratisLabel(r.gratis).toLowerCase()}` : r.nome || 'Bangla senza nome',
  }))

  const addHere = async () => {
    const fix = await capture('DOVE SONO')
    if (fix) setNuovo({ lat: fix.lat, lng: fix.lng })
  }

  if (!data) return <main className="min-h-screen cemento-texture" />
  const nBangla = righe.filter((r) => r.kind === 'bangla').length
  const nBagni = righe.filter((r) => r.kind === 'bagno').length
  const nGratis = righe.filter((r) => r.kind === 'bagno' && r.gratis === true).length

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom">
      <BackLink to="" />
      <ScreenTitle kicker={`${nBangla} BANGLA · ${nBagni} ${nBagni === 1 ? 'BAGNO' : 'BAGNI'}, ${nGratis} GRATIS`}>I POSTI</ScreenTitle>

      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Filtra">
        {FILTRI.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`bordo etichetta text-sm min-h-[44px] px-3 ${filtro === f.id ? 'bg-nero text-cemento' : 'bg-cemento'}`}
            data-testid={`filtro-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {data.active ? (
        <p className="bordo p-3 mb-5 etichetta text-sm">MAPPA NASCOSTA: C’È UNA CAMMINATA IN CORSO</p>
      ) : (
        <div className="mb-5">
          {pick && (
            <p className="bordo bg-ambra p-3 mb-3 etichetta text-sm" role="status">
              TOCCA LA MAPPA DOVE VUOI IL POSTO ·{' '}
              <button type="button" className="underline" onClick={() => setPick(false)}>
                ANNULLA
              </button>
            </p>
          )}
          <WalkMap
            markers={markers}
            className={`h-[50vh] min-h-[300px] ${pick ? 'outline-[4px] outline outline-ambra' : ''}`}
            onReady={setMap}
            onMarkerClick={(id) => {
              setAperto(id)
              document.getElementById(`posto-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            onMapClick={(lat, lng) => {
              if (!pick) return
              setPick(false)
              setNuovo({ lat, lng })
            }}
            zoom={13}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-8">
        <Btn variant="ambra" size="md" onClick={addHere} testId="aggiungi-qui">
          + DOVE SONO
        </Btn>
        <Btn variant="cemento" size="md" onClick={() => setPick(true)} disabled={data.active || pick} testId="aggiungi-mappa">
          + SULLA MAPPA
        </Btn>
      </div>

      {ordinate.length === 0 ? (
        <p className="mb-8">
          {filtro === 'da-provare'
            ? 'Nessun bangla da provare. Aggiungine uno con + DOVE SONO o + SULLA MAPPA.'
            : 'Ancora niente qui. Si riempie da solo con BANGLA e BAGNO durante le camminate, o aggiungendo posti a mano.'}
        </p>
      ) : (
        <ul className="grid gap-4">
          {ordinate.map((r) => (
            <PostoCard
              key={r.id}
              r={r}
              aperto={aperto === r.id}
              onToggle={() => setAperto(aperto === r.id ? null : r.id)}
              onShow={
                map && !data.active
                  ? () => {
                      map.flyTo({ center: [r.lng, r.lat], zoom: 17 })
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  : undefined
              }
              onRemoved={() => showStamp('TOLTO', 900)}
            />
          ))}
        </ul>
      )}

      {nuovo && (
        <NuovoPosto
          pos={nuovo}
          onClose={() => setNuovo(null)}
          onSaved={(t) => {
            setNuovo(null)
            showStamp(t)
          }}
        />
      )}
      {overlay}
      {stamp && <Stamp text={stamp} small />}
    </main>
  )
}

function PostoCard({
  r,
  aperto,
  onToggle,
  onShow,
  onRemoved,
}: {
  r: Riga
  aperto: boolean
  onToggle: () => void
  onShow?: () => void
  onRemoved: () => void
}) {
  const [conferma, setConferma] = useState(false)
  const isBagno = r.kind === 'bagno'
  const nome = r.nome || (isBagno ? 'BAGNO SENZA NOME' : 'BANGLA SENZA NOME')
  const stato = isBagno
    ? gratisLabel(r.gratis)
    : r.visite
      ? r.visite === 1
        ? '1 CAMMINATA'
        : `${r.visite} CAMMINATE`
      : r.daProvare
        ? 'DA PROVARE'
        : 'GIÀ VISTO'

  return (
    <li id={`posto-${r.id}`} className="bordo shadow-pieno bg-cemento">
      <button type="button" className="w-full flex text-left" onClick={onToggle} aria-expanded={aperto} data-testid={`posto-${r.kind}`}>
        <div
          className={`min-w-[84px] p-3 flex flex-col items-center justify-center ${
            isBagno ? (r.gratis === true ? 'bg-muschio text-schiuma' : 'bg-nero text-cemento') : r.daProvare ? 'bg-schiuma' : 'bg-ambra'
          }`}
        >
          {isBagno ? (
            <span className="titolo text-2xl">WC</span>
          ) : (
            <>
              <span className="titolo text-3xl tabular-nums">{r.media != null ? r.media.toFixed(1).replace('.', ',') : '—'}</span>
              <span className="etichetta text-[11px]">MEDIA</span>
            </>
          )}
        </div>
        <div className="p-3 min-w-0 flex-1">
          <div className="titolo text-xl">{nome}</div>
          <div className="etichetta text-xs mt-1">
            {stato}
            {isBagno && r.soste ? ` · ${r.soste} ${r.soste === 1 ? 'SOSTA' : 'SOSTE'}` : ''}
          </div>
          {!!r.premi?.length && (
            <div className="flex flex-wrap gap-2 mt-2">
              {[...new Set(r.premi)].map((p) => (
                <span key={p} className="-rotate-3 border-[3px] border-rosso-linea text-rosso-linea titolo text-xs px-2">
                  {p} ×{r.premi!.filter((x) => x === p).length}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
      {aperto && (
        <div className="border-t-[3px] border-nero p-3 grid gap-3">
          <label className="etichetta text-xs" htmlFor={`nome-${r.id}`}>
            NOME
          </label>
          <input
            id={`nome-${r.id}`}
            defaultValue={r.nome}
            placeholder={isBagno ? 'BAR, PARCO, STAZIONE…' : 'NOME DEL NEGOZIO'}
            maxLength={60}
            onBlur={(e) => {
              if (e.target.value.trim() === r.nome) return
              void (isBagno ? updateBagno(r.id, { nome: e.target.value }) : updateBangla(r.id, { nome: e.target.value }))
            }}
            className="bordo bg-schiuma w-full min-h-[48px] px-3 etichetta"
          />
          {isBagno ? (
            <div className="grid grid-cols-3 gap-2">
              {([true, false, null] as const).map((g) => (
                <button
                  key={String(g)}
                  type="button"
                  aria-pressed={r.gratis === g}
                  onClick={() => void updateBagno(r.id, { gratis: g })}
                  className={`bordo etichetta text-xs min-h-[48px] px-1 ${r.gratis === g ? 'bg-nero text-cemento' : ''}`}
                >
                  {g === true ? 'GRATIS' : g === false ? 'A PAGAMENTO' : 'NON SO'}
                </button>
              ))}
            </div>
          ) : (
            !r.visite && (
              <div className="grid grid-cols-2 gap-2">
                {([true, false] as const).map((dp) => (
                  <button
                    key={String(dp)}
                    type="button"
                    aria-pressed={!!r.daProvare === dp}
                    onClick={() => void updateBangla(r.id, { daProvare: dp })}
                    className={`bordo etichetta text-xs min-h-[48px] px-1 ${!!r.daProvare === dp ? 'bg-nero text-cemento' : ''}`}
                  >
                    {dp ? 'DA PROVARE' : 'GIÀ VISTO'}
                  </button>
                ))}
              </div>
            )
          )}
          <div className="flex flex-wrap gap-4 items-center">
            {onShow && (
              <button type="button" className="etichetta text-sm underline min-h-[44px]" onClick={onShow}>
                VEDI SULLA MAPPA
              </button>
            )}
            {conferma ? (
              <span className="flex gap-2 items-center">
                <span className="etichetta text-xs">SICURO?</span>
                <button
                  type="button"
                  className="bordo bg-nero text-cemento etichetta text-xs px-3 min-h-[44px]"
                  onClick={async () => {
                    await removeSavedPlace(r.kind, r.id)
                    onRemoved()
                  }}
                  data-testid="conferma-togli"
                >
                  TOGLI
                </button>
                <button type="button" className="bordo etichetta text-xs px-3 min-h-[44px]" onClick={() => setConferma(false)}>
                  NO
                </button>
              </span>
            ) : (
              <button type="button" className="etichetta text-sm underline min-h-[44px]" onClick={() => setConferma(true)}>
                {r.kind === 'bangla' && r.visite ? 'TOGLI DALLA LISTA' : 'ELIMINA'}
              </button>
            )}
          </div>
          {r.kind === 'bangla' && !!r.visite && (
            <p className="text-sm">Un bangla visitato resta nelle camminate e nell’archivio anche se lo togli dalla lista.</p>
          )}
        </div>
      )}
    </li>
  )
}

const TIPI_NUOVO = [
  { id: 'bangla-da-provare', label: 'BANGLA DA PROVARE', variant: 'schiuma' as const },
  { id: 'bangla-visto', label: 'BANGLA GIÀ VISTO', variant: 'ambra' as const },
  { id: 'bagno-gratis', label: 'BAGNO GRATIS', variant: 'muschio' as const },
  { id: 'bagno-pagamento', label: 'BAGNO A PAGAMENTO', variant: 'nero' as const },
]

function NuovoPosto({
  pos,
  onClose,
  onSaved,
}: {
  pos: { lat: number; lng: number }
  onClose: () => void
  onSaved: (stamp: string) => void
}) {
  const [nome, setNome] = useState('')
  const save = async (tipo: (typeof TIPI_NUOVO)[number]['id']) => {
    if (tipo.startsWith('bangla')) {
      await addSavedBangla({ nome, lat: pos.lat, lng: pos.lng, daProvare: tipo === 'bangla-da-provare' })
      onSaved(tipo === 'bangla-da-provare' ? 'DA PROVARE' : 'SALVATO')
    } else {
      await addSavedBagno({ nome, lat: pos.lat, lng: pos.lng, gratis: tipo === 'bagno-gratis' })
      onSaved('BAGNO')
    }
  }
  return (
    <Sheet title="NUOVO POSTO" onClose={onClose}>
      <label className="etichetta text-sm" htmlFor="nome-posto">
        NOME (FACOLTATIVO)
      </label>
      <input
        id="nome-posto"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        maxLength={60}
        autoComplete="off"
        placeholder="COME SI CHIAMA?"
        className="bordo bg-schiuma w-full min-h-[52px] px-3 etichetta mt-2 mb-5"
        data-testid="input-nome-posto"
      />
      <div className="grid gap-3 mb-4">
        {TIPI_NUOVO.map((t) => (
          <Btn key={t.id} variant={t.variant} size="md" className="w-full" onClick={() => void save(t.id)} testId={`nuovo-${t.id}`}>
            {t.label}
          </Btn>
        ))}
        <button type="button" className="etichetta underline min-h-[44px]" onClick={onClose}>
          LASCIA STARE
        </button>
      </div>
    </Sheet>
  )
}
