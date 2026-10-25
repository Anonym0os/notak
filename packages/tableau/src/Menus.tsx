import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Element, Id } from './coeur/tableau'
import { definition } from './elements/registre'
import { t, tn } from './langue'
import type { ContexteToile, ResultatRecherche } from './elements/types'
import { Icone } from './icones'
import { PastillePersonne } from './pastille'

/** Une entrée du menu ; `null` trace un séparateur. */
export type Entree = {
  libelle: string
  raccourci?: string
  coche?: boolean
  /** Le menu reste ouvert après le choix (une bascule). */
  reste?: boolean
  desactive?: boolean
  /** Un sous-menu qui s'ouvre à droite (au survol, au clic ou avec la flèche droite). */
  sous?: Entree[]
  /** Une ligne d'information, sans clic : une personne (avatar) et ce qu'elle a fait. */
  info?: { nom: string; couleur?: string; photo?: string }
  /** Une pastille de couleur devant le libellé (les couleurs du canevas). */
  pastille?: string
  faire(): void
} | null

/** Les touches d'un raccourci, une pastille chacune : « ⇧⌘Z » donne ⇧, ⌘, Z. */
export const touchesDe = (raccourci: string): string[] => {
  const touches: string[] = []
  let reste = raccourci
  while (reste && '⌘⌥⇧⌃'.includes(reste[0]!)) {
    touches.push(reste[0]!)
    reste = reste.slice(1)
  }
  if (reste) touches.push(reste)
  return touches
}

/** Le raccourci d'une entrée de menu, une pastille par touche. */
export function Raccourci({ touches }: { touches: string }) {
  return (
    <span className="notak-menu-touches" aria-label={touches}>
      {touchesDe(touches).map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  )
}

/** L'écart gardé entre un menu et le bord de la fenêtre. */
const BORD_MENU = 8

/**
 * Où poser un sous-menu pour qu'il reste tout entier dans la fenêtre : à droite de son entrée, sinon à gauche ; aligné
 * sur elle, sinon remonté juste ce qu'il faut. Plus haut que la fenêtre, il défile. `liste` est sa boîte telle qu'il
 * s'ouvre (à droite, aligné, en px de la fenêtre) ; le résultat dit le côté, la remontée et la hauteur maximale.
 */
export function placerSousMenu(
  liste: { left: number; top: number; width: number; height: number },
  entree: { left: number },
  fenetre: { largeur: number; hauteur: number },
): { aGauche: boolean; remonte: number; hauteurMax: number } {
  const hauteurMax = fenetre.hauteur - 2 * BORD_MENU
  const aGauche = liste.left + liste.width > fenetre.largeur - BORD_MENU && entree.left - liste.width - 2 >= BORD_MENU
  const bas = liste.top + Math.min(liste.height, hauteurMax)
  const remonte = Math.max(0, Math.min(bas - (fenetre.hauteur - BORD_MENU), liste.top - BORD_MENU))
  return { aGauche, remonte, hauteurMax }
}

/** La liste d'un sous-menu, ramenée dans la fenêtre dès qu'elle paraît (`placerSousMenu`). Flèche gauche y revient. */
function SousListe({ children, retour }: { children: React.ReactNode; retour(ev: React.KeyboardEvent<HTMLDivElement>): void }) {
  const liste = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ aGauche: boolean; remonte: number; hauteurMax: number } | null>(null)
  useLayoutEffect(() => {
    const n = liste.current
    const entree = n?.parentElement
    if (!n || !entree) return
    const r = n.getBoundingClientRect()
    setPlace(
      placerSousMenu(
        { left: r.left, top: r.top, width: r.width, height: n.scrollHeight },
        { left: entree.getBoundingClientRect().left },
        { largeur: window.innerWidth, hauteur: window.innerHeight },
      ),
    )
  }, [])
  return (
    <div
      ref={liste}
      className="notak-menu notak-menu-sous-liste"
      role="menu"
      data-a-gauche={place?.aGauche || undefined}
      style={place ? { marginTop: -place.remonte, maxHeight: place.hauteurMax } : { visibility: 'hidden' }}
      onKeyDown={(ev) => {
        if (ev.key !== 'ArrowLeft') return
        ev.preventDefault()
        ev.stopPropagation()
        retour(ev)
      }}
    >
      {children}
    </div>
  )
}

