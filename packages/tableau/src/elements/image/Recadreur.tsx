import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Id, Image } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { miseEnPage, proportionsAffichees } from './geometrie'
import { CADRE_PLEIN, type Cadre, type Poignee, avecRecadrage, deplacerCadre, tirerCadre } from './recadrage'
import { t } from '../../langue'

/** L'image dont on règle le recadrage, une seule à la fois. */
let ouvert: Id | null = null
const ecouteurs = new Set<() => void>()

export function recadrer(id: Id | null) {
  if (ouvert === id) return
  ouvert = id
  for (const f of ecouteurs) f()
}
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}
export const useRecadrageOuvert = () => useSyncExternalStore(ecouter, () => ouvert)

type Geste = { mode: 'deplacer' } | { mode: 'tirer'; poignee: Poignee }

const POIGNEES: Poignee[] = ['nw', 'ne', 'sw', 'se']

/**
 * L'image montrée en entier, avec un cadre qu'on glisse et qu'on tire par ses coins. Entrée valide, Échap annule ;
 * « Tout l'image » rend le cadre à l'image entière.
 */
export function Recadreur({ id, contenu, adresse, contexte }: { id: Id; contenu: Image; adresse: string; contexte: ContexteToile }) {
  const [cadre, setCadre] = useState<Cadre>(CADRE_PLEIN)
  const boite = useRef<HTMLDivElement>(null)
  const geste = useRef<{ geste: Geste; x: number; y: number; depart: Cadre } | null>(null)
  const page = miseEnPage(contenu, true)

  const valider = () => {
    const apres = avecRecadrage(contenu, cadre)
    if (JSON.stringify(apres) !== JSON.stringify(contenu)) contexte.magasin.faire([{ type: 'contenu', id, avant: contenu, apres }])
    recadrer(null)
  }
  const valide = useRef(valider)
  valide.current = valider

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Enter') valide.current()
      else recadrer(null)
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])

  const commencer = (g: Geste) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    geste.current = { geste: g, x: e.clientX, y: e.clientY, depart: cadre }
  }
  const bouger = (e: React.PointerEvent) => {
    const en = geste.current
    const r = boite.current?.getBoundingClientRect()
    if (!en || !r || r.width === 0 || r.height === 0) return
    const [du, dv] = [(e.clientX - en.x) / r.width, (e.clientY - en.y) / r.height]
    setCadre(en.geste.mode === 'deplacer' ? deplacerCadre(en.depart, du, dv) : tirerCadre(en.depart, en.geste.poignee, du, dv))
  }
  const finir = () => {
    geste.current = null
  }

  return (
    <div className="notak-recadreur" onPointerDown={(e) => e.stopPropagation()}>
      <div ref={boite} className="notak-image-cadre" style={{ aspectRatio: String(proportionsAffichees(contenu, true)) }}>
        <div className="notak-image-plan" style={page.plan}>
          <img className="notak-image" src={adresse} alt="" draggable={false} style={page.image} />
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
      <div className="notak-recadreur-actions">
        <button type="button" onClick={valider}>
          {t('recadreur.valider')}
        </button>
        <button type="button" onClick={() => recadrer(null)}>
          {t('commun.annuler')}
        </button>
        <button type="button" onClick={() => setCadre(CADRE_PLEIN)}>
          {t('recadreur.toute')}
        </button>
      </div>
    </div>
  )
}
