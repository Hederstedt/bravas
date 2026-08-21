import { Link } from 'react-router'

// Wildcard-rutten gick tidigare rakt till Navigate("/") — en felstavad eller
// gammal länk såg ut att fungera, och kunde indexeras som startsidans eget
// innehåll. Nu får den som hamnar fel en egen sida i stället för en tyst
// omdirigering.
export function NotFoundPage() {
  return (
    <main>
      <section id="hittades-inte">
        <div className="container">
          <div className="section-head">
            <span className="index">404</span>
            <h1>Sidan finns inte</h1>
          </div>
          <p className="roster-note">
            Adressen stämmer inte, eller så har sidan flyttat. Kolla länken en gång till, eller gå
            tillbaka till startsidan.
          </p>
          <Link className="btn btn-ghost" to="/">
            Till startsidan
          </Link>
        </div>
      </section>
    </main>
  )
}
