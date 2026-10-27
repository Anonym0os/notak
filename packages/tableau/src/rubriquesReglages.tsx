import type { ReactNode } from 'react'
import type { Habillages } from './habillage/appliquer'
import { enFeuille } from './communs/Feuille'
import { auDoigt } from './doigt'
import { langueDuNavigateur, t } from './langue'
import { RACCOURCIS, touches } from './Menus'
import { ChoixCouleur, ChoixHabillage, ChoixMode, ChoixPhoto, DEFAUT, type OptionChoix, type Reglages, type ServiceCompte } from './reglages'

/**
 * Les rubriques de la page des réglages, en données : rubrique → sections → lignes. La page les dessine, la recherche
 * les parcourt ; ajouter un réglage, c'est ajouter une ligne ici. Une rubrique dont aucune ligne n'existe (pas encore de
 * réglage, ou pas de compte) n'apparaît pas.
 */

/** Ce que les lignes lisent et changent. */
export interface ContexteReglages {
  reglages: Reglages
  changer(r: Partial<Reglages>): void
  compte?: ServiceCompte | undefined
  habillages?: Habillages | undefined
  /** La barre des outils de gauche, cachée ou non : le même état que le bouton du premier îlot. */
  outils?: { caches: boolean; basculer(): void } | undefined
}

/** Une clé de texte, ou une fonction quand le texte prend des valeurs. */
export type Texte = string | (() => string)
export const lire = (x: Texte): string => (typeof x === 'function' ? x() : t(x))

export type Controle =
  /** Une pilule de choix. */
  | { type: 'choix'; options(c: ContexteReglages): OptionChoix[]; lire(c: ContexteReglages): unknown; ecrire(c: ContexteReglages, v: unknown): void }
  /** Un raccourci, à lire : les touches en pastilles. */
  | { type: 'touches'; combinaison: string }
  /** Un contrôle dessiné à part (la photo, le thème…). */
  | { type: 'libre'; rendre(c: ContexteReglages): ReactNode }

export interface Ligne {
  id: string
  libelle: Texte
  aide?: Texte
  controle: Controle
  /** La ligne n'existe que si… (un compte, un thème proposé). */
  si?(c: ContexteReglages): boolean
  /** Le libellé se cale en haut du contrôle, plus haut que lui (les aperçus du mode). */
  haut?: true
  /** Sur un téléphone, l'aide qui ne parle ni de touches ni de souris. */
  aideAuDoigt?: Texte
  /** Sur un téléphone, la ligne n'existe pas : elle règle ce qui n'y est pas (la barre de gauche, le clavier). */
  bureauSeul?: true
}

export interface Section {
  titre: Texte
  lignes: Ligne[]
}

export type Groupe = 'compte' | 'notak' | 'donnees' | 'application'
export const GROUPES: Groupe[] = ['compte', 'notak', 'donnees', 'application']

export interface Rubrique {
  id: string
  groupe: Groupe
  titre: Texte
  phrase?: Texte
  icone: ReactNode
  /** La couleur de la pastille de l'icône, sur un téléphone (les listes groupées d'iOS). */
  teinte: string
  /** Sur un téléphone, la rubrique n'existe pas : tout ce qu'elle règle tient au clavier, à la souris ou au bureau. */
  bureauSeul?: true
  sections: Section[]
}

/** Une pilule sur un champ des réglages. */
function choix<K extends keyof Reglages>(cle: K, options: (() => OptionChoix[]) | OptionChoix[]): Controle {
  return {
    type: 'choix',
    options: () => (typeof options === 'function' ? options() : options),
    lire: (c) => c.reglages[cle] ?? DEFAUT[cle],
    ecrire: (c, v) => c.changer({ [cle]: v } as Partial<Reglages>),
  }
}

const icone = (trace: ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {trace}
  </svg>
)

/**
 * Le contenu de la rubrique « App de bureau » : la toile ne sait pas ce qu'est le bureau, l'application le lui dit en
 * posant de quoi le dessiner (`reglerRubriqueBureau`, comme `reglerCapture`). Tant qu'elle ne l'a pas fait, la rubrique
 * n'existe pas.
 */
let rubriqueBureau: (() => ReactNode) | null = null
export function reglerRubriqueBureau(rendre: (() => ReactNode) | null) {
  rubriqueBureau = rendre
}

