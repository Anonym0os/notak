import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Element } from './coeur/tableau'
import { BoutonEtiquettes } from './elements/decor/BoutonEtiquettes'
import { t } from './langue'
import { RANG_APRES_TETE, definition, tousLesOutilsCommunsRanges, tousLesTypes } from './elements/registre'
import type { ContexteToile, Outil } from './elements/types'
import { ContexteOutils } from './BoutonOutil'
import { type EntreeRepli, ORDRE, type Palier, useRepli } from './repli'
import { useBarreBornee, useMenusBornes } from './borner'
import { Icone } from './icones'
import { Infobulle } from './Infobulle'
import { MenuActions } from './MenuActions'
import { useMenu } from './menuUnique'
import { Vignette } from './vignettes'
import { useDessinLibreOuvert } from './elements/dessin/mode'
import { useGlissement } from './glissement'

/** Un outil de la barre, avec le type qui l'apporte. */
export interface OutilDeBarre {
  type: string
  outil: Outil
}

const cleOutil = (o: OutilDeBarre) => `${o.type}:${o.outil.libelle}`

/**
 * Ce qu'occupe, en px, ce qui ne se replie pas dans la barre de création : les marges, le « ••• », le séparateur, la
 * corbeille en bas, et un peu d'air. Les marges baissent avec la taille des tuiles.
 */
const fixeCreation = (p: Palier) => (p === 'grande' ? 20 : 12) + 30 + 21 + 60 + 12
/** Idem pour la barre de sélection : la flèche retour s'y ajoute, pas le séparateur. */
const fixeSelection = (p: Palier) => (p === 'grande' ? 20 : 12) + 44 + 34 + 60 + 12

/** L'ordre de repli d'un outil de la barre de création (relevé : Tableau 10, Image, Upload et Draw 2, le tiroir toujours). */
const entreeDeBarre = (o: OutilDeBarre): EntreeRepli => ({
  id: cleOutil(o),
  genre: 'tuile',
  ordre: o.outil.tiroir ? ORDRE.toujours : o.outil.groupe === 'action' ? 2 : o.type === 'tableau' ? ORDRE.tard : ORDRE.defaut,
  ...(o.outil.groupe === 'action' && !o.outil.tiroir ? { masque: true } : {}),
})

export const outilsDeBarre = (): OutilDeBarre[] =>
  tousLesTypes()
    .flatMap((d) => (d.outils ?? []).map((outil) => ({ type: d.type, outil })))
    .sort((a, b) => a.outil.rang - b.outil.rang)

/**
 * Échap referme d'abord un menu ouvert dans cette barre (un tiroir, une palette) sans rien désélectionner : `fermer`
 * remet la barre à neuf.
 */
function useEchapFerme(barre: { current: HTMLElement | null }, fermer: () => void) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !barre.current?.querySelector('[aria-expanded="true"]')) return
      e.stopPropagation()
      e.preventDefault()
      fermer()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [barre, fermer])
}

/**
 * La barre de gauche. Un outil se glisse sur la toile : c'est la toile qui suit le geste (`surAppui`).
 * Un simple clic ne crée rien : l'outil rebondit et une bulle rappelle qu'on le glisse (`rebond`).
 */