/**
 * Le menu du clic droit, posé au point cliqué et ramené dans la toile s'il déborde. Il prend le focus : les flèches
 * passent d'une entrée à l'autre (les grisées sont sautées), Entrée choisit, une lettre va à l'entrée qui commence
 * par elle. Un clic dehors, Échap, un redimensionnement de la fenêtre ou une entrée choisie le ferment ; le bouton
 * droit relâché sur une entrée la choisit aussi.
 */
export function MenuContextuel({ x, y, entrees, fermer }: { x: number; y: number; entrees: Entree[]; fermer(): void }) {
  const boite = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ x, y })
  const [sousOuvert, setSousOuvert] = useState<string | null>(null)
  const ouvertA = useRef(performance.now())
  useLayoutEffect(() => {
    const n = boite.current
    const toile = n?.parentElement
    if (!n || !toile) return
    setPlace({
      x: Math.max(8, Math.min(x, toile.clientWidth - n.offsetWidth - 8)),
      y: Math.max(8, Math.min(y, toile.clientHeight - n.offsetHeight - 8)),
    })
    n.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [x, y])
  useEffect(() => {
    const dehors = (e: PointerEvent) => !boite.current?.contains(e.target as Node) && fermer()
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    // La molette ne fait pas défiler la toile sous un menu ouvert.
    const molette = (e: WheelEvent) => !boite.current?.contains(e.target as Node) && e.preventDefault()
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', touche, true)
    document.addEventListener('wheel', molette, { capture: true, passive: false })
    window.addEventListener('resize', fermer)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', touche, true)
      document.removeEventListener('wheel', molette, true)
      window.removeEventListener('resize', fermer)
    }
  }, [fermer])
  // Pas deux séparateurs de suite, ni au bord.
  const propres = entrees.filter((e, i, t) => e !== null || (i > 0 && i < t.length - 1 && t[i - 1] !== null))
  const avecCoches = propres.some((e) => e?.coche !== undefined)
  const choisir = (e: Exclude<Entree, null>) => {
    if (!e.reste) fermer()
    e.faire()
  }
  const clavier = (ev: React.KeyboardEvent) => {
    ev.stopPropagation()
    const boutons = [...(boite.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    if (!boutons.length) return
    const i = boutons.indexOf(document.activeElement as HTMLButtonElement)
    let cible: HTMLButtonElement | undefined
    if (ev.key === 'ArrowDown') cible = boutons[(i + 1) % boutons.length]
    else if (ev.key === 'ArrowUp') cible = boutons[(i - 1 + boutons.length) % boutons.length]
    else if (ev.key === 'Home') cible = boutons[0]
    else if (ev.key === 'End') cible = boutons[boutons.length - 1]
    else if (ev.key.length === 1 && /\p{L}/u.test(ev.key)) {
      const k = ev.key.toLocaleLowerCase()
      const suite = [...boutons.slice(i + 1), ...boutons.slice(0, i + 1)]
      cible = suite.find((b) => b.textContent?.trim().toLocaleLowerCase().startsWith(k))
    } else return
    ev.preventDefault()
    cible?.focus()
  }
  /** Une entrée du menu, ou d'un sous-menu (`niveau` 1). */
  const rendre = (e: Entree, i: number, niveau: number): React.ReactNode => {
    if (e === null) return <div key={`s${i}`} className="notak-menu-sep" role="separator" />
    if (e.info) {
      return (
        <div key={e.libelle} className="notak-menu-meta">
          <PastillePersonne className="notak-decor-personne" nom={e.info.nom} couleur={e.info.couleur ?? ''} adresse={e.info.photo} titre="" />
          <span>{e.libelle}</span>
        </div>
      )
    }
    if (e.sous) {
      const ouvert = sousOuvert === e.libelle
      const sous = e.sous.filter((x, k, l) => x !== null || (k > 0 && k < l.length - 1 && l[k - 1] !== null))
      return (
        <div key={e.libelle} className="notak-menu-sous" onPointerLeave={() => setSousOuvert((o) => (o === e.libelle ? null : o))}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={ouvert}
            onPointerEnter={(ev) => {
              ev.currentTarget.focus({ preventScroll: true })
              setSousOuvert(e.libelle)
            }}
            onClick={() => setSousOuvert(e.libelle)}
            onKeyDown={(ev) => {
              if (ev.key !== 'ArrowRight' && ev.key !== 'Enter' && ev.key !== ' ') return
              ev.preventDefault()
              ev.stopPropagation()
              setSousOuvert(e.libelle)
              requestAnimationFrame(() => ev.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.notak-menu-sous-liste button:not(:disabled)')?.focus({ preventScroll: true }))
            }}
          >
            <span className="notak-menu-libelle">{e.libelle}</span>
            <Icone nom="chevronDroite" taille={14} />
          </button>
          {ouvert && (
            <SousListe
              retour={(ev) => {
                setSousOuvert(null)
                ev.currentTarget.parentElement?.querySelector<HTMLButtonElement>(':scope > button')?.focus({ preventScroll: true })
              }}
            >
              {sous.map((x, k) => rendre(x, k, niveau + 1))}
            </SousListe>
          )}
        </div>
      )
    }
    return (
      <button
        key={e.libelle}
        type="button"
        role={e.coche === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={e.coche}
        disabled={e.desactive}
        onPointerEnter={(ev) => {
          ev.currentTarget.focus({ preventScroll: true })
          if (niveau === 0) setSousOuvert(null)
        }}
        onPointerUp={(ev) => {
          // Appuyer du bouton droit, glisser jusqu'à l'entrée et relâcher la choisit (pas le relâchement qui ouvre).
          if (ev.button === 2 && performance.now() - ouvertA.current > 250) choisir(e)
        }}
        onClick={() => choisir(e)}
      >
        {e.pastille && <span className="notak-menu-pastille" style={{ background: e.pastille }} aria-hidden />}
        <span className="notak-menu-libelle">{e.libelle}</span>
        {e.raccourci && <Raccourci touches={e.raccourci} />}
        {(avecCoches || niveau > 0) && <span className="notak-menu-coche">{e.coche ? <Icone nom="coche" taille={14} /> : null}</span>}
      </button>
    )
  }
  return (
    <div
      ref={boite}
      className="notak-menu"
      role="menu"
      style={{ left: place.x, top: place.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={clavier}
    >
      {propres.map((e, i) => rendre(e, i, 0))}
    </div>
  )
}

const resume = (e: Element, contexte: ContexteToile) => {
  const def = definition(e.contenu.type)
  return def?.resume?.(e.contenu as never, contexte).trim() || def?.nom || t('menu.element')
}

/**
 * La corbeille du tableau : ce qu'on y a mis, du plus récent au plus ancien. On remet un élément où il était ;
 * vider la corbeille demande confirmation, et c'est le seul geste qui efface vraiment.
 */
export function PanneauCorbeille({
  elements,
  contexte,
  restaurer,
  vider,
  fermer,
}: {
  elements: Element[]
  contexte: ContexteToile
  restaurer(e: Element): void
  vider(): void
  fermer(): void
}) {
  const [confirmer, setConfirmer] = useState(false)
  return (
    <div className="notak-corbeille" role="dialog" aria-label={t('corbeille.titre')} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="notak-corbeille-tete">
        <strong>{t('corbeille.titre')}</strong>
        <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
          <Icone nom="fermer" />
        </button>
      </div>
      {elements.length === 0 ? (
        <p className="notak-corbeille-vide">{t('corbeille.vide')}</p>
      ) : (
        <ul>
          {elements.map((e) => (
            <li key={e.id}>
              <span className="notak-corbeille-nom">{resume(e, contexte)}</span>
              <button type="button" onClick={() => restaurer(e)}>
                {t('corbeille.remettre')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {elements.length > 0 &&
        (confirmer ? (
          <div className="notak-corbeille-pied">
            <span>{t('corbeille.confirmer')}</span>
            <button type="button" className="notak-danger" onClick={vider}>
              {t('corbeille.effacer')}
            </button>
            <button type="button" onClick={() => setConfirmer(false)}>
              {t('commun.annuler')}
            </button>
          </div>
        ) : (
          <div className="notak-corbeille-pied">
            <button type="button" onClick={() => setConfirmer(true)}>
              {t('corbeille.vider')}
            </button>
          </div>
        ))}
    </div>
  )
}

/**
 * La recherche dans le tableau ouvert : ce qui ne correspond pas s'efface sur la toile, Entrée montre le résultat
 * suivant (Maj+Entrée le précédent), Échap ferme.
 */
export function Recherche(props: {
  requete: string
  appel: number
  nombre: number
  rang: number
  changer(r: string): void
  aller(sens: 1 | -1): void
  fermer(): void
  /** Chercher aussi dans les autres tableaux (`Services.rechercherPartout`) : leurs résultats se listent dessous. */
  partout?(requete: string): Promise<ResultatRecherche[]>
  /** Ouvrir le tableau d'un résultat (`Services.ouvrirTableau`). */
  ouvrirTableau?(id: Id): void
  /** Le tableau ouvert, dont les résultats sont déjà sur la toile. */
  ici?: Id
}) {
  const { requete, appel, nombre, rang, changer, aller, fermer, partout, ouvrirTableau, ici } = props
  const champ = useRef<HTMLInputElement>(null)
  const [ailleurs, setAilleurs] = useState<ResultatRecherche[]>([])
  useEffect(() => {
    if (!partout || !requete.trim()) return setAilleurs([])
    let vivant = true
    // On attend la fin de la frappe : un aller-retour au serveur par lettre serait de trop.
    const delai = setTimeout(() => {
      partout(requete).then(
        (r) => vivant && setAilleurs(r.filter((x) => x.tableau !== ici)),
        () => vivant && setAilleurs([]),
      )
    }, 250)
    return () => {
      vivant = false
      clearTimeout(delai)
    }
  }, [partout, requete, ici])
  useEffect(() => {
    champ.current?.focus()
    champ.current?.select()
  }, [appel])
  const compte = !requete.trim() ? '' : nombre === 0 ? t('recherche.aucun') : rang < 0 ? tn('recherche.resultats', nombre) : t('recherche.rang', { rang: rang + 1, n: nombre })
  return (
    <div className="notak-recherche" role="search" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <input
        ref={champ}
        type="search"
        placeholder={partout ? t('recherche.partout') : t('recherche.ici')}
        aria-label={t('recherche.ici')}
        value={requete}
        spellCheck={false}
        onChange={(e) => changer(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            aller(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            fermer()
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault()
            champ.current?.select()
          }
        }}
      />
      <span className="notak-recherche-compte" aria-live="polite">
        {compte}
      </span>
      <button type="button" title={t('recherche.precedent')} aria-label={t('recherche.precedent')} disabled={nombre === 0} onClick={() => aller(-1)}>
        <Icone nom="haut" />
      </button>
      <button type="button" title={t('recherche.suivant')} aria-label={t('recherche.suivant')} disabled={nombre === 0} onClick={() => aller(1)}>
        <Icone nom="bas" />
      </button>
      <button type="button" title={t('recherche.fermer')} aria-label={t('recherche.fermer')} onClick={fermer}>
        <Icone nom="fermer" />
      </button>
      {ailleurs.length > 0 && (
        <ul className="notak-recherche-ailleurs" aria-label={t('recherche.ailleurs')}>
          {ailleurs.map((r) => (
            <li key={`${r.tableau}/${r.element ?? ''}`}>
              <button
                type="button"
                disabled={!ouvrirTableau}
                onClick={() => {
                  ouvrirTableau?.(r.tableau)
                  fermer()
                }}
              >
                <strong>{r.titre || t('commun.sansTitre')}</strong>
                {r.element && <span>{r.extrait}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** Les touches telles qu'on les lit sur son clavier : ⌘ sur Mac, Ctrl ailleurs. */
export const touches = (v: string) =>
  MOTS_DE_TOUCHE[v] ? t(MOTS_DE_TOUCHE[v]) : MAC ? v : v.replace(/⌘/g, 'Ctrl+').replace(/⌥/g, 'Alt+').replace(/⇧/g, t('raccourcis.touche.maj'))

/** Les groupes de la fenêtre des raccourcis : le titre et le quoi sont des clés de texte, les touches sont à lire telles quelles. */
export const RACCOURCIS: { titre: string; lignes: [string, string][] }[] = [
  {
    titre: 'raccourcis.elements',
    lignes: [
      ['raccourcis.modifier', '↩'],
      ['raccourcis.finirModif', 'Échap'],
      ['raccourcis.nouveauDessous', '⌘↩'],
      ['raccourcis.dupliquer', '⌘D'],
      ['raccourcis.presspapiers', '⌘X  ⌘C  ⌘V'],
      ['raccourcis.corbeille', '⌫'],
      ['raccourcis.deplacer', '←  →  ↑  ↓'],
      ['raccourcis.plans', '⇧⌘↑  ⇧⌘↓'],
      ['raccourcis.relier', '⌘K'],
      ['raccourcis.toutSelectionner', '⌘A'],
      ['raccourcis.annulerRetablir', '⌘Z  ⇧⌘Z'],
    ],
  },
  {
    titre: 'raccourcis.arranger',
    lignes: [
      ['raccourcis.alignerHorizontal', '⌥A  ⌥D'],
      ['raccourcis.alignerVertical', '⌥W  ⌥S'],
      ['raccourcis.centrer', '⌥H  ⌥V'],
      ['raccourcis.repartir', '⌥⇧⌘H  ⌥⇧⌘V'],
    ],
  },
  {
    titre: 'raccourcis.vue',
    lignes: [
      ['raccourcis.zoom', '⌘+  ⌘−  ⌘0'],
      ['raccourcis.toutVoir', 'Z'],
      ['raccourcis.attraper', 'Espace + glisser'],
      ['raccourcis.chercher', '⌘F'],
      ['raccourcis.ouvrirTableau', 'Espace'],
      ['raccourcis.parent', '⌘U  ⇧⌘U'],
      ['raccourcis.reculer', '⌘[  ⌘]'],
      ['raccourcis.themeSombre', '⇧⌘D'],
      ['raccourcis.presentation', '⌥⌘P'],
      ['raccourcis.grille', '⇧⌘,  ⇧⌘.'],
      ['raccourcis.reglages', '⌘,'],
      ['raccourcis.aide', '/'],
    ],
  },
  {
    titre: 'raccourcis.texte',
    lignes: [
      ['raccourcis.gras', '⌘B  ⌘I  ⇧⌘X'],
      ['raccourcis.titres', '⇧⌘1  ⇧⌘2'],
      ['raccourcis.paragraphe', '⇧⌘0  ⇧⌘9'],
      ['raccourcis.listes', '⇧⌘8  ⇧⌘7'],
      ['raccourcis.citation', '⇧⌘B  ⌘.'],
      ['raccourcis.codeLigne', '⌘E'],
      ['raccourcis.centrerTexte', '⌘\\'],
      ['raccourcis.surligner', '⌘J'],
      ['raccourcis.lien', '⌘K'],
    ],
  },
]

/** Les touches écrites en toutes lettres dans la liste ci-dessus, avec le texte qui les dit. */
const MOTS_DE_TOUCHE: Record<string, string> = {
  Échap: 'raccourcis.touche.echap',
  Espace: 'raccourcis.touche.espace',
  'Espace + glisser': 'raccourcis.touche.espaceGlisser',
}

/** La fenêtre des raccourcis, que « / » ouvre et ferme. Échap ou un clic dehors la ferment aussi. */
export function FenetreRaccourcis({ fermer }: { fermer(): void }) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== '/') return
      e.preventDefault()
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [fermer])
  return (
    <div className="notak-raccourcis-fond" onPointerDown={(e) => (e.stopPropagation(), e.target === e.currentTarget && fermer())} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="notak-raccourcis" role="dialog" aria-label={t('raccourcis.titre')}>
        <div className="notak-raccourcis-tete">
          <strong>{t('raccourcis.titre')}</strong>
          <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
            <Icone nom="fermer" />
          </button>
        </div>
        <div className="notak-raccourcis-corps">
          {RACCOURCIS.map((g) => (
            <section key={g.titre}>
              <h3>{t(g.titre)}</h3>
              <dl>
                {g.lignes.map(([quoi, combinaison]) => (
                  <div key={quoi}>
                    <dt>{t(quoi)}</dt>
                    <dd>
                      {touches(combinaison)
                        .split('  ')
                        .map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Le type de glisser qui porte un élément des non triés vers la toile. */
export const GLISSER_NON_TRIE = 'application/x-notak-non-trie'

/**
 * Les non triés du tableau : ce qu'on a mis de côté (Alt+`) en attendant de lui trouver une place. On le glisse
 * sur la toile, ou « Poser » le met au milieu de la vue. Cmd+\ ouvre et ferme le panneau.
 */
export function PanneauNonTries({
  elements,
  contexte,
  poser,
  fermer,
}: {
  elements: Element[]
  contexte: ContexteToile
  poser(e: Element): void
  fermer(): void
}) {
  return (
    <div className="notak-corbeille notak-non-tries" role="dialog" aria-label={t('nonTries.titre')} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="notak-corbeille-tete">
        <strong>{t('nonTries.titre')}</strong>
        <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
          <Icone nom="fermer" />
        </button>
      </div>
      {elements.length === 0 ? (
        <p className="notak-corbeille-vide">{t('nonTries.vide')}</p>
      ) : (
        <ul>
          {elements.map((e) => (
            <li
              key={e.id}
              draggable
              title={t('nonTries.glisser')}
              onDragStart={(ev) => {
                ev.dataTransfer.setData(GLISSER_NON_TRIE, e.id)
                ev.dataTransfer.effectAllowed = 'move'
              }}
            >
              <span className="notak-corbeille-nom">{resume(e, contexte)}</span>
              <button type="button" onClick={() => poser(e)}>
                {t('nonTries.poser')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