export const RUBRIQUES: Rubrique[] = [
  {
    id: 'profil',
    teinte: '#8e8e93',
    groupe: 'compte',
    titre: 'reglages.rubrique.profil',
    phrase: 'reglages.rubrique.profil.phrase',
    icone: icone(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>,
    ),
    sections: [
      {
        titre: 'reglages.section.identite',
        lignes: [
          { id: 'photo', libelle: 'reglages.compte.photo', aide: 'reglages.compte.photo.aide', si: (c) => !!c.compte, controle: { type: 'libre', rendre: (c) => c.compte && <ChoixPhoto compte={c.compte} /> } },
          { id: 'couleur', libelle: 'reglages.compte.couleur', aide: 'reglages.compte.couleur.aide', si: (c) => !!c.compte, controle: { type: 'libre', rendre: (c) => c.compte && <ChoixCouleur compte={c.compte} /> } },
        ],
      },
    ],
  },
  {
    id: 'notifications',
    teinte: '#ff3b30',
    groupe: 'compte',
    titre: 'reglages.rubrique.notifications',
    icone: icone(
      <>
        <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" />
        <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
      </>,
    ),
    sections: [],
  },
  {
    id: 'connexion',
    teinte: '#8e8e93',
    groupe: 'compte',
    titre: 'reglages.rubrique.connexion',
    icone: icone(
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>,
    ),
    sections: [],
  },
  {
    id: 'general',
    teinte: '#8e8e93',
    groupe: 'notak',
    titre: 'reglages.rubrique.general',
    phrase: 'reglages.rubrique.general.phrase',
    icone: icone(<path d="M4 6h16M4 12h16M4 18h10" />),
    sections: [
      {
        titre: 'reglages.section.langue',
        lignes: [
          {
            id: 'langue',
            libelle: 'reglages.langue',
            aide: 'reglages.langue.aide',
            aideAuDoigt: 'reglages.langue.aide.doigt',
            controle: choix('langue', () => [
              // Automatique dit quelle langue le navigateur donnerait.
              { valeur: 'auto', libelle: t('reglages.langue.auto'), detail: t(`reglages.langue.${langueDuNavigateur()}`) },
              { valeur: 'fr', libelle: t('reglages.langue.fr'), lang: 'fr' },
              { valeur: 'en', libelle: t('reglages.langue.en'), lang: 'en' },
            ]),
          },
        ],
      },
    ],
  },
  {
    id: 'apparence',
    teinte: '#007aff',
    groupe: 'notak',
    titre: 'reglages.rubrique.apparence',
    phrase: 'reglages.rubrique.apparence.phrase',
    icone: icone(
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
      </>,
    ),
    sections: [
      {
        titre: 'reglages.section.couleurs',
        lignes: [
          { id: 'mode', libelle: 'reglages.mode', aide: () => t('reglages.mode.aide', { touches: touches('⇧⌘D') }), aideAuDoigt: 'reglages.mode.aide.doigt', haut: true, controle: { type: 'libre', rendre: (c) => <ChoixMode reglages={c.reglages} changer={c.changer} /> } },
          { id: 'habillage', libelle: 'reglages.habillage', aide: 'reglages.habillage.aide', si: (c) => !!c.habillages, controle: { type: 'libre', rendre: (c) => c.habillages && <ChoixHabillage habillages={c.habillages} changer={c.changer} /> } },
        ],
      },
      {
        titre: 'reglages.section.interface',
        lignes: [
          {
            id: 'taille',
            libelle: 'reglages.taille',
            aide: 'reglages.taille.aide',
            // Au doigt, les îlots et la capsule ont la taille du pouce : plus petits, on les manquerait.
            bureauSeul: true,
            controle: choix('taille', () => [
              { valeur: 'petite', libelle: t('reglages.taille.petite') },
              { valeur: 'moyenne', libelle: t('reglages.taille.moyenne') },
              { valeur: 'grande', libelle: t('reglages.taille.grande') },
            ]),
          },
        ],
      },
    ],
  },
  {
    id: 'tableau',
    teinte: '#ff9500',
    groupe: 'notak',
    titre: 'reglages.rubrique.tableau',
    phrase: 'reglages.rubrique.tableau.phrase',
    icone: icone(
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M4 10h16M10 10v10" />
      </>,
    ),
    sections: [
      {
        titre: 'reglages.section.toile',
        lignes: [
          {
            id: 'doubleClic',
            // Au doigt, le même réglage : deux touchers valent un double-clic. Lu à l'affichage, pas au chargement.
            libelle: () => t(auDoigt() ? 'reglages.doubleTouche' : 'reglages.doubleClic'),
            aide: () => t(auDoigt() ? 'reglages.doubleTouche.aide' : 'reglages.doubleClic.aide'),
            controle: choix('doubleClic', () => [
              { valeur: true, libelle: t('reglages.doubleClic.note') },
              { valeur: false, libelle: t('reglages.doubleClic.rien') },
            ]),
          },
          {
            id: 'minicarte',
            libelle: 'reglages.minicarte',
            aide: 'reglages.minicarte.aide',
            aideAuDoigt: 'reglages.minicarte.aide.doigt',
            controle: {
              type: 'choix',
              options: () => [
                { valeur: 'mouvement', libelle: t('reglages.minicarte.mouvement') },
                { valeur: 'toujours', libelle: t('reglages.minicarte.toujours') },
                { valeur: 'jamais', libelle: t('reglages.minicarte.jamais') },
              ],
              lire: (c) => c.reglages.minicarte ?? 'mouvement',
              ecrire: (c, v) => c.changer({ minicarte: v as Reglages['minicarte'] }),
            },
          },
          {
            id: 'grille',
            libelle: 'reglages.grille',
            aide: () => t('reglages.grille.aide', { serrer: touches('⇧⌘,'), elargir: touches('⇧⌘.') }),
            aideAuDoigt: 'reglages.grille.aide.doigt',
            controle: choix('grille', () => [
              { valeur: 8, libelle: t('reglages.grille.serree'), detail: '8 px' },
              { valeur: 9, libelle: t('reglages.grille.moyenne'), detail: '9 px' },
              { valeur: 10, libelle: t('reglages.grille.large'), detail: '10 px' },
            ]),
          },
        ],
      },
      {
        titre: 'reglages.section.outils',
        lignes: [
          {
            id: 'barre',
            libelle: 'reglages.barre',
            aide: 'reglages.barre.aide',
            // Au doigt, les outils de la sélection sont toujours la capsule du bas, et il n'y a pas de barre de gauche.
            bureauSeul: true,
            controle: choix('barre', () => [
              { valeur: 'flottante', libelle: t('reglages.barre.flottante') },
              { valeur: 'gauche', libelle: t('reglages.barre.gauche') },
            ]),
          },
          {
            id: 'outils',
            libelle: 'reglages.outils',
            aide: 'reglages.outils.aide',
            // Au doigt, la barre de gauche laisse place au « + » rond : rien à montrer ni à cacher.
            bureauSeul: true,
            si: (c) => !!c.outils,
            controle: {
              type: 'choix',
              options: () => [
                { valeur: false, libelle: t('reglages.outils.affichee') },
                { valeur: true, libelle: t('reglages.outils.masquee') },
              ],
              lire: (c) => c.outils?.caches,
              ecrire: (c, v) => {
                if (c.outils && c.outils.caches !== v) c.outils.basculer()
              },
            },
          },
        ],
      },
    ],
  },
  {
    id: 'carte',
    teinte: '#34c759',
    groupe: 'notak',
    titre: 'reglages.rubrique.carte',
    icone: icone(
      <>
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M8.5 11l7-4M8.5 13l7 4" />
      </>,
    ),
    sections: [],
  },
  {
    id: 'document',
    teinte: '#5856d6',
    groupe: 'notak',
    titre: 'reglages.rubrique.document',
    icone: icone(
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>,
    ),
    sections: [],
  },
  {
    id: 'raccourcis',
    teinte: '#8e8e93',
    bureauSeul: true,
    groupe: 'notak',
    titre: 'reglages.rubrique.raccourcis',
    phrase: 'reglages.rubrique.raccourcis.phrase',
    icone: icone(
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
      </>,
    ),
    // Les mêmes que la fenêtre des raccourcis (« / ») : une seule liste pour les deux.
    sections: RACCOURCIS.map((g) => ({
      titre: g.titre,
      lignes: g.lignes.map(([quoi, combinaison]) => ({ id: quoi, libelle: quoi, controle: { type: 'touches', combinaison } })),
    })),
  },
  {
    id: 'importer',
    teinte: '#32ade6',
    groupe: 'donnees',
    titre: 'reglages.rubrique.importer',
    icone: icone(
      <>
        <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
        <path d="M7 9l5-5 5 5M12 4v12" />
      </>,
    ),
    sections: [],
  },
  {
    id: 'corbeille',
    teinte: '#8e8e93',
    groupe: 'donnees',
    titre: 'reglages.rubrique.corbeille',
    icone: icone(
      <>
        <path d="M4 7h16M10 11v6M14 11v6" />
        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
      </>,
    ),
    sections: [],
  },
  {
    id: 'bureau',
    teinte: '#5856d6',
    bureauSeul: true,
    groupe: 'application',
    titre: 'reglages.rubrique.bureau',
    icone: icone(
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>,
    ),
    sections: [
      {
        titre: 'reglages.section.bureau',
        lignes: [
          {
            id: 'bureau',
            libelle: 'reglages.bureau.ou',
            aide: 'reglages.bureau.ou.aide',
            si: () => rubriqueBureau !== null,
            haut: true,
            controle: { type: 'libre', rendre: () => rubriqueBureau?.() },
          },
        ],
      },
    ],
  },
  {
    id: 'aPropos',
    teinte: '#8e8e93',
    groupe: 'application',
    titre: 'reglages.rubrique.aPropos',
    icone: icone(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>,
    ),
    sections: [],
  },
]

