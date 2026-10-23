import { useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type Note } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { FOND_NOTE, LIBELLES_COULEUR, TEXTE_CLAIR, TEXTE_SOMBRE, contenuAvecPaire, couleursSuggerees, pairesUtilisees, teinteDe, texteDuContenu } from './couleurs'
import { type OngletCouleur, PanneauCouleur } from './PanneauCouleur'
import { legendeNeuve, legendeVide } from './legende'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { useMenu } from '../../menuUnique'
import { t } from '../../langue'

/** Ce que les outils de la note changent, un seul pas d'historique quel que soit le nombre de notes. */
type Changement = (c: Note) => Note

const sans = (c: Note, cle: keyof Note) => {
  const { [cle]: _, ...reste } = c
  return reste as Note
}

/**
 * « Couleur » (un seul outil : fond et bande du haut, en deux onglets ; sous la grille du fond, les paires fond + texte
 * déjà employées et la couleur du texte), puis, dans « ••• », « Légende » : la mise en forme de la note choisie.
 */
export function OutilsNote({ elements, contexte }: PropsOutils<Note>) {
  // Chaque palette est un menu de la barre : en ouvrir une referme les autres, et les menus des autres outils.
  const couleur = useMenu()
  // Une couleur posée laisse le panneau ouvert : on essaie, on change d'avis, on passe à la bande.
  const colorer = (f: Changement) => contexte.magasin.faire(elements.map((e) => ({ type: 'contenu', id: e.id, avant: e.contenu, apres: f(e.contenu) })))
  const commun = <T,>(lire: (c: Note) => T): T | undefined =>
    elements.every((e) => lire(e.contenu) === lire(elements[0]!.contenu)) ? lire(elements[0]!.contenu) : undefined
  // Les teintes déjà employées sur le tableau, relues à chaque changement.
  const tableau = useSyncExternalStore(contexte.magasin.ecouter, contexte.magasin.lire)
  const suggerees = couleursSuggerees(tableau.elements)
  const fond = commun((c) => c.fond ?? c.couleur)
  const barre = commun((c) => c.barre)
  const libre = (v: string | undefined) => (v?.startsWith('#') ? v : undefined)

  const ongletFond: OngletCouleur = {
    cle: 'fond',
    libelle: t('couleur.fond'),
    icone: 'palette',
    pastilles: [
      { cle: 'aucune', libelle: t('couleur.aucune'), genre: 'aucune', actif: fond === undefined, choisir: () => colorer((c) => sans(sans(c, 'couleur'), 'fond')) },
      ...COULEURS_NOTE.map((c) => ({
        cle: c,
        libelle: LIBELLES_COULEUR[c],
        teinte: FOND_NOTE[c],
        actif: fond === c,
        choisir: () => colorer((n) => ({ ...sans(sans(n, 'couleur'), 'fond'), couleur: c })),
      })),
      { cle: 'transparent', libelle: t('couleur.transparent'), genre: 'transparente' as const, actif: fond === 'transparent', choisir: () => colorer((n) => ({ ...sans(sans(n, 'couleur'), 'fond'), couleur: 'transparent' as const })) },
    ],
    libre: libre(fond),
    poserLibre: (hex) => colorer((n) => ({ ...sans(sans(n, 'couleur'), 'fond'), fond: hex })),
  }
  const ongletBande: OngletCouleur = {
    cle: 'bande',
    libelle: t('couleur.bande'),
    icone: 'barreNote',
    pastilles: [
      { cle: 'aucune', libelle: t('couleur.aucune'), genre: 'aucune', actif: barre === undefined, choisir: () => colorer((n) => sans(n, 'barre')) },
      ...COULEURS_NOTE.map((c) => ({ cle: c, libelle: LIBELLES_COULEUR[c], teinte: FOND_NOTE[c], actif: barre === FOND_NOTE[c], choisir: () => colorer((n) => ({ ...n, barre: FOND_NOTE[c] })) })),
    ],
    libre: barre && !(Object.values(FOND_NOTE) as string[]).includes(barre) ? barre : undefined,
    poserLibre: (hex) => colorer((n) => ({ ...n, barre: hex })),
  }
  // La couleur du texte de la note : automatique (celle que le fond impose), claire, sombre, ou libre.
  const texteActuel = commun((c) => c.couleurTexte)
  const reglageTexte = {
    pastilles: [
      { cle: 'auto', libelle: t('couleur.aucune'), genre: 'aucune' as const, actif: texteActuel === undefined, choisir: () => colorer((n) => sans(n, 'couleurTexte')) },
      { cle: 'clair', libelle: t('couleur.texteClair'), teinte: TEXTE_CLAIR, actif: texteActuel === TEXTE_CLAIR, choisir: () => colorer((n) => ({ ...n, couleurTexte: TEXTE_CLAIR })) },
      { cle: 'sombre', libelle: t('couleur.texteSombre'), teinte: TEXTE_SOMBRE, actif: texteActuel === TEXTE_SOMBRE, choisir: () => colorer((n) => ({ ...n, couleurTexte: TEXTE_SOMBRE })) },
    ],
    libre: libre(texteActuel) && ![TEXTE_CLAIR, TEXTE_SOMBRE].includes(texteActuel!) ? texteActuel : undefined,
    poserLibre: (hex: string) => colorer((n) => ({ ...n, couleurTexte: hex })),
  }
  // Les paires déjà employées sur le tableau : d'un clic, le fond et son texte.
  const textesChoisis = commun((c) => texteDuContenu(c))
  const paires = pairesUtilisees(tableau.elements).map((p) => ({
    cle: `${p.fond}|${p.texte}`,
    libelle: `${p.fond} · ${p.texte}`,
    fond: p.fond,
    texte: p.texte,
    actif: fond !== undefined && teinteDe(fond) === p.fond && textesChoisis === p.texte,
    choisir: () => colorer((n) => contenuAvecPaire(n, p)),
  }))
  // « Légende » : ajoute une légende vide au bas de la note et y commence l'écriture ; une légende présente se retire.
  const avecLegende = elements.every((e) => e.contenu.legende !== undefined)
  const basculerLegende = () => {
    contexte.magasin.faire(
      elements.map((e) => ({
        type: 'contenu' as const,
        id: e.id,
        avant: e.contenu,
        apres: avecLegende ? sans(e.contenu, 'legende') : { ...e.contenu, legende: e.contenu.legende ?? legendeNeuve() },
      })),
    )
    if (!avecLegende && elements.length === 1 && legendeVide(elements[0]!.contenu.legende)) contexte.commencerEdition(elements[0]!.id)
  }
  // La tuile montre la note en petit : sa bande du haut, puis son fond.
  const teinteFond = teinteDe(fond)
  const teinteBande = teinteDe(barre)
  const miniature =
    teinteFond || teinteBande
      ? teinteBande
        ? `linear-gradient(to bottom, ${teinteBande} 0 30%, ${teinteFond ?? '#ffffff'} 30% 100%)`
        : teinteFond
      : undefined

  return (
    <>
      <OutilAvecMenu menu={couleur} icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={miniature} classe="notak-outil-couleur-note">
        <PanneauCouleur onglets={[ongletFond, ongletBande]} depart={barre && fond === undefined ? 1 : 0} suggerees={suggerees} paires={paires} texte={reglageTexte} />
      </OutilAvecMenu>
      <BoutonOutil icone="legende" titre={t('note.legendeSous')} libelle={t('note.legende')} actif={avecLegende} secondaire onClick={basculerLegende} />
    </>
  )
}
