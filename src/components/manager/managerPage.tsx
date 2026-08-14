// Platshållare tills manager-vyerna landar — routen finns redan nu så att
// navigering, deep-links och nginx-fallbacken kan verifieras för sig.
export function ManagerPage() {
  return (
    <main>
      <section id="manager">
        <div className="container">
          <div className="section-head">
            <span className="index">CS</span>
            <h2>Manager</h2>
          </div>
          <p className="roster-note">
            Här flyttar CS Manager in: bygg ditt lag av gubbarna, spela serien och läs referaten.
            Truppbyggaren är på väg — serien är redan spelklar i maskinrummet.
          </p>
        </div>
      </section>
    </main>
  )
}
