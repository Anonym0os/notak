import { FOND_NOTE, Icone, type NomIcone, type ResumeContenu } from '@notak/tableau'
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type EntreeBibliotheque, lireBibliotheque } from './api'
import { t } from './langue'

/**
 * La bibliothèque : tout ce que le compte peut ouvrir, à plat, en vignettes. Les toiles restent la façon de ranger ;
 * ici on parcourt, quand on cherche une carte ou un document sans se souvenir d'un mot. Un seul tri : la dernière
 * ouverture, puis le titre.
 */

export const VUES = ['recents', 'toiles', 'cartes', 'documents', 'favoris', 'partages'] as const
export type Vue = (typeof VUES)[number]

const ICONE_VUE: Record<Vue, NomIcone> = {
  recents: 'horloge',
  toiles: 'tableau',
  cartes: 'carteMentale',
  documents: 'document',
  favoris: 'etoile',
  partages: 'equipe',
}
const ICONE_GENRE: Record<EntreeBibliotheque['genre'], NomIcone> = { toile: 'tableau', arbre: 'carteMentale', document: 'document' }

/** Les récents s'arrêtent là : au-delà, on passe par les onglets d'un genre. */
const RECENTS_MAX = 48

const parOuverture = (a: EntreeBibliotheque, b: EntreeBibliotheque) =>
  (b.vu ?? -1) - (a.vu ?? -1) || (a.titre || '￿').localeCompare(b.titre || '￿', undefined, { sensitivity: 'base', numeric: true })

/** Ce que montre chaque onglet, déjà trié. */
export function entreesDe(vue: Vue, toutes: readonly EntreeBibliotheque[]): EntreeBibliotheque[] {
  const garder = (f: (e: EntreeBibliotheque) => boolean) => toutes.filter(f).sort(parOuverture)
  switch (vue) {
    case 'recents':
      return garder((e) => e.vu !== null).slice(0, RECENTS_MAX)
    case 'toiles':
      return garder((e) => e.genre === 'toile')
    case 'cartes':
      return garder((e) => e.genre === 'arbre')
    case 'documents':
      return garder((e) => e.genre === 'document')
    case 'favoris':
      return garder((e) => e.favori)
    case 'partages':
      return garder((e) => e.partage)
  }
}

/** L'adresse qui ouvre une entrée : la toile, ou l'élément en grand sur sa toile. */
export const adresseDe = (e: EntreeBibliotheque) =>
  e.element === null ? `/t/${encodeURIComponent(e.tableau)}` : `/t/${encodeURIComponent(e.tableau)}/e/${encodeURIComponent(e.element)}`

/** L'onglet que l'adresse nomme, ou `null` : la page choisit. */
const vueDeLAdresse = (): Vue | null => {
  const v = new URLSearchParams(location.search).get('vue')
  return (VUES as readonly string[]).includes(v ?? '') ? (v as Vue) : null
}

