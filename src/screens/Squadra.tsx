import { useEffect, useRef, useState } from 'react'
import { go } from '../router'
import { getLastTeam, startWalk } from '../lib/walks'
import { unlockAudio } from '../lib/feedback'
import { useCapture } from '../components/useCapture'
import { BackLink, Btn, ScreenTitle } from '../components/ui'

export const MIN_TEAM = 2
export const MAX_TEAM = 12

export default function Squadra() {
  const [team, setTeam] = useState<string[]>([])
  const [last, setLast] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [nome, setNome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { capture, overlay } = useCapture()

  useEffect(() => {
    getLastTeam().then(setLast)
  }, [])

  const add = () => {
    const s = input.trim().replace(/\s+/g, ' ').slice(0, 16).toUpperCase()
    if (!s) return
    if (team.length >= MAX_TEAM) return setError(`MASSIMO ${MAX_TEAM}`)
    if (team.includes(s)) return setError('C’È GIÀ')
    setTeam([...team, s])
    setInput('')
    setError(null)
    inputRef.current?.focus()
  }

  const parti = async () => {
    unlockAudio()
    if (team.length < MIN_TEAM || team.length > MAX_TEAM) return
    setStarting(true)
    const fix = await capture('PARTENZA')
    if (!fix) {
      setStarting(false)
      return
    }
    try {
      await startWalk(team, nome, fix)
      go('camminata', true)
    } catch (e) {
      setError(e instanceof Error ? e.message.toUpperCase() : 'ERRORE')
      setStarting(false)
    }
  }

  const ok = team.length >= MIN_TEAM && team.length <= MAX_TEAM

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom flex flex-col">
      <BackLink to="" />
      <ScreenTitle kicker={`DA ${MIN_TEAM} A ${MAX_TEAM} SOPRANNOMI`}>LA SQUADRA</ScreenTitle>

      {last.length >= MIN_TEAM && team.length === 0 && (
        <Btn variant="muschio" size="md" className="w-full mb-5" onClick={() => setTeam(last.slice(0, MAX_TEAM))} testId="stessa-squadra">
          STESSA SQUADRA DELL’ULTIMA VOLTA
        </Btn>
      )}

      <form
        className="flex gap-3 mb-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <label className="sr-only" htmlFor="soprannome">Soprannome</label>
        <input
          id="soprannome"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="SOPRANNOME"
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="done"
          maxLength={16}
          className="bordo bg-schiuma flex-1 min-w-0 min-h-[56px] px-3 text-lg etichetta placeholder:text-nero/40"
          data-testid="input-soprannome"
        />
        <Btn type="submit" variant="nero" size="md" disabled={!input.trim() || team.length >= MAX_TEAM} testId="aggiungi">
          +
        </Btn>
      </form>
      <p className="etichetta text-xs h-5 text-rosso-linea" role="alert">{error}</p>

      <ul className="flex flex-wrap gap-3 my-4" aria-label="Squadra">
        {team.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setTeam(team.filter((x) => x !== s))}
              className="bordo shadow-pieno bg-schiuma titolo text-xl px-3 min-h-[48px] premuto"
              aria-label={`Togli ${s}`}
            >
              {s} <span className="etichetta text-sm ml-1">×</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="etichetta text-xs mb-6">
        {team.length}/{MAX_TEAM} · TOCCA UN NOME PER TOGLIERLO
      </p>

      <label className="etichetta text-sm mb-2" htmlFor="nome-giro">NOME DEL GIRO (FACOLTATIVO)</label>
      <input
        id="nome-giro"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="EASY BEER → LUCKY BAR"
        maxLength={60}
        className="bordo bg-schiuma min-h-[56px] px-3 text-lg mb-8 etichetta placeholder:text-nero/40"
      />

      <div className="mt-auto">
        <Btn variant="ambra" size="xl" className="w-full" disabled={!ok || starting} onClick={parti} testId="parti">
          PARTI
        </Btn>
      </div>
      {overlay}
    </main>
  )
}
