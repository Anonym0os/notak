import { useEffect, useMemo, useRef, useState } from 'react'
import type { Croquis, Trait } from '../../coeur/tableau'
import { Surcouche } from '../surcouche'
import type { PropsRendu } from '../types'
import {
  COULEURS_TRAIT,
  type CroquisFeuille,
  couleurAffichee,
  EPAISSEURS_TRAIT,
  EPAISSEUR_DEFAUT,
  LARGEUR_FEUILLE,
  ajouterPoint,
  arrondir,
  affinageDe,
  attributsTrait,
  dessinTrait,
  ecrireReglage,
  epaisseurFeuille,
  gommer,
  hauteurFeuille,
  lireReglage,
  traitVise,
} from './trace'
import { BarreEpaisseur, CURSEUR_GOMME, VoletCouleur, VoletEpaisseur, curseurCrayon } from './partage'
import { couleursDuTableau } from '../couleur/suggestions'
import { presDuBas } from '../dessin/trace'
import type { ContexteToile } from '../types'
import { appliquerAuChoix, appuiSurTrait, couleurSous, decalageFleche, deplacerTraits, ordonnerTraits, sansTraits, traitsDansMarquise } from './selection'
import { t } from '../../langue'
import { LegendeLocale, avecTexteLegende } from '../LegendeLocale'
import { ico } from '../../icones'

const CLE_COULEUR = 'notak.croquis.couleur'
const CLE_EPAISSEUR = 'notak.croquis.epaisseur'
const ROUGE_GOMME = '#ff0000'
/** Le rayon de la gomme, en pixels d'écran (une zone de prise de 14 px de large). */
const GOMME_PX = 7
/** Le contour rouge du trait visé déborde de ce nombre de pixels d'écran : 1 px de chaque côté. */
const CONTOUR_GOMME_PX = 2
/** Le contour d'accent d'un trait choisi, et la zone où un appui le saisit, en pixels d'écran. */
const CONTOUR_CHOIX_PX = 3
const CAPTURE_PX = 6

/** Les traits d'une feuille, en SVG : un chemin lissé par trait. `vise` : le trait que la gomme viserait, cerné de rouge. */
function Traits({ traits, vise, choisis, contour = 0, suitLeTheme = false, enCours = false }: { traits: readonly Trait[]; vise?: { i: number; extra: number } | null; choisis?: ReadonlySet<Trait>; contour?: number; suitLeTheme?: boolean; enCours?: boolean }) {
  const chemins = useMemo(() => traits.map((t) => dessinTrait(t.points, t.epaisseur, t.affinage, !enCours)), [traits, enCours])
  return (
    <>
      {traits.map((t, i) => (
        <g key={i}>
          {vise?.i === i && (
            <path {...attributsTrait(chemins[i]!, ROUGE_GOMME, vise.extra)} />
          )}
          {choisis?.has(t) && (
            <path {...attributsTrait(chemins[i]!, 'var(--notak-accent)', 2 * contour)} />
          )}
          <path {...attributsTrait(chemins[i]!, couleurAffichee(t.couleur, suitLeTheme))} />
        </g>
      ))}
    </>
  )
}

export function RenduCroquis({ element, choisie, enEdition, contexte, brouillon, changer }: PropsRendu<Croquis>) {
  const c = element.contenu as CroquisFeuille
  // Sans fond, la feuille est celle du tableau : l'encre par défaut suit le thème.
  const transparent = c.couleur === 'transparent'
  return (
    <div className="notak-croquis">
      <svg viewBox={`0 0 ${LARGEUR_FEUILLE} ${hauteurFeuille(c)}`} role="img" aria-label={t('type.croquis')}>
        <Traits traits={c.traits} suitLeTheme={transparent} />
      </svg>
      {c.traits.length === 0 && (
        <div className="notak-croquis-vide" data-etroit={element.largeur <= 12 || undefined}>
          {ico('dessin')}
          <p>{t('croquis.vide')}</p>
        </div>
      )}
      {c.avecLegende && (
        <LegendeLocale
          classe="notak-croquis-legende"
          texte={c.legende ?? ''}
          choisie={choisie}
          modifiable={!contexte.services.lectureSeule}
          valider={(texte) => changer(avecTexteLegende(c, texte))}
        />
      )}
      {enEdition && <Feuille contenu={c} ecrire={brouillon} finir={contexte.finirEdition} contexte={contexte} />}
    </div>
  )
}