export function PageBibliotheque({ charger = lireBibliotheque }: { charger?: () => Promise<EntreeBibliotheque[]> }) {
  const [toutes, setToutes] = useState<EntreeBibliotheque[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [choisie, setChoisie] = useState<Vue | null>(vueDeLAdresse)
  const onglets = useRef<(HTMLButtonElement | null)[]>([])

  const lire = useCallback(() => {
    setErreur(null)
    charger().then(setToutes, (x: Error) => setErreur(x.message || t('commun.echec')))
  }, [charger])
  useEffect(lire, [lire])

  const choisir = (v: Vue) => {
    setChoisie(v)
    history.replaceState(null, '', v === 'recents' ? location.pathname : `${location.pathname}?vue=${v}`)
  }
  // Les flèches passent d'un onglet à l'autre, comme dans toute liste d'onglets.
  const surTouche = (e: KeyboardEvent) => {
    const i = VUES.indexOf(vue)
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? VUES.length - 1 : null
    if (j === null) return
    e.preventDefault()
    const v = VUES[(j + VUES.length) % VUES.length]!
    choisir(v)
    onglets.current[VUES.indexOf(v)]?.focus()
  }

  const parVue = useMemo(() => (toutes ? Object.fromEntries(VUES.map((v) => [v, entreesDe(v, toutes)])) : null) as Record<Vue, EntreeBibliotheque[]> | null, [toutes])
  // On commence par les récents ; tant qu'on n'a rien ouvert, par les toiles.
  const vue: Vue = choisie ?? (parVue && parVue.recents.length === 0 ? 'toiles' : 'recents')
  // Sur un écran étroit, les onglets défilent : celui qu'on regarde reste en vue, encore quand leurs nombres arrivent.
  useEffect(() => {
    // Un bloc, pas une expression : les navigateurs récents rendent une promesse, que React prendrait pour un nettoyage.
    onglets.current[VUES.indexOf(vue)]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [vue, parVue])
  const visibles = parVue?.[vue] ?? []

  return (
    <main className="biblio">
      <header className="biblio-tete">
        <a className="biblio-retour" href="/">
          <Icone nom="gauche" taille={16} />
          {t('biblio.retour')}
        </a>
        <h1>{t('biblio.titre')}</h1>
      </header>

      <div className="biblio-onglets" role="tablist" aria-label={t('biblio.titre')} onKeyDown={surTouche}>
        {VUES.map((v, i) => (
          <button
            key={v}
            ref={(b) => void (onglets.current[i] = b)}
            type="button"
            role="tab"
            id={`biblio-onglet-${v}`}
            aria-selected={vue === v}
            aria-controls="biblio-panneau"
            tabIndex={vue === v ? 0 : -1}
            onClick={() => choisir(v)}
          >
            <Icone nom={ICONE_VUE[v]} taille={16} />
            {t(`biblio.vue.${v}`)}
            {parVue && parVue[v].length > 0 && <small>{parVue[v].length}</small>}
          </button>
        ))}
      </div>

      <section className="biblio-panneau" id="biblio-panneau" role="tabpanel" aria-labelledby={`biblio-onglet-${vue}`} aria-busy={!toutes && !erreur}>
        {erreur ? (
          <div className="biblio-vide" role="alert">
            <p>{erreur}</p>
            <button type="button" className="bouton" onClick={lire}>
              {t('bandeau.reessayer')}
            </button>
          </div>
        ) : !toutes ? (
          <ul className="biblio-grille" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="biblio-attente" />
            ))}
          </ul>
        ) : visibles.length === 0 ? (
          <div className="biblio-vide">
            <Icone nom={ICONE_VUE[vue]} taille={28} trait={1.5} />
            <p>{t(`biblio.vide.${vue}`)}</p>
            <small>{t(`biblio.vide.${vue}.aide`)}</small>
          </div>
        ) : (
          <ul className="biblio-grille">
            {visibles.map((e) => (
              <li key={`${e.tableau}/${e.element ?? ''}`}>
                <a className="biblio-carte" href={adresseDe(e)}>
                  <Vignette resume={e.resume} />
                  <span className="biblio-carte-titre">{e.titre || t('commun.sansTitre')}</span>
                  <span className="biblio-carte-ou">
                    <Icone nom={ICONE_GENRE[e.genre]} taille={14} />
                    <span>{e.ou ? t('biblio.dans', { toile: e.ou || t('commun.sansTitre') }) : t(`biblio.genre.${e.genre}`)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

/** Le dessin d'une entrée : le plan d'une toile, le central et les branches d'une carte, la page d'un document. */
function Vignette({ resume }: { resume: ResumeContenu }) {
  if (resume.genre === 'document') {
    return (
      <span className="biblio-vignette" data-genre="document" aria-hidden>
        <span className="biblio-feuille">
          <strong>{resume.titre}</strong>
          {resume.lignes.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </span>
      </span>
    )
  }
  if (resume.genre === 'arbre') return <VignetteCarte central={resume.titre} branches={resume.branches} />
  return (
    <span className="biblio-vignette" data-genre="toile" aria-hidden>
      {resume.boites.length === 0 ? <span className="biblio-vignette-vide">{t('tableau.vide')}</span> : <PlanToile boites={resume.boites} />}
    </span>
  )
}

const fondDe = (fond: string) =>
  fond === 'colonne' ? '#e3e6ea' : fond === 'image' ? '#c9ced6' : fond in FOND_NOTE ? FOND_NOTE[fond as keyof typeof FOND_NOTE] : '#ffffff'

function PlanToile({ boites }: { boites: [number, number, number, number, string][] }) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y, l, h] of boites) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + l), Math.max(y1, y + h)]
  // Une marge, et pas moins qu'une toile de quelques cartes : une seule note ne remplit pas toute la vignette.
  const [l, h] = [Math.max(x1 - x0, 60), Math.max(y1 - y0, 45)]
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2]
  const m = 6
  return (
    <svg viewBox={`${cx - l / 2 - m} ${cy - h / 2 - m} ${l + 2 * m} ${h + 2 * m}`} preserveAspectRatio="xMidYMid meet">
      {boites.map(([x, y, lb, hb, fond], i) => (
        <rect key={i} x={x} y={y} width={lb} height={hb} rx={0.8} fill={fondDe(fond)} stroke="rgb(0 0 0 / 0.1)" strokeWidth={0.4} />
      ))}
    </svg>
  )
}

/** Le central au milieu, ses branches de part et d'autre, comme une carte équilibrée. */
function VignetteCarte({ central, branches }: { central: string; branches: string[] }) {
  const [L, H] = [240, 180]
  const coupe = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  const titre = coupe(central || t('commun.sansTitre'), 18)
  const lc = Math.min(116, titre.length * 6.4 + 24)
  const droite = branches.slice(0, Math.ceil(branches.length / 2))
  const gauche = branches.slice(droite.length)
  const cote = (liste: string[], sens: 1 | -1) =>
    liste.map((b, i) => {
      const y = (H / (liste.length + 1)) * (i + 1)
      const texte = coupe(b || '·', 11)
      const lb = Math.min(72, texte.length * 5.2 + 14)
      const xb = sens === 1 ? L - 10 - lb : 10
      const depart = L / 2 + (sens * lc) / 2
      const arrivee = sens === 1 ? xb : xb + lb
      const milieu = (depart + arrivee) / 2
      return (
        <g key={`${sens}${i}`}>
          <path d={`M${depart} ${H / 2} C${milieu} ${H / 2} ${milieu} ${y} ${arrivee} ${y}`} fill="none" stroke="#aeb5bf" strokeWidth={1.4} />
          <rect x={xb} y={y - 9} width={lb} height={18} rx={9} fill="#fff" stroke="#d5d9de" />
          <text x={xb + lb / 2} y={y + 3.2} textAnchor="middle" fontSize={9} fill="#323b4a">
            {texte}
          </text>
        </g>
      )
    })
  return (
    <span className="biblio-vignette" data-genre="arbre" aria-hidden>
      <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="xMidYMid meet">
        {cote(droite, 1)}
        {cote(gauche, -1)}
        <rect x={(L - lc) / 2} y={H / 2 - 14} width={lc} height={28} rx={8} fill="#323b4a" />
        <text x={L / 2} y={H / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
          {titre}
        </text>
      </svg>
    </span>
  )
}