export function BarreOutils({
  grisee = false,
  surAppui,
  rebond,
  corbeille,
  nonTries,
}: {
  /** Aperçu d'un modèle : la barre reste visible, grisée à 30 % et sans clic. */
  grisee?: boolean
  surAppui(o: OutilDeBarre, e: React.PointerEvent): void
  rebond: { libelle: string; n: number } | null
  /** La corbeille, en bas de la barre : elle s'ouvre au clic et reçoit ce qu'on y lâche. */
  corbeille: { nombre: number; ouverte: boolean; basculer(): void }
  /** Les non triés, juste au-dessus : Cmd+\ les ouvre aussi. */
  nonTries: { nombre: number; ouverte: boolean; basculer(): void }
}) {
  const [tiroir, setTiroir, ancreTiroir] = useMenu()
  const grille = useRef<HTMLDivElement>(null)
  // La grille s'ouvre à droite de « ••• » ; si elle dépasse le bas de la fenêtre, elle remonte d'autant.
  useLayoutEffect(() => {
    const g = grille.current
    if (!tiroir || !g) return
    g.style.removeProperty('--notak-tiroir-remonte')
    const r = g.getBoundingClientRect()
    const depasse = r.bottom - (window.innerHeight - 8)
    if (depasse > 0) g.style.setProperty('--notak-tiroir-remonte', `${Math.min(depasse, r.top - 8)}px`)
  }, [tiroir])
  const nav = useRef<HTMLElement>(null)
  useGlissement(nav, 0)
  useEchapFerme(nav, () => setTiroir(false))
  // DESSIN-LIBRE : pendant le mode, la barre s'éteint et le bouton du dessin se montre ouvert.
  const dessinOuvert = useDessinLibreOuvert()
  const tous = outilsDeBarre()
  // La barre trop courte réduit ses tuiles, puis range des outils dans le « ••• » (jamais la corbeille).
  const entrees = useMemo(() => tous.filter((o) => !o.outil.tiroir).map(entreeDeBarre), [tous.map(cleOutil).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const { ranges, visibles } = useRepli(nav, entrees, fixeCreation)
  const bouton = (o: OutilDeBarre, dansTiroir = false) => {
    const rebondit = rebond?.libelle === o.outil.libelle
    const vignette = o.outil.vignette ? <Vignette nom={o.outil.vignette} /> : null
    return (
      <div key={`${o.type}:${o.outil.libelle}`} className="notak-outil-place">
        <Infobulle libelle={o.outil.libelle} {...(o.outil.raccourci ? { raccourci: o.outil.raccourci } : {})} cote="droite" contenu>
        <button
          type="button"
          className="notak-outil"
          data-genre={vignette ? 'vignette' : 'tuile'}
          aria-label={o.outil.libelle}
          aria-expanded={o.type === 'dessin' && dessinOuvert ? true : undefined}
          // La clé change à chaque clic : l'animation du rebond repart.
          data-rebond={rebondit ? rebond.n % 2 : undefined}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            surAppui(o, e)
            // Le tiroir se referme : l'outil sorti part avec le pointeur.
            if (dansTiroir) setTiroir(false)
          }}
        >
          <span className="notak-outil-icone">{vignette ?? o.outil.icone}</span>
          <span className="notak-outil-libelle">{o.outil.libelle}</span>
        </button>
        </Infobulle>
        {rebondit && (
          <div key={rebond.n} className="notak-bulle-outil" role="status">
            {t('barre.glisser')}
          </div>
        )}
      </div>
    )
  }
  const elementsVisibles = tous.filter((o) => !o.outil.tiroir && o.outil.groupe !== 'action' && visibles.has(cleOutil(o)))
  const caches = tous.filter((o) => o.outil.tiroir || ranges.has(cleOutil(o))).sort((a, b) => a.outil.rang - b.outil.rang)
  const actions = tous.filter((o) => !o.outil.tiroir && o.outil.groupe === 'action' && visibles.has(cleOutil(o)))
  return (
    <>
      <nav ref={nav} className="notak-barre-outils" data-eteinte={dessinOuvert || undefined} data-grisee={grisee || undefined} onPointerDown={(e) => e.stopPropagation()}>
        {elementsVisibles.map((o) => bouton(o))}
        {caches.length > 0 && (
          <div className="notak-outil-place" ref={ancreTiroir}>
            <Infobulle libelle={t('barre.plusOutils')} cote="droite" contenu>
              <button type="button" className="notak-outil-plus" aria-expanded={tiroir} aria-label={t('barre.plusOutils')} onClick={() => setTiroir(!tiroir)}>
                <Icone nom="plus" />
              </button>
            </Infobulle>
            {tiroir && (
              <div ref={grille} className="notak-tiroir">
                {caches.map((o) => bouton(o, true))}
                {/* Milanote n'a pas d'Étiquettes dans la barre de création : elles vivent ici. */}
                <BoutonEtiquettes />
              </div>
            )}
          </div>
        )}
        <div className="notak-barre-sep" />
        {actions.map((o) => bouton(o))}
        <div className="notak-barre-ressort" />
        <Infobulle libelle={t('corbeille.titre')} cote="droite" contenu>
          <button
            type="button"
            className="notak-outil"
            data-genre="corbeille"
            data-corbeille
            aria-expanded={corbeille.ouverte}
            aria-label={t('corbeille.titre')}
            onClick={corbeille.basculer}
          >
            <span className="notak-outil-icone"><Icone nom="corbeille" taille={26} /></span>
            <span className="notak-outil-libelle">{t('corbeille.titre')}{corbeille.nombre > 0 ? ` (${corbeille.nombre})` : ''}</span>
          </button>
        </Infobulle>
      </nav>
      {/* Les non triés, en haut à droite de la toile : leur nombre, et Cmd+\ les ouvre aussi. */}
      <Infobulle libelle={t('nonTries.titre')} raccourci="⌘\\" contenu>
        <button type="button" className="notak-non-tries-bouton" aria-expanded={nonTries.ouverte} onPointerDown={(e) => e.stopPropagation()} onClick={nonTries.basculer}>
          <strong>{nonTries.nombre}</strong> {t('nonTries.titre')}
        </button>
      </Infobulle>
    </>
  )
}

