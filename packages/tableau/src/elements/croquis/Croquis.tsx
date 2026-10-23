import { useMemo, useRef, useState } from 'react'
import type { Croquis, Trait } from '../../coeur/tableau'
import { Surcouche } from '../surcouche'
import type { PropsOutils, PropsRendu } from '../types'
import {
  COULEURS_TRAIT,
  EPAISSEURS_TRAIT,
  HAUTEUR_FEUILLE,
  LARGEUR_FEUILLE,
  ajouterPoint,
  cheminLisse,
  gommer,
  simplifier,
} from './trace'

/** Les traits d'une feuille, en SVG : un chemin lissé par trait. */
function Traits({ traits }: { traits: readonly Trait[] }) {
  const chemins = useMemo(() => traits.map((t) => cheminLisse(t.points)), [traits])
  return (
    <>
      {traits.map((t, i) => (
        <path key={i} d={chemins[i]} fill="none" stroke={t.couleur} strokeWidth={t.epaisseur} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </>
  )
}

export function RenduCroquis({ element, enEdition, contexte, brouillon }: PropsRendu<Croquis>) {
  const c = element.contenu
  return (
    <div className="notak-croquis">
      <svg viewBox={`0 0 ${LARGEUR_FEUILLE} ${HAUTEUR_FEUILLE}`} role="img" aria-label="Croquis">
        <Traits traits={c.traits} />
      </svg>
      {c.traits.length === 0 && <p className="notak-croquis-vide">Double-cliquez pour dessiner</p>}
      {enEdition && <Feuille contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />}
    </div>
  )
}

type Outil = 'crayon' | 'gomme'

/**
 * Le croquis ouvert en grand : une feuille au-dessus de la toile. Un trait se pose au crayon et se lisse à
 * l'arrivée ; la gomme retire les traits qu'elle touche. Chaque geste est un pas (Annuler, Rétablir), et la
 * feuille entière part au brouillon à chaque pas. Échap ou « Terminer » referment.
 */
function Feuille({ contenu, ecrire, finir }: { contenu: Croquis; ecrire(c: Croquis): void; finir(): void }) {
  const [traits, setTraits] = useState<Trait[]>(contenu.traits)
  const [passe, setPasse] = useState<Trait[][]>([])
  const [futur, setFutur] = useState<Trait[][]>([])
  const [outil, setOutil] = useState<Outil>('crayon')
  const [couleur, setCouleur] = useState<string>(COULEURS_TRAIT[0])
  const [epaisseur, setEpaisseur] = useState<number>(EPAISSEURS_TRAIT[1].valeur)
  // Le trait qu'on est en train de tirer, et l'état d'avant un geste de gomme.
  const [enCours, setEnCours] = useState<number[] | null>(null)
  const tire = useRef<{ points: number[]; avant: Trait[] } | null>(null)
  const surface = useRef<SVGSVGElement>(null)

  const valider = (suite: Trait[], avant: Trait[]) => {
    setPasse((p) => [...p.slice(-99), avant])
    setFutur([])
    setTraits(suite)
    ecrire({ ...contenu, traits: suite })
  }
  const annuler = () => {
    const avant = passe.at(-1)
    if (!avant) return
    setPasse(passe.slice(0, -1))
    setFutur([...futur, traits])
    setTraits(avant)
    ecrire({ ...contenu, traits: avant })
  }
  const retablir = () => {
    const apres = futur.at(-1)
    if (!apres) return
    setFutur(futur.slice(0, -1))
    setPasse([...passe, traits])
    setTraits(apres)
    ecrire({ ...contenu, traits: apres })
  }

  const dansFeuille = (e: React.PointerEvent) => {
    const r = surface.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * LARGEUR_FEUILLE, y: ((e.clientY - r.top) / r.height) * HAUTEUR_FEUILLE }
  }
  const debut = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Un pointeur que le navigateur ne suit plus : le trait se fait sans capture.
    }
    const { x, y } = dansFeuille(e)
    if (outil === 'crayon') {
      tire.current = { points: [x, y], avant: traits }
      setEnCours([x, y])
    } else {
      tire.current = { points: [], avant: traits }
      setTraits((t) => gommer(t, x, y))
    }
  }
  const deplacement = (e: React.PointerEvent) => {
    const g = tire.current
    if (!g) return
    const { x, y } = dansFeuille(e)
    if (outil === 'crayon') {
      const suite = ajouterPoint(g.points, x, y)
      if (suite !== g.points) {
        g.points = suite
        setEnCours(suite)
      }
    } else setTraits((t) => gommer(t, x, y))
  }
  const fin = () => {
    const g = tire.current
    tire.current = null
    if (!g) return
    if (outil === 'crayon') {
      setEnCours(null)
      valider([...g.avant, { points: simplifier(g.points), couleur, epaisseur }], g.avant)
    } else if (traits !== g.avant) {
      valider(traits, g.avant)
    }
  }

  const encours = useMemo(() => (enCours ? [{ points: enCours, couleur, epaisseur }] : []), [enCours, couleur, epaisseur])

  const touche = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return false
    e.preventDefault()
    if (e.shiftKey) retablir()
    else annuler()
    return true
  }

  return (
    <Surcouche etiquette="Dessiner" className="notak-croquis-fond" fermer={finir} surTouche={touche}>
      <div className="notak-croquis-feuille">
        <div className="notak-croquis-outils">
          <div role="group" aria-label="Outil">
            <button type="button" aria-pressed={outil === 'crayon'} onClick={() => setOutil('crayon')}>
              Crayon
            </button>
            <button type="button" aria-pressed={outil === 'gomme'} onClick={() => setOutil('gomme')}>
              Gomme
            </button>
          </div>
          <div role="group" aria-label="Couleur">
            {COULEURS_TRAIT.map((c) => (
              <button
                key={c}
                type="button"
                className="notak-croquis-pastille"
                style={{ background: c }}
                aria-label={c}
                aria-pressed={outil === 'crayon' && couleur === c}
                onClick={() => {
                  setCouleur(c)
                  setOutil('crayon')
                }}
              />
            ))}
          </div>
          <div role="group" aria-label="Épaisseur">
            {EPAISSEURS_TRAIT.map((e) => (
              <button key={e.valeur} type="button" aria-pressed={epaisseur === e.valeur} onClick={() => {
                setEpaisseur(e.valeur)
                setOutil('crayon')
              }}>
                {e.libelle}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Historique">
            <button type="button" disabled={passe.length === 0} onClick={annuler}>
              Annuler
            </button>
            <button type="button" disabled={futur.length === 0} onClick={retablir}>
              Rétablir
            </button>
            <button type="button" disabled={traits.length === 0} onClick={() => valider([], traits)}>
              Tout effacer
            </button>
          </div>
          <button type="button" className="notak-croquis-terminer" onClick={finir}>
            Terminer
          </button>
        </div>
        <svg
          ref={surface}
          className="notak-croquis-surface"
          data-outil={outil}
          viewBox={`0 0 ${LARGEUR_FEUILLE} ${HAUTEUR_FEUILLE}`}
          onPointerDown={debut}
          onPointerMove={deplacement}
          onPointerUp={fin}
          onPointerCancel={fin}
        >
          <Traits traits={traits} />
          <Traits traits={encours} />
        </svg>
      </div>
    </Surcouche>
  )
}

export function OutilsCroquis({ elements, contexte }: PropsOutils<Croquis>) {
  if (contexte.services.lectureSeule || elements.length !== 1) return null
  return (
    <button type="button" title="Ouvrir le croquis pour dessiner" onClick={() => contexte.commencerEdition(elements[0]!.id)}>
      Dessiner
    </button>
  )
}
