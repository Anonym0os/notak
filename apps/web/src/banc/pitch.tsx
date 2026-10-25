import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@notak/tableau/toile.css'
import '../app.css'
import { engine } from '../../../../packages/tableau/node_modules/animejs'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Arbre, Id } from '../../../../packages/tableau/src/coeur/tableau'
import '../../../../packages/tableau/src/elements/arbre/arbre.css'
import '../../../../packages/tableau/src/elements/arbre/pitch.css'
import '../../../../packages/tableau/src/elements/arbre/diapo/diapo.css'
import { poserDiapo } from '../../../../packages/tableau/src/elements/arbre/modele/pitch'
import { ajouterEnfant, lire, nouvelArbre } from '../../../../packages/tableau/src/elements/arbre/modele/sujets'
import { Presentation } from '../../../../packages/tableau/src/elements/arbre/Presentation'

/**
 * Le banc du Pitch, pour le développement seulement (`/banc-pitch.html?theme=hand-drawn`) : une carte variée, ouverte
 * tout de suite en présentation, sans compte ni stockage. Il sert à reproduire un défaut et à mesurer les transitions.
 */

// `?vitesse=0.2` ralentit tout, pour regarder une transition image par image ; les gardes de durée suivent.
const vitesse = Number(new URLSearchParams(location.search).get('vitesse') ?? 1)
if (vitesse > 0 && vitesse !== 1) {
  engine.speed = vitesse
  const attendre = window.setTimeout.bind(window)
  window.setTimeout = ((f: TimerHandler, ms?: number, ...r: unknown[]) => attendre(f, (ms ?? 0) >= 500 ? (ms ?? 0) / vitesse : ms, ...r)) as typeof window.setTimeout
}

type Branche = [titre: string, enfants?: Branche[], reglage?: Parameters<typeof poserDiapo>[2]]

const CARTE: Branche[] = [
  ['Le problème', [['Les notes se perdent'], ['Les outils se multiplient'], ['Personne ne retrouve rien']]],
  ['Notre réponse', [['Une toile', [['Libre'], ['Infinie']]], ['Une carte mentale', [['Rapide au clavier'], ['Belle à présenter']]], ['Un document']], { livraison: 'percer' }],
  ['Le marché', [['2024 : les premiers essais'], ['2025 : la bêta'], ['2026 : le lancement'], ['2027 : les équipes'], ['2028 : l’international']], { miseEnPage: 'chronologie' }],
  ['La concurrence', [['Notion', [['Lourd'], ['Lent']]], ['Miro', [['Cher']]], ['Xmind', [['Fermé']]], ['Milanote']], { miseEnPage: 'arete' }],
  ['L’équipe', [['Une petite équipe qui livre chaque semaine, proche de ceux qui l’utilisent et qui écoute vraiment ce qu’ils disent.']], { miseEnPage: 'paroles' }],
  ['Les finances', [['Abonnement'], ['Licence'], ['Formation'], ['Services'], ['Partenariats'], ['Subventions']], { miseEnPage: 'accolade' }],
  ['Prochaines étapes', [['Recruter'], ['Lever'], ['Livrer']], { livraison: 'tout' }],
]

function construire(): Arbre {
  let a = nouvelArbre('Lancer Notak en 2027')
  const poser = (parent: Id, branches: Branche[]) => {
    for (const [titre, enfants, reglage] of branches) {
      let id: Id
      ;[a, id] = ajouterEnfant(a, parent, titre)
      if (enfants) poser(id, enfants)
      if (reglage) a = poserDiapo(a, [id], reglage)
    }
  }
  poser(lire(a).central, CARTE)
  const theme = new URLSearchParams(location.search).get('theme')
  return theme ? { ...a, pitch: { theme } } : a
}

function Banc() {
  const [arbre, setArbre] = useState(construire)
  const [ouverte, setOuverte] = useState(true)
  const lecture = lire(arbre)
  return (
    <div className="notak-arbre-fond" tabIndex={-1} style={{ position: 'fixed', inset: 0, background: '#ddd' }}>
      {ouverte ? (
        <Presentation
          arbre={arbre}
          lecture={lecture}
          faire={(g) => {
            if (g.type !== 'pitch') return
            setArbre((a) => {
              const pitch: Record<string, unknown> = { ...a.pitch }
              for (const [k, v] of Object.entries(g.reglage)) v === null ? delete pitch[k] : (pitch[k] = v)
              return { ...a, pitch }
            })
          }}
          lectureSeule={false}
          quitter={() => setOuverte(false)}
        />
      ) : (
        <button type="button" style={{ margin: 40, fontSize: 18 }} onClick={() => setOuverte(true)}>
          Relancer
        </button>
      )}
    </div>
  )
}

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <Banc />
  </StrictMode>,
)
