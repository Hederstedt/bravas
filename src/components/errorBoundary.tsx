import { Component, type ErrorInfo, type ReactNode } from 'react'

// Nätverkslagret i api.ts är genomgående defensivt — det returnerar null eller
// { ok: false } i stället för att kasta. Men ett fel i själva renderingen hade
// ingenting som fångade det, och React avmonterar hela trädet: besökaren fick
// en vit skärm utan att förstå vad som hänt.
//
// Klasskomponent för att det är det enda sättet — det finns ingen hook för
// felgränser.
interface State {
  failed: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Loggas så att det går att se i konsolen vid felsökning. Sajten skickar
    // ingenting vidare — ingen tracking, se docs/PLAN.md.
    console.error('Renderingsfel:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main>
        <section>
          <div className="container">
            <div className="section-head">
              <span className="index">!</span>
              <h2>Något gick sönder</h2>
            </div>
            <p className="roster-note">
              Sidan kraschade — det är vårt fel, inte ditt. Ladda om så brukar det lösa sig.
            </p>
            <p>
              <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
                Ladda om sidan
              </button>
            </p>
          </div>
        </section>
      </main>
    )
  }
}
