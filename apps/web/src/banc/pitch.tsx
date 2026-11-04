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
import { ajouterEnfant, changerSujet, lire, nouvelArbre } from '../../../../packages/tableau/src/elements/arbre/modele/sujets'
import { Presentation } from '../../../../packages/tableau/src/elements/arbre/Presentation'

/**
 * Le banc du Pitch, pour le développement seulement (`/banc-pitch.html?theme=hand-drawn`) : une carte variée, ouverte
 * tout de suite en présentation, sans compte ni stockage. Il sert à reproduire un défaut et à mesurer les transitions.
 * `?long` : des textes démesurés dans chaque mise en page ; `?cas` : une note de neuf lignes, des étiquettes longues, une
 * arête et une chronologie chargées. De quoi revoir à l'œil ce que deviennent les textes qui ne tiennent pas.
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

const LONG = 'Une idée qui demande beaucoup plus de mots que prévu pour être dite correctement, et qui continue encore sur plusieurs lignes sans jamais vraiment s’arrêter'

const CARTE_LONGUE: Branche[] = [
  ['Un titre de branche vraiment très long, qui dépasse largement ce qu’une diapositive peut montrer sur une seule ligne et même sur deux', [[LONG], ['Court'], ['https://exemple.com/un/chemin/tres/long/sans/espaces/AnticonstitutionnellementInterminable']]],
  ['Liste interminable', Array.from({ length: 14 }, (_, i): Branche => [`Point numéro ${i + 1} ${i % 3 === 0 ? LONG : ''}`.trim()])],
  ['Chronologie bavarde', [[`2024 : ${LONG}`], ['2025 : la bêta ouverte à tous ceux qui ont demandé un accès anticipé'], ['2026'], [`2027 : ${LONG}`]], { miseEnPage: 'chronologie' }],
  ['Arêtes', [[LONG, [[LONG], ['Lent']]], ['Miro avec un nom de concurrent démesurément long', [['Cher']]]], { miseEnPage: 'arete' }],
  ['Citation', [[`${LONG} ${LONG} ${LONG}`]], { miseEnPage: 'paroles' }],
  ['Accolade', [[LONG], ['Licence'], [LONG], ['Services']], { miseEnPage: 'accolade' }],
  ['Supercalifragilisticexpialidocious_AnticonstitutionnellementInterminable', [['a'], ['b']]],
]

const paragraphe = (texte: string) => ({ type: 'paragraph', content: [{ type: 'text', text: texte }] })
const NOTE_LONGUE = { type: 'doc', content: Array.from({ length: 9 }, (_, i) => paragraphe(`Ligne de note ${i + 1} : du texte qui explique encore et encore le même point pour remplir la diapositive.`)) }

const CARTE_CAS: Branche[] = [
  ['Un sujet avec une très longue note et un titre lui aussi assez long pour prendre deux lignes au moins', [['x']]],
  ['Étiquettes', [['y']]],
  ['Arête chargée', [['Tête', ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit'].map((t): Branche => [t])], ['Autre']], { miseEnPage: 'arete' }],
  ['Frise chargée', [['Tête', ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept'].map((t): Branche => [t])], ['Autre']], { miseEnPage: 'chronologie' }],
]

function construire(): Arbre {
  const q = new URLSearchParams(location.search)
  const variante = q.has('cas') ? 'cas' : q.has('long') ? 'long' : null
  let a = nouvelArbre(variante === 'long' ? 'Un sujet central dont le titre est beaucoup trop long pour tenir sur la diapositive d’ouverture sans être coupé ou réduit' : 'Lancer Notak en 2027')
  const poser = (parent: Id, branches: Branche[]) => {
    for (const [titre, enfants, reglage] of branches) {
      let id: Id
      ;[a, id] = ajouterEnfant(a, parent, titre)
      if (enfants) poser(id, enfants)
      if (reglage) a = poserDiapo(a, [id], reglage)
    }
  }
  poser(lire(a).central, variante === 'cas' ? CARTE_CAS : variante === 'long' ? CARTE_LONGUE : CARTE)
  if (variante === 'cas') {
    const [note, etiquettes] = lire(a).enfants.get(lire(a).central) ?? []
    if (note) a = changerSujet(a, note, (x) => ({ ...x, note: NOTE_LONGUE }))
    if (etiquettes) a = changerSujet(a, etiquettes, (x) => ({ ...x, etiquettes: ['Une étiquette particulièrement longue qui ne tient pas', 'Courte', 'Encore une étiquette assez bavarde pour déborder'] }))
  }
  const theme = q.get('theme')
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
