import { type CSSProperties, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Rangees, useEmpreintes, useRanges } from '../../Cadre'
import type { Colonne, CouleurNote, Element } from '../../coeur/tableau'
import { composition } from '../composition'
import { ecouterRecherche, ouverteParRecherche } from './recherche'
import { LIBELLES_COULEUR, TEXTE_CLAIR, couleurTexteSur, couleursSuggerees, SUGGEREES_MAX } from '../note/couleurs'
import { CouleurPersonnalisee, GrillePastilles } from '../note/PanneauCouleur'
import type { PropsOutils, PropsRendu } from '../types'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { useMenu } from '../../menuUnique'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'

/**
 * Le titre en édition : tout le texte est choisi à l'ouverture, Entrée valide et désélectionne (Échap, géré par la
 * toile, garde le choix), Maj+Entrée passe à la ligne. Vide, il montre l'invite pâle.
 */
function Saisie({ titre, surChangement, valider }: { titre: string; surChangement(t: string): void; valider(garder: boolean): void }) {
  const champ = useRef<HTMLTextAreaElement>(null)
  // La zone suit la hauteur du texte : une ligne de 25 px, une de plus à chaque retour.
  const ajuster = () => {
    const c = champ.current
    if (!c) return
    c.style.height = '0'
    c.style.height = `${c.scrollHeight}px`
  }
  useLayoutEffect(() => {
    champ.current?.focus({ preventScroll: true })
    champ.current?.select()
    ajuster()
  }, [])
  return (
    <textarea
      ref={champ}
      className="notak-colonne-saisie"
      defaultValue={titre}
      aria-label={t('colonne.titre')}
      placeholder={t('colonne.invite')}
      rows={1}
      maxLength={100}
      spellCheck={false}
      onChange={(e) => {
        surChangement(e.target.value)
        ajuster()
      }}
      // Le collage est toujours du texte brut.
      onPaste={(e) => {
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        // Pas de gras ni d'italique dans un titre.
        if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i')) return e.preventDefault()
        if (e.key !== 'Enter' || (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey)) return
        e.preventDefault()
        // Entrée valide et désélectionne ; avec Alt ou Cmd, la colonne reste choisie.
        valider(e.shiftKey || e.altKey || e.metaKey || e.ctrlKey)
      }}
    />
  )
}

/** Un fond libre : la couleur, et le texte qui s'y lit (blanc sur un fond sombre). */
function styleDuFond(fond: string | undefined): CSSProperties | undefined {
  if (!fond) return undefined
  const sombre = couleurTexteSur(fond) === TEXTE_CLAIR
  return {
    background: fond,
    ...(sombre ? ({ '--notak-colonne-texte': '#fff', '--notak-colonne-compte': 'rgb(255 255 255 / 0.6)' } as CSSProperties) : {}),
  }
}

export function RenduColonne({ element, choisie, enEdition, contexte, brouillon, changer }: PropsRendu<Colonne>) {
  const { contenu } = element
  const enfants = useRanges(element.id)
  const empreintes = useEmpreintes(element.id)
  // En lecture seule, le repli reste utilisable, mais ne s'enregistre pas : il vaut pour cet écran seulement.
  const lectureSeule = !!contexte.services.lectureSeule
  const [local, setLocal] = useState<boolean>()
  // Repliée, elle s'ouvre d'elle-même quand la recherche trouve un de ses éléments.
  const ouverteParLaRecherche = useSyncExternalStore(ecouterRecherche, () => ouverteParRecherche(element.id))
  const repliee = !ouverteParLaRecherche && (lectureSeule && local !== undefined ? local : !!contenu.repliee)

  const replier = () => {
    const { repliee: _, ...reste } = contenu
    if (!repliee) {
      // Ce qui disparaît de l'écran ne reste pas choisi.
      const caches = new Set(enfants.map((e) => e.id))
      const restants = [...contexte.selection].filter((id) => !caches.has(id))
      contexte.choisir(restants.length > 0 ? restants : [element.id])
    }
    if (lectureSeule) return setLocal(!repliee)
    changer(repliee ? reste : { ...reste, repliee: true })
  }
  const libelleRepli = repliee ? t('decor.deplier') : t('colonne.replier')

  return (
    <div
      className="notak-colonne"
      style={styleDuFond(contenu.fond)}
      data-couleur={contenu.fond ? undefined : contenu.couleur}
      data-repliee={repliee || undefined}
      data-choisie={choisie || undefined}
    >
      <div className="notak-colonne-tete">
        {enEdition ? (
          <Saisie
            titre={contenu.titre}
            surChangement={(titre) => brouillon({ ...contenu, titre: titre.trim() ? titre : contenu.titre })}
            valider={(garder) => {
              contexte.finirEdition()
              if (!garder) contexte.choisir([])
            }}
          />
        ) : (
          <span className="notak-colonne-titre" data-vide={contenu.titre ? undefined : true}>
            {contenu.titre || t('colonne.invite')}
          </span>
        )}
        <button
          type="button"
          className="notak-colonne-plier"
          title={libelleRepli}
          aria-label={libelleRepli}
          aria-expanded={!repliee}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={replier}
        >
          <Icone nom={repliee ? 'colonneDeplier' : 'colonneReplier'} taille={16} />
        </button>
      </div>
      <div className="notak-colonne-compte">{enfants.length > 0 ? composition(enfants) : t('colonne.vide')}</div>
      {repliee && <div className="notak-colonne-repliee" data-depot />}
      {!repliee &&
        (enfants.length > 0 || empreintes.length > 0 ? (
          <div className="notak-colonne-corps">
            <Rangees enfants={enfants} empreintes={empreintes} contexte={contexte} />
          </div>
        ) : (
          <div className="notak-colonne-vide" data-depot />
        ))}
    </div>
  )
}

