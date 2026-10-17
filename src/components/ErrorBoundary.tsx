import { Component, type ReactNode } from 'react'

/** ultima rete: niente pagina bianca, e i dati restano su IndexedDB */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="min-h-screen cemento-texture px-4 safe-top">
        <h1 className="titolo text-5xl mt-8">QUALCOSA SI È ROTTO.</h1>
        <p className="mt-4 text-lg">I punti segnati sono salvati sul telefono. Ricarica e si riparte da dove eravate.</p>
        <button
          type="button"
          className="bordo shadow-pieno bg-ambra titolo text-2xl min-h-[64px] px-4 mt-8 w-full"
          onClick={() => {
            location.hash = '#/'
            location.reload()
          }}
        >
          RICARICA
        </button>
      </main>
    )
  }
}
