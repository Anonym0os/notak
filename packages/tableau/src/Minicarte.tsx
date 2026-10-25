import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from './langue'
import { type Boite, DELAI_MINICARTE, cadreMinicarte, englober, mondeMinicarte, useAffichageMinicarte, versMinicarte, versToile } from './minicarteModele'
import './minicarte.css'

interface Proprietes {
  /** Les boîtes du contenu, dans le repère de la toile. Appelé seulement quand la mini-carte se montre, que `version` change ou qu'un mouvement commence. */
  formes(): readonly Boite[]
  /** Change quand le contenu change (le tableau, la disposition de la carte). */
  version: unknown
  /** La zone visible, dans le repère de la toile. */
  vue: Boite
  /** La taille de la fenêtre, en px : quand elle seule change, la vue n'a pas « bougé ». */
  fenetre: { l: number; h: number }
  /** Centre la vue sur ce point de la toile, sans changer le zoom. */
  aller(centre: { x: number; y: number }): void
  lieu: 'tableau' | 'carte'
}

/**
 * La mini-carte, en bas à droite de la toile (voir `minicarteModele.ts`). En mouvement, elle paraît dès que la vue bouge
 * vraiment (un appui seul, qui ne déplace rien, ne la fait pas venir, comme pour les barres) et s'efface un instant après
 * le dernier mouvement ; tant que le pointeur la survole ou la tire, elle reste.
 *
 * Un clic y centre la vue ; tirer le cadre de la vue la promène en gardant la prise. Pendant qu'on tire, le monde
 * montré est figé : il ne se recadre pas sous le pointeur.
 */
export function Minicarte({ formes, version, vue, fenetre, aller, lieu }: Proprietes) {
  const affichage = useAffichageMinicarte()
  const [bouge, setBouge] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [tire, setTire] = useState<{ monde: Boite; prise: { x: number; y: number } } | null>(null)

  // Le minuteur vit à part : une fenêtre redimensionnée entre deux mouvements ne doit pas l'annuler.
  const avant = useRef<{ vue: Boite; fenetre: { l: number; h: number } } | null>(null)
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { x, y, l, h } = vue
  useEffect(() => {
    const a = avant.current
    avant.current = { vue: { x, y, l, h }, fenetre }
    if (!a || (a.vue.x === x && a.vue.y === y && a.vue.l === l && a.vue.h === h)) return
    if (a.fenetre.l !== fenetre.l || a.fenetre.h !== fenetre.h) return
    setBouge(true)
    clearTimeout(minuteur.current)
    minuteur.current = setTimeout(() => setBouge(false), DELAI_MINICARTE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, l, h])
  useEffect(() => () => clearTimeout(minuteur.current), [])

  const visible = affichage === 'toujours' || bouge || survol || !!tire
  // Mesurer le contenu coûte (le tableau lit ses éléments à l'écran) : seulement quand on va la voir, une fois les
  // éléments posés dans la page, et de nouveau quand le contenu change ou qu'un mouvement commence.
  const [mesure, setMesure] = useState<{ contenu: Boite | null; boites: readonly Boite[] } | null>(null)
  useLayoutEffect(() => {
    if (affichage === 'jamais' || !visible) return
    const boites = formes()
    setMesure({ contenu: englober(boites), boites })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affichage, visible, version, bouge])
  const contenu = mesure?.contenu ?? null
  const monde = tire?.monde ?? mondeMinicarte(contenu, vue)

  if (affichage === 'jamais' || !contenu) return null
  const cadre = cadreMinicarte(monde)
  const champ = versMinicarte(monde, vue)
  // Très dézoomé, la vue tiendrait en un point : son cadre garde 6 px, autour du même centre.
  const trace = { l: Math.max(6, champ.l), h: Math.max(6, champ.h) }
  const ici = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  return (
    <div
      className="notak-minicarte"
      data-lieu={lieu}
      data-visible={visible || undefined}
      data-tire={tire ? '' : undefined}
      aria-hidden={!visible}
      title={t('minicarte.aide')}
      style={{ width: cadre.l, height: cadre.h }}
      onPointerEnter={() => setSurvol(true)}
      onPointerLeave={() => setSurvol(false)}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.button !== 0) return
        e.preventDefault()
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Un pointeur déjà relâché (ou un navigateur qui ne capture pas) : le glisser suit tant qu'on reste dessus.
        }
        const p = ici(e)
        const dedans = p.x >= champ.x && p.x <= champ.x + champ.l && p.y >= champ.y && p.y <= champ.y + champ.h
        // Pris dans le cadre de la vue, il garde la prise ; ailleurs, la vue se centre sous le pointeur.
        const prise = dedans ? { x: p.x - (champ.x + champ.l / 2), y: p.y - (champ.y + champ.h / 2) } : { x: 0, y: 0 }
        setTire({ monde, prise })
        if (!dedans) aller(versToile(monde, p))
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        if (!tire) return
        const p = ici(e)
        aller(versToile(tire.monde, { x: p.x - tire.prise.x, y: p.y - tire.prise.y }))
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        setTire(null)
      }}
      onPointerCancel={() => setTire(null)}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <svg width={cadre.l} height={cadre.h} aria-hidden>
        {mesure!.boites.map((b, i) => {
          const m = versMinicarte(monde, b)
          return <rect key={i} className="notak-minicarte-forme" x={m.x} y={m.y} width={Math.max(1, m.l)} height={Math.max(1, m.h)} rx={Math.min(2, m.l / 4, m.h / 4)} />
        })}
        <rect className="notak-minicarte-vue" x={champ.x + (champ.l - trace.l) / 2} y={champ.y + (champ.h - trace.h) / 2} width={trace.l} height={trace.h} rx={3} />
      </svg>
    </div>
  )
}
