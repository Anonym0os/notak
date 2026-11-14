import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Id, Image } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { miseEnPage, proportionsAffichees } from './geometrie'
import { CADRE_PLEIN, type Cadre, type Poignee, avecRecadrage, cadreDe, deplacerCadre, recadrageChange, tirerCadre } from './recadrage'
import { Traits } from './Annotateur'
import { BarreOutil, useAmenerALaVue } from './barreOutil'
import { t } from '../../langue'

/** L'image dont on règle le recadrage, une seule à la fois, et où revenir quand on le termine (la visionneuse). */
let ouvert: Id | null = null
let retour: (() => void) | undefined
const ecouteurs = new Set<() => void>()

/**
 * Ouvre le recadrage de cette image, ou le ferme (`null`). `depuis.retour` : ce qui l'a ouvert, à rouvrir quand on
 * le termine soi-même (valider, annuler) ; pas quand il se ferme parce qu'on a choisi autre chose.
 */
export function recadrer(id: Id | null, depuis?: { retour?: () => void }) {
  if (ouvert === id) return
  ouvert = id
  retour = id === null ? undefined : depuis?.retour
  for (const f of ecouteurs) f()
}
/** Valider ou annuler : le recadrage se ferme, et l'on revient d'où on l'a ouvert. */
function terminer() {
  const revenir = retour
  recadrer(null)
  revenir?.()
}
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}
export const useRecadrageOuvert = () => useSyncExternalStore(ecouter, () => ouvert)

type Geste = { mode: 'deplacer' } | { mode: 'tirer'; poignee: Poignee }

const POIGNEES: Poignee[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']

/**
 * L'image montrée en entier, avec un cadre qu'on glisse et qu'on tire par ses coins et ses bords ; il s'ouvre sur ce
 * qui est déjà gardé, traits dessinés compris. Entrée valide, Échap annule ; « Toute l'image » rend le cadre à l'image
 * entière. Les boutons sont dans la barre du bas, hors du zoom ; les poignées gardent leur taille à l'écran.
 * `adresse` peut être une copie réduite : le cadre se règle en proportions de l'image, et vaut tel quel pour l'original.
 */
export function Recadreur({ id, contenu, adresse, contexte }: { id: Id; contenu: Image; adresse: string; contexte: ContexteToile }) {
  const [cadre, setCadre] = useState<Cadre>(() => cadreDe(contenu))
  const racine = useRef<HTMLDivElement>(null)
  const boite = useRef<HTMLDivElement>(null)
  const geste = useRef<{ geste: Geste; pointeur: number; x: number; y: number; depart: Cadre } | null>(null)
  const page = miseEnPage(contenu, true)
  useAmenerALaVue(racine, contexte, true)

  const valider = () => {
    if (recadrageChange(contenu, cadre)) contexte.magasin.faire([{ type: 'contenu', id, avant: contenu, apres: avecRecadrage(contenu, cadre) }])
    terminer()
  }
  const valide = useRef(valider)
  valide.current = valider

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      // Entrée sur un bouton de la barre (Annuler, Toute l'image) le laisse faire ce qu'il dit.
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest?.('button')) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Enter') valide.current()
      else terminer()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])

  const commencer = (g: Geste) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    // Un second doigt ne reprend pas le cadre que le premier tient.
    if (e.button !== 0 || geste.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    geste.current = { geste: g, pointeur: e.pointerId, x: e.clientX, y: e.clientY, depart: cadre }
  }
  const bouger = (e: React.PointerEvent) => {
    const en = geste.current
    const r = boite.current?.getBoundingClientRect()
    if (!en || en.pointeur !== e.pointerId || !r || r.width === 0 || r.height === 0) return
    const [du, dv] = [(e.clientX - en.x) / r.width, (e.clientY - en.y) / r.height]
    setCadre(en.geste.mode === 'deplacer' ? deplacerCadre(en.depart, du, dv) : tirerCadre(en.depart, en.geste.poignee, du, dv))
  }
  const finir = (e: React.PointerEvent) => {
    if (geste.current?.pointeur === e.pointerId) geste.current = null
  }

  return (
    // `data-poignee` : tout l'outil se manie ; l'Apple Pencil y agit comme le doigt au lieu d'ouvrir le dessin libre
    // de la toile (voir `MANIABLE`), sur le cadre comme sur l'image voilée.
    <div ref={racine} className="notak-recadreur" data-poignee="" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div ref={boite} className="notak-image-cadre" style={{ aspectRatio: String(proportionsAffichees(contenu, true)) }}>
        <div className="notak-image-plan" style={page.plan}>
          <img className="notak-image" src={adresse} alt="" draggable={false} style={page.image} />
          {contenu.traits && contenu.traits.length > 0 && <Traits contenu={contenu} traits={contenu.traits} style={page.image} />}
        </div>
        <div
          className="notak-recadre"
          style={{ left: `${cadre.x * 100}%`, top: `${cadre.y * 100}%`, width: `${cadre.l * 100}%`, height: `${cadre.h * 100}%` }}
          onPointerDown={commencer({ mode: 'deplacer' })}
          onPointerMove={bouger}
          onPointerUp={finir}
          onPointerCancel={finir}
        >
          {POIGNEES.map((p) => (
            <span
              key={p}
              className="notak-recadre-poignee"
              data-poignee={p}
              onPointerDown={commencer({ mode: 'tirer', poignee: p })}
              onPointerMove={bouger}
              onPointerUp={finir}
              onPointerCancel={finir}
            />
          ))}
        </div>
      </div>
      <BarreOutil etiquette={t('image.recadrer')} className="notak-outil-image-barre">
        <button type="button" className="notak-croquis-texte" onClick={() => setCadre(CADRE_PLEIN)}>
          {t('recadreur.toute')}
        </button>
        <span className="notak-croquis-espace" />
        <button type="button" className="notak-croquis-texte" title="Esc" onClick={terminer}>
          {t('commun.annuler')}
        </button>
        <button type="button" className="notak-croquis-texte notak-croquis-enregistrer" title="↵" onClick={valider}>
          {t('recadreur.valider')}
        </button>
      </BarreOutil>
    </div>
  )
}