type Outil = 'crayon' | 'selection' | 'gomme' | 'pipette'
type Geste =
  | { type: 'trace'; points: number[]; avant: Trait[]; epaisseur: number; affinage: number }
  | { type: 'gomme'; avant: Trait[] }
  | { type: 'deplacer'; depart: { x: number; y: number }; avant: Trait[]; choix: ReadonlySet<Trait> }
  | { type: 'marquise'; depart: { x: number; y: number }; ajoute: boolean; base: ReadonlySet<Trait> }
type Volet = 'couleur' | 'epaisseur' | null

const couleurValide = (v: string | null): v is string => v !== null && /^#[0-9a-f]{6}$/i.test(v)

/**
 * Le croquis ouvert en grand : une feuille centrée au-dessus de la toile, sa barre d'outils en pilule dessous. Un
 * trait se pose au crayon, avec tous les points du pointeur ; la gomme retire le trait entier qu'elle touche (le
 * trait visé se cerne de rouge). Chaque geste est un pas (Annuler, Rétablir) et la feuille part au brouillon à chaque
 * pas. Enregistrer (ou ⌘S, ou un appui hors de la feuille) referme en gardant ; Échap ou Abandonner restaurent
 * la feuille d'avant.
 */
function Feuille({ contenu, ecrire, finir, contexte }: { contenu: CroquisFeuille; ecrire(c: Croquis): void; finir(): void; contexte: ContexteToile }) {
  const depart = useRef(contenu)
  const transparent = contenu.couleur === 'transparent'
  // Les couleurs déjà employées sur le tableau, relevées à l'ouverture : les plus utilisées, sous la palette.
  const suggerees = useMemo(() => couleursDuTableau(contexte.magasin.lire().elements, { exclure: COULEURS_TRAIT }), [contexte])
  // La barre s'efface quand le pointeur s'approche du bas de la fenêtre pendant un tracé ; plus de deux doigts annulent le geste.
  const [effacee, setEffacee] = useState(false)
  const doigts = useRef(new Set<number>())
  const hauteur = hauteurFeuille(contenu)
  const [traits, setTraits] = useState<Trait[]>(contenu.traits)
  const [passe, setPasse] = useState<Trait[][]>([])
  const [futur, setFutur] = useState<Trait[][]>([])
  const [outil, setOutil] = useState<Outil>('crayon')
  const [couleur, setCouleur] = useState<string>(() => {
    const v = lireReglage(CLE_COULEUR)
    return couleurValide(v) ? v : COULEURS_TRAIT[0]
  })
  const [precedente, setPrecedente] = useState<string>(couleur)
  const [epaisseur, setEpaisseur] = useState<number>(() => {
    const n = Number(lireReglage(CLE_EPAISSEUR))
    return Number.isInteger(n) && n >= 0 && n < EPAISSEURS_TRAIT.length ? n : EPAISSEUR_DEFAUT
  })
  const [volet, setVolet] = useState<Volet>(null)
  const [vise, setVise] = useState<{ i: number; extra: number } | null>(null)
  // Le trait qu'on est en train de tirer, et l'état d'avant un geste de gomme.
  const [enCours, setEnCours] = useState<number[] | null>(null)
  const tire = useRef<Geste | null>(null)
  const [choix, setChoix] = useState<ReadonlySet<Trait>>(new Set())
  const [marquise, setMarquise] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const surface = useRef<SVGSVGElement>(null)
  const modifie = passe.length > 0
  // Comme Milanote : en sélection l'épaisseur est grisée (les tracés posés ne sont pas recalculés) et la couleur
  // n'est active qu'avec des traits choisis ; la gomme grise les deux.
  const epaisseurGrisee = outil === 'selection' || outil === 'gomme'
  const couleurGrisee = outil === 'gomme' || (outil === 'selection' && choix.size === 0)

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
    setChoix(new Set())
    ecrire({ ...contenu, traits: avant })
  }
  const retablir = () => {
    const apres = futur.at(-1)
    if (!apres) return
    setFutur(futur.slice(0, -1))
    setPasse([...passe, traits])
    setTraits(apres)
    setChoix(new Set())
    ecrire({ ...contenu, traits: apres })
  }
  const abandonner = () => {
    if (modifie) ecrire(depart.current)
    finir()
  }

  /** Un changement de couleur ou d'épaisseur sur les traits choisis : un seul pas. */
  const surChoix = (f: (t: Trait) => Trait) => {
    if (choix.size === 0) return false
    const r = appliquerAuChoix(traits, choix, f)
    valider(r.traits, traits)
    setChoix(r.choix)
    return true
  }
  const choisirCouleur = (c: string) => {
    if (c !== couleur) setPrecedente(couleur)
    setCouleur(c)
    ecrireReglage(CLE_COULEUR, c)
    // Avec une sélection, la couleur est celle des traits choisis ; sans, elle est celle du crayon.
    if (outil === 'selection' && surChoix((tr) => ({ ...tr, couleur: c }))) return
    setOutil('crayon')
  }
  const choisirEpaisseur = (i: number) => {
    setEpaisseur(i)
    ecrireReglage(CLE_EPAISSEUR, String(i))
    // Comme Milanote, l'épaisseur ne change jamais des traits déjà posés : elle règle le crayon, et le volet se ferme.
    setVolet(null)
    setOutil('crayon')
  }
  // La barre reflète le premier trait choisi : sa couleur et sa taille y montent.
  useEffect(() => {
    const premier = choix.values().next().value
    if (!premier) return
    setCouleur(premier.couleur)
    const px = premier.epaisseur * echelle()
    let proche = 0
    EPAISSEURS_TRAIT.forEach((e, i) => {
      if (Math.abs(e.px - px) < Math.abs(EPAISSEURS_TRAIT[proche]!.px - px)) proche = i
    })
    setEpaisseur(proche)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choix])
  const supprimerChoix = () => {
    if (choix.size === 0) return
    valider(sansTraits(traits, choix), traits)
    setChoix(new Set())
  }
  const decaler = (dx: number, dy: number) => {
    if (choix.size === 0) return
    const r = deplacerTraits(traits, choix, dx, dy)
    valider(r.traits, traits)
    setChoix(r.choix)
  }
  const changerOutil = (o: Outil) => {
    setOutil(o)
    if (o !== 'selection') setChoix(new Set())
  }

  /** Pixels d'écran par unité de feuille, tel que la feuille s'affiche à cet instant. */
  const echelle = () => (surface.current ? surface.current.getBoundingClientRect().width / LARGEUR_FEUILLE : 1) || 1
  const dansFeuille = (e: { clientX: number; clientY: number }) => {
    const r = surface.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * LARGEUR_FEUILLE, y: ((e.clientY - r.top) / r.height) * hauteur }
  }
  /** Un geste qu'un troisième doigt annule : le tracé s'en va, la gomme et le glisser rendent les traits d'avant. */
  const abandonnerGeste = () => {
    const g = tire.current
    tire.current = null
    setEnCours(null)
    setMarquise(null)
    setEffacee(false)
    if (g && (g.type === 'gomme' || g.type === 'deplacer')) setTraits(g.avant)
    if (g?.type === 'deplacer') setChoix(g.choix)
  }
  const debut = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    doigts.current.add(e.pointerId)
    if (doigts.current.size > 2) return abandonnerGeste()
    // Un deuxième doigt ne commence pas un geste par-dessus celui qui court.
    if (tire.current) return
    setVolet(null)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Un pointeur que le navigateur ne suit plus : le trait se fait sans capture.
    }
    const { x, y } = dansFeuille(e)
    if (outil === 'crayon') {
      tire.current = { type: 'trace', points: [x, y], avant: traits, epaisseur: epaisseurFeuille(EPAISSEURS_TRAIT[epaisseur]!.px, echelle()), affinage: affinageDe(epaisseur) }
      setEnCours([x, y])
    } else if (outil === 'gomme') {
      tire.current = { type: 'gomme', avant: traits }
      setVise(null)
      setTraits((t) => gommer(t, x, y, GOMME_PX / echelle()))
    } else if (outil === 'pipette') {
      const prise = couleurSous(traits, x, y, CAPTURE_PX / echelle())
      if (prise) {
        choisirCouleur(prise)
        setOutil('crayon')
      }
    } else {
      const i = traitVise(traits, x, y, CAPTURE_PX / echelle())
      const ajoute = e.shiftKey || e.metaKey || e.ctrlKey
      if (i >= 0) {
        const r = appuiSurTrait(choix, traits[i]!, ajoute)
        setChoix(r.choix)
        // Retirer un trait du choix n'ouvre pas de glisser.
        if (r.glisse) tire.current = { type: 'deplacer', depart: { x, y }, avant: traits, choix: r.choix }
      } else {
        if (!ajoute) setChoix(new Set())
        tire.current = { type: 'marquise', depart: { x, y }, ajoute, base: ajoute ? choix : new Set() }
      }
    }
  }
  const deplacement = (e: React.PointerEvent) => {
    const g = tire.current
    if (g) setEffacee(presDuBas(e.clientY, window.innerHeight))
    if (!g) {
      if (outil === 'gomme') {
        const { x, y } = dansFeuille(e)
        const k = echelle()
        const i = traitVise(traits, x, y, GOMME_PX / k)
        setVise((v) => (i < 0 ? (v ? null : v) : v?.i === i ? v : { i, extra: CONTOUR_GOMME_PX / k }))
      }
      return
    }
    // Le navigateur regroupe parfois plusieurs mouvements en un : on les reprend tous.
    const evenements = e.nativeEvent.getCoalescedEvents?.() ?? []
    const sources = evenements.length > 0 ? evenements : [e.nativeEvent]
    if (g.type === 'trace') {
      let suite = g.points
      for (const m of sources) {
        const { x, y } = dansFeuille(m)
        suite = ajouterPoint(suite, x, y)
      }
      if (suite !== g.points) {
        g.points = suite
        setEnCours(suite)
      }
    } else if (g.type === 'gomme') {
      const k = echelle()
      for (const m of sources) {
        const { x, y } = dansFeuille(m)
        setTraits((t) => gommer(t, x, y, GOMME_PX / k))
      }
    } else if (g.type === 'deplacer') {
      const { x, y } = dansFeuille(e)
      const r = deplacerTraits(g.avant, g.choix, x - g.depart.x, y - g.depart.y)
      setTraits(r.traits)
      setChoix(r.choix)
    } else {
      const { x, y } = dansFeuille(e)
      setMarquise({ x0: g.depart.x, y0: g.depart.y, x1: x, y1: y })
    }
  }
  const fin = (e?: React.PointerEvent) => {
    if (e) doigts.current.delete(e.pointerId)
    const g = tire.current
    tire.current = null
    setEffacee(false)
    if (!g) return
    if (g.type === 'trace') {
      setEnCours(null)
      // Un simple clic sans déplacement laisse un trait de largeur nulle : comme Milanote, on l'écarte.
      if (g.points.length < 4) return
      valider([...g.avant, { points: arrondir(g.points), couleur, epaisseur: g.epaisseur, ...(g.affinage ? { affinage: g.affinage } : {}) }], g.avant)
    } else if (g.type === 'marquise') {
      const m = marquise
      setMarquise(null)
      if (m) setChoix(new Set([...g.base, ...traitsDansMarquise(traits, m)]))
    } else if (traits !== g.avant) {
      valider(traits, g.avant)
    }
  }

  const encours = useMemo(
    () => (enCours ? [{ points: enCours, couleur, epaisseur: epaisseurFeuille(EPAISSEURS_TRAIT[epaisseur]!.px, echelle()), affinage: affinageDe(epaisseur) }] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enCours, couleur, epaisseur],
  )

  const touche = (e: React.KeyboardEvent) => {
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (cmd && k === 'z') {
      e.preventDefault()
      if (e.shiftKey) retablir()
      else annuler()
      return true
    }
    if (cmd && k === 's') {
      e.preventDefault()
      finir()
      return true
    }
    if (cmd && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && outil === 'selection' && choix.size > 0) {
      e.preventDefault()
      const suite = ordonnerTraits(traits, choix, e.key === 'ArrowUp')
      if (suite !== traits) valider(suite, traits)
      return true
    }
    if (cmd && k === 'a') {
      e.preventDefault()
      if (outil === 'selection') setChoix(new Set(traits))
      return true
    }
    if (e.key === 'Escape') {
      if (volet) setVolet(null)
      else if (outil === 'selection' && choix.size > 0) setChoix(new Set())
      else abandonner()
      return true
    }
    if (cmd || e.altKey || (e.target as HTMLElement).tagName === 'INPUT') return false
    if (k === 'd' || k === 'm' || k === 'b') changerOutil('crayon')
    else if (k === 'v' || k === 's') changerOutil('selection')
    else if (k === 'e') changerOutil('gomme')
    else if (k === 'i') changerOutil('pipette')
    else if (outil === 'selection' && (k === 'delete' || k === 'backspace')) supprimerChoix()
    else if (outil === 'selection' && k.startsWith('arrow')) {
      const d = decalageFleche(k, e.shiftKey, 1 / echelle())
      if (d) decaler(d[0], d[1])
    }
    else if (k === 'c' && outil === 'crayon') setVolet((v) => (v === 'couleur' ? null : 'couleur'))
    else if (k === 'x') choisirCouleur(precedente)
    else if (k >= '1' && k <= '4') choisirEpaisseur(Number(k) - 1)
    else return false
    e.preventDefault()
    return true
  }

  return (
    <Surcouche etiquette={t('croquis.dessiner')} className="notak-croquis-fond" fermer={finir} surTouche={touche}>
      <div className="notak-croquis-feuille" style={{ '--croquis-rapport': LARGEUR_FEUILLE / hauteur } as React.CSSProperties}>
        <svg
          ref={surface}
          className="notak-croquis-surface"
          data-outil={outil}
          data-transparent={transparent || undefined}
          style={outil === 'crayon' ? { cursor: curseurCrayon(couleur) } : outil === 'gomme' ? { cursor: CURSEUR_GOMME } : undefined}
          viewBox={`0 0 ${LARGEUR_FEUILLE} ${hauteur}`}
          onPointerDown={debut}
          onPointerMove={deplacement}
          onPointerUp={fin}
          onPointerCancel={(e) => (doigts.current.delete(e.pointerId), abandonnerGeste())}
          onPointerLeave={() => setVise(null)}
        >
          <Traits traits={traits} vise={outil === 'gomme' ? vise : null} choisis={outil === 'selection' ? choix : undefined} contour={CONTOUR_CHOIX_PX / echelle()} suitLeTheme={transparent} />
          <Traits traits={encours} suitLeTheme={transparent} enCours />
          {marquise && (
            <rect
              className="notak-croquis-marquise"
              x={Math.min(marquise.x0, marquise.x1)}
              y={Math.min(marquise.y0, marquise.y1)}
              width={Math.abs(marquise.x1 - marquise.x0)}
              height={Math.abs(marquise.y1 - marquise.y0)}
            />
          )}
        </svg>
        <div className="notak-croquis-barre" role="toolbar" aria-label={t('croquis.outil')} data-effacee={effacee || undefined}>
          <button type="button" title={`${t('dessin.crayon')} (D)`} aria-label={t('dessin.crayon')} aria-pressed={outil === 'crayon'} onClick={() => changerOutil('crayon')}>
            {ico('croquis')}
          </button>
          <button type="button" title={`${t('dessin.selection')} (V)`} aria-label={t('dessin.selection')} aria-pressed={outil === 'selection'} onClick={() => changerOutil('selection')}>
            {ico('pointeur')}
          </button>
          <button type="button" title={`${t('dessin.gomme')} (E)`} aria-label={t('dessin.gomme')} aria-pressed={outil === 'gomme'} onClick={() => changerOutil('gomme')}>
            {ico('gomme')}
          </button>
          <span className="notak-croquis-sep" role="separator" />
          <span className="notak-croquis-volet-hote">
            <button type="button" title={`${t('couleur.titre')} (C)`} aria-label={t('couleur.titre')} aria-expanded={volet === 'couleur'} disabled={couleurGrisee} onClick={() => setVolet(volet === 'couleur' ? null : 'couleur')}>
              <span className="notak-croquis-pastille" style={{ background: couleur }} />
            </button>
            {volet === 'couleur' && !couleurGrisee && <VoletCouleur couleur={couleur} choisir={choisirCouleur} suggerees={suggerees} />}
          </span>
          <span className="notak-croquis-volet-hote">
            <button type="button" title={`${t('croquis.epaisseur')} (1-4)`} aria-label={t('croquis.epaisseur')} aria-expanded={volet === 'epaisseur'} disabled={epaisseurGrisee} onClick={() => setVolet(volet === 'epaisseur' ? null : 'epaisseur')}>
              <BarreEpaisseur i={epaisseur} />
            </button>
            {volet === 'epaisseur' && !epaisseurGrisee && <VoletEpaisseur epaisseur={epaisseur} choisir={choisirEpaisseur} />}
          </span>
          <span className="notak-croquis-sep" role="separator" />
          <button type="button" title={`${t('espace.annuler')} (⌘Z)`} aria-label={t('espace.annuler')} disabled={passe.length === 0} onClick={annuler}>
            {ico('annuler')}
          </button>
          <button type="button" title={`${t('espace.retablir')} (⌘⇧Z)`} aria-label={t('espace.retablir')} disabled={futur.length === 0} onClick={retablir}>
            {ico('retablir')}
          </button>
          <span className="notak-croquis-espace" />
          <button type="button" className="notak-croquis-texte" title="Esc" onClick={abandonner}>
            {modifie ? t('croquis.abandonner') : t('commun.annuler')}
          </button>
          <button type="button" className="notak-croquis-texte notak-croquis-enregistrer" title="⌘S" disabled={!modifie} onClick={finir}>
            {t('croquis.enregistrer')}
          </button>
        </div>
      </div>
    </Surcouche>
  )
}