/**
 * Les rubriques telles qu'elles paraissent : sans les lignes qui n'existent pas ici, ni les sections et rubriques vides.
 * Sur un téléphone, sans ce qui ne sert qu'au bureau, et avec l'aide écrite pour le doigt.
 */
export function rubriquesVisibles(c: ContexteReglages, toutes: Rubrique[] = RUBRIQUES, telephone = enFeuille()): Rubrique[] {
  const existe = (x: { bureauSeul?: true }) => !(telephone && x.bureauSeul)
  const pourIci = (l: Ligne): Ligne => (telephone && l.aideAuDoigt ? { ...l, aide: l.aideAuDoigt } : l)
  return toutes
    .filter(existe)
    .map((r) => ({ ...r, sections: r.sections.map((s) => ({ ...s, lignes: s.lignes.filter((l) => existe(l) && (!l.si || l.si(c))).map(pourIci) })).filter((s) => s.lignes.length > 0) }))
    .filter((r) => r.sections.length > 0)
}

/** Un texte ramené à ses lettres pour comparer : en minuscules, sans accents. */
const plier = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Où paraît `cherche` dans `texte`, sans tenir compte des accents ni des capitales : les morceaux du texte d'origine,
 * chacun dit trouvé ou non. Vide, rien n'est trouvé.
 */