/** La barre de sélection : les outils de chaque type présent, puis les outils communs. À gauche, elle remplace la barre de création. */
export function BarreSelection({
  elements,
  contexte,
  position,
  aGauche = false,
}: {
  elements: Element[]
  contexte: ContexteToile
  position: { x: number; y: number }
  /** À la place de la barre de gauche, en colonne de tuiles, plutôt qu'au-dessus de la sélection. */
  aGauche?: boolean
}) {
  const [plus, setPlus, ancrePlus] = useMenu<HTMLSpanElement>()
  // À gauche, le « ••• » est un tiroir qui porte les outils secondaires (et ceux de chaque type d'une sélection mêlée).
  const [tiroir, setTiroir, ancreTiroir] = useMenu()
  const [cibleTiroir, setCibleTiroir] = useState<HTMLElement | null>(null)
  // Échap referme le menu ouvert : la barre repart de zéro, chaque outil avec ses menus fermés.
  const [cle, setCle] = useState(0)
  const barre = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLElement>(null)
  useGlissement(nav, 1)
  useEchapFerme(aGauche ? nav : barre, () => {
    setPlus(false)
    setTiroir(false)
    setCle((c) => c + 1)
  })
  useMenusBornes(aGauche ? nav : barre, !aGauche)
  useBarreBornee(barre, position.x, !aGauche)
  const dessinOuvert = useDessinLibreOuvert()
  // Les outils s'inscrivent ici ; trop nombreux pour la hauteur, les moins prioritaires passent dans le « ••• ».
  const [inscrits, setInscrits] = useState<EntreeRepli[]>([])
  const inscrire = useCallback((e: EntreeRepli) => {
    setInscrits((l) => [...l.filter((x) => x.id !== e.id), e])
    return () => setInscrits((l) => l.filter((x) => x.id !== e.id))
  }, [])
  const { ranges } = useRepli(nav, inscrits, fixeSelection)
  const parType = new Map<string, Element[]>()
  for (const e of elements) parType.set(e.contenu.type, [...(parType.get(e.contenu.type) ?? []), e])
  const blocs = [...parType].flatMap(([type, els]) => {
    const def = definition(type as Element['contenu']['type'])
    const Outils = def?.Outils
    const Apres = def?.OutilsApres
    const Fin = def?.OutilsFin
    if (!Outils && !Apres && !Fin) return []
    const tete = Outils ? <Outils key={type} elements={els} contexte={contexte} /> : null
    const suite = Apres ? <Apres key={`${type}:apres`} elements={els} contexte={contexte} /> : null
    // `OutilsFin` : après l'arrangement (la légende d'une image, chez Milanote).
    const fin = Fin ? <Fin key={`${type}:fin`} elements={els} contexte={contexte} /> : null
    return [{ type, nom: def?.nom ?? type, n: els.length, tete, suite, fin, rendu: <>{tete}{suite}{fin}</> }]
  })
  // Les outils communs, dans l'ordre de leur rang ; ceux du type qui suivent les étiquettes, réactions et commentaire
  // (`OutilsApres`) s'intercalent avant l'arrangement.
  const communsRanges = tousLesOutilsCommunsRanges()
  const commun = ({ outil: O }: (typeof communsRanges)[number], i: number) => <O key={`c${i}`} elements={elements} contexte={contexte} />
  const communs = communsRanges.filter((x) => x.rang < RANG_APRES_TETE).map(commun)
  const communsSuite = communsRanges.filter((x) => x.rang >= RANG_APRES_TETE).map((x, i) => commun(x, i + 100))
  // Une sélection d'un seul type montre ses outils ; une sélection mêlée ne montre que ce qui vaut pour tous,
  // et range les outils de chaque type derrière « … ».
  const mele = parType.size > 1
  if (blocs.length === 0 && communs.length + communsSuite.length === 0) return null

  if (aGauche) {
    return (
      <nav ref={nav} className="notak-barre-outils" data-selection data-eteinte={dessinOuvert || undefined} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <Infobulle libelle={t('barre.retour')} cote="droite" contenu>
          <button type="button" className="notak-barre-retour" aria-label={t('barre.retour')} onClick={() => contexte.choisir([])}>
            <Icone nom="gauche" taille={22} />
          </button>
        </Infobulle>
        <ContexteOutils.Provider value={{ aGauche: true, plus: cibleTiroir, ranges, inscrire }}>
          <div key={cle} className="notak-barre-selection" data-a-gauche>
            {!mele && blocs.map((b) => b.tete)}
            {communs}
            {!mele && blocs.map((b) => b.suite)}
            {communsSuite}
            {!mele && blocs.map((b) => b.fin)}
            <div className="notak-outil-place notak-selection-plus" ref={ancreTiroir}>
              <Infobulle libelle={t('barre.plusOutils')} cote="droite" contenu>
                <button type="button" className="notak-outil-plus" aria-expanded={tiroir} aria-label={t('barre.plusOutils')} onClick={() => setTiroir(!tiroir)}>
                  <Icone nom="plus" />
                </button>
              </Infobulle>
              <div className="notak-tiroir" hidden={!tiroir}>
                <div className="notak-tiroir-grille" ref={setCibleTiroir} />
                {/* Le menu d'actions du « ••• » : Verrouiller, plans, convertir, ouvrir… */}
                <MenuActions elements={elements} contexte={contexte} fermer={() => setTiroir(false)} />
                {mele &&
                  blocs.map((b) => (
                    <div key={b.type} className="notak-tiroir-type">
                      <span className="notak-barre-plus-nom">
                        {b.nom}
                        {b.n > 1 ? ` (${b.n})` : ''}
                      </span>
                      {/* Ici les outils restent à leur place : le tiroir est déjà leur rangement. */}
                      <ContexteOutils.Provider value={{ aGauche: true, plus: null }}>
                        <div className="notak-tiroir-type-outils">{b.rendu}</div>
                      </ContexteOutils.Provider>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </ContexteOutils.Provider>
      </nav>
    )
  }
  return (
    <div
      ref={barre}
      key={cle}
      className="notak-barre-selection"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {!mele && blocs.map((b) => b.tete)}
      {communs}
      {!mele && blocs.map((b) => b.suite)}
      {communsSuite}
      {!mele && blocs.map((b) => b.fin)}
      {mele && blocs.length > 0 && (
        <span className="notak-barre-plus" ref={ancrePlus}>
          <Infobulle libelle={t('barre.outilsParType')} contenu>
            <button type="button" aria-label={t('barre.outilsParType')} aria-expanded={plus} aria-pressed={plus} onClick={() => setPlus(!plus)}>
              <Icone nom="plus" />
            </button>
          </Infobulle>
          {plus && (
            <div className="notak-barre-plus-menu" role="menu">
              {blocs.map((b) => (
                <div key={b.type} className="notak-barre-plus-groupe">
                  <span className="notak-barre-plus-nom">
                    {b.nom}
                    {b.n > 1 ? ` (${b.n})` : ''}
                  </span>
                  <div className="notak-barre-plus-outils">{b.rendu}</div>
                </div>
              ))}
            </div>
          )}
        </span>
      )}
    </div>
  )
}
