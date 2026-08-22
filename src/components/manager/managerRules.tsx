import { useState } from 'react'
import type { ManagerView } from '../../api'
import { ChevronIcon } from '../icons'

type Rules = Pick<
  ManagerView,
  'budget' | 'squadSize' | 'sellRate' | 'pointsWin' | 'pointsDraw' | 'transfersPerMatchday' | 'trainingPerMatchday'
>

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

// Alltid nåbar men inte påtvingad — samma dolt-som-standard-mönster som "Hur
// räknas betyget fram?" i roster.tsx. Siffrorna kommer från vyn, inte
// hårdkodade, så texten aldrig kan glida isär från vad servern faktiskt gör —
// se docs/improvmentplan.md Etapp 6 och SeasonView i seasonService.ts.
export function ManagerRules({ rules }: { rules: Rules }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="legend-toggle-wrap">
      <button
        type="button"
        className="legend-toggle"
        aria-expanded={open}
        aria-controls="manager-rules-body"
        onClick={() => setOpen(!open)}
      >
        <ChevronIcon />
        {open ? 'Dölj hur Manager funkar' : 'Så funkar Manager'}
      </button>
      {open && (
        <div className="legend-body" id="manager-rules-body">
          {/* Återanvänder attr-legend-rutnätet från roster.tsx — samma idé:
              en kompakt lista av korta fråga/svar-par. */}
          <dl className="attr-legend">
            <div>
              <dt>Vem får starta en säsong?</dt>
              <dd>Vem som helst i klanen, så fort ingen säsong redan är igång.</dd>
            </div>
            <div>
              <dt>Budget och trupp</dt>
              <dd>
                {rules.budget.toLocaleString('sv-SE')} att handla för, {rules.squadSize} spelare i
                truppen.
              </dd>
            </div>
            <div>
              <dt>Lag och låsning</dt>
              <dd>
                Ett lag per manager. Truppen byggs fritt tills första omgången spelas — därefter är
                den låst, och förändringar går via transfermarknaden i stället. Ett nytt lag går
                bara att skapa innan dess.
              </dd>
            </div>
            <div>
              <dt>Matcherna</dt>
              <dd>
                Datorn simulerar varje match ur spelarnas attribut när någon trycker "Spela
                omgången" — vem som helst i klanen får trycka, inte bara lagens egna managers.
              </dd>
            </div>
            <div>
              <dt>Poäng</dt>
              <dd>
                {rules.pointsWin} för vinst, {rules.pointsDraw} för oavgjort, 0 för förlust.
              </dd>
            </div>
            <div>
              <dt>Transfer och träning</dt>
              <dd>
                Bara i seriefasen: {rules.transfersPerMatchday}{' '}
                {plural(rules.transfersPerMatchday, 'affär', 'affärer')} och{' '}
                {rules.trainingPerMatchday} träningspass per lag och ospelad omgång. En försäljning
                ger {Math.round(rules.sellRate * 100)} % av spelarens värde tillbaka.
              </dd>
            </div>
            <div>
              <dt>BOT-märkta lag</dt>
              <dd>
                Datorstyrt motstånd, ifyllt när bara en enda manager skapat lag — annars vore det
                ingen serie att spela.
              </dd>
            </div>
            <div>
              <dt>Nästa säsong</dt>
              <dd>
                När sista omgången spelats kan vem som helst starta nästa — poolen fryses om med
                gubbarnas kort som de står då.
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