export function morceaux(texte: string, cherche: string): { texte: string; trouve: boolean }[] {
  const aiguille = plier(cherche.trim())
  if (!aiguille) return [{ texte, trouve: false }]
  // Le texte plié, et pour chaque lettre pliée la place de la lettre d'origine.
  let plie = ''
  const origine: number[] = []
  for (let i = 0; i < texte.length; i++) {
    const p = plier(texte[i]!)
    plie += p
    for (let k = 0; k < p.length; k++) origine.push(i)
  }
  origine.push(texte.length)
  const sortie: { texte: string; trouve: boolean }[] = []
  let fin = 0
  for (let i = plie.indexOf(aiguille); i >= 0; i = plie.indexOf(aiguille, i + aiguille.length)) {
    const debut = origine[i]!
    const apres = origine[i + aiguille.length]!
    if (debut > fin) sortie.push({ texte: texte.slice(fin, debut), trouve: false })
    sortie.push({ texte: texte.slice(debut, apres), trouve: true })
    fin = apres
  }
  if (fin < texte.length) sortie.push({ texte: texte.slice(fin), trouve: false })
  return sortie
}

/** Les rubriques réduites aux lignes dont le libellé ou l'aide contient `cherche` ; celles sans résultat restent, vides. */
export function chercher(rubriques: Rubrique[], cherche: string): Rubrique[] {
  const aiguille = plier(cherche.trim())
  const trouve = (l: Ligne) => plier(lire(l.libelle)).includes(aiguille) || (l.aide !== undefined && plier(lire(l.aide)).includes(aiguille))
  return rubriques.map((r) => ({ ...r, sections: r.sections.map((s) => ({ ...s, lignes: s.lignes.filter(trouve) })).filter((s) => s.lignes.length > 0) }))
}

export const nombreDeLignes = (r: Rubrique) => r.sections.reduce((n, s) => n + s.lignes.length, 0)