/** Les teintes d'une colonne, dans l'ordre de Milanote : dix, sans le brun, le gris en tête. */
const COULEURS_COLONNE = ['gris', 'cyan', 'vert', 'jaune', 'orange', 'rouge', 'rose', 'violet', 'bleu', 'bleu_nuit'] as const satisfies readonly CouleurNote[]

/** Leur fond, tel que `colonne.css` le pose : de quoi montrer la pastille et proposer la même teinte en libre. */
export const FOND_COLONNE: Readonly<Record<(typeof COULEURS_COLONNE)[number], string>> = {
  gris: '#dcdcdc',
  cyan: '#7be6d5',
  vert: '#92e36b',
  jaune: '#ffd96a',
  orange: '#ffa954',
  rouge: '#ff7171',
  rose: '#ff8add',
  violet: '#bf8eff',
  bleu: '#6cc7ff',
  bleu_nuit: '#799bf9',
}

/** Les fonds libres déjà posés sur des colonnes, du tableau : de quoi les retrouver sans les retaper. */
export function fondsDeColonnes(elements: readonly Element[]): string[] {
  const compte = new Map<string, number>()
  for (const e of elements) if (e.contenu.type === 'colonne' && e.contenu.fond) compte.set(e.contenu.fond, (compte.get(e.contenu.fond) ?? 0) + 1)
  return [...compte].sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

/** Le contenu avec cette teinte nommée, ou ce fond libre, ou aucun des deux. */
export function colonneColoree(c: Colonne, choix: { couleur: CouleurNote } | { fond: string } | null): Colonne {
  const { couleur: _c, fond: _f, ...reste } = c
  return choix ? { ...reste, ...choix } : reste
}

/** « Couleur » (la palette des colonnes choisies, un seul pas d'historique) et « Renommer » pour une colonne seule. */
export function OutilsColonne({ elements, contexte }: PropsOutils<Colonne>) {
  const [ouvert, setOuvert, ancre] = useMenu()
  const choisir = (choix: { couleur: CouleurNote } | { fond: string } | null) => {
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: colonneColoree(e.contenu, choix) })))
    setOuvert(false)
  }
  const meme = <T,>(lire: (e: (typeof elements)[number]) => T) => (elements.every((e) => lire(e) === lire(elements[0]!)) ? lire(elements[0]!) : undefined)
  const fond = meme((e) => e.contenu.fond)
  const actuelle = fond ? undefined : meme((e) => e.contenu.couleur)
  // Les fonds libres des autres colonnes, puis les couleurs des notes du tableau.
  const tous = contexte.magasin.lire().elements
  const suggerees = [...new Set([...fondsDeColonnes(tous), ...couleursSuggerees(tous)])].slice(0, SUGGEREES_MAX)
  return (
    <>
    <OutilAvecMenu menu={[ouvert, setOuvert, ancre]} classeAncre="notak-colonne-menu-ancre" icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={fond ?? (actuelle ? FOND_COLONNE[actuelle as keyof typeof FOND_COLONNE] : undefined)}>
      <div className="notak-note-palette notak-panneau-couleur" role="menu">
        <GrillePastilles
          nom={t('couleur.titre')}
          pastilles={[
            { cle: 'aucune', libelle: t('couleur.aucune'), genre: 'aucune', actif: actuelle === undefined && !fond, choisir: () => choisir(null) },
            ...COULEURS_COLONNE.map((c) => ({ cle: c, libelle: LIBELLES_COULEUR[c], teinte: FOND_COLONNE[c], actif: actuelle === c, choisir: () => choisir({ couleur: c }) })),
          ]}
        />
        {suggerees.length > 0 && (
          <>
            <span className="notak-decor-titre">{t('couleur.recentes')}</span>
            <GrillePastilles
              nom={t('note.couleursTableau')}
              pastilles={suggerees.map((c) => ({ cle: c, libelle: c, teinte: c, actif: fond === c, choisir: () => choisir({ fond: c }) }))}
            />
          </>
        )}
        <CouleurPersonnalisee actuelle={fond} choisir={(hex) => choisir({ fond: hex })} />
      </div>
    </OutilAvecMenu>
    {elements.length === 1 && !contexte.services.lectureSeule && (
      <BoutonOutil icone="modifier" titre={t('colonne.renommer')} libelle={t('menu.renommer')} onClick={() => contexte.commencerEdition(elements[0]!.id)} />
    )}
    </>
  )
}
