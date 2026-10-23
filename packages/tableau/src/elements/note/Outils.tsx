import { useState, useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type Note } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { FOND_NOTE, LIBELLES_COULEUR, couleursSuggerees, teinteDe } from './couleurs'
import { type OngletCouleur, PanneauCouleur } from './PanneauCouleur'
import { OutilAvecMenu } from '../../BoutonOutil'
import { fermerMenus, useMenu } from '../../menuUnique'
import { t } from '../../langue'

/** Ce que les outils de la note changent, un seul pas d'historique quel que soit le nombre de notes. */
type Changement = (c: Note) => Note

const sans = (c: Note, cle: keyof Note) => {
  const { [cle]: _, ...reste } = c
  return reste as Note
}

/**
 * « Couleur » (un seul outil : fond et bande du haut, en deux onglets), puis, dans « ••• », « Texte » (la couleur du
 * texte, propre à Notak) et « Légende » : la mise en forme de la note choisie.
 */
export function OutilsNote({ elements, contexte }: PropsOutils<Note>) {
  // Chaque palette est un menu de la barre : en ouvrir une referme les autres, et les menus des autres outils.
  const couleur = useMenu()
  const texte = useMenu()
  const legende = useMenu()
  const appliquer = (f: Changement) => {
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu', id: e.id, avant: e.contenu, apres: f(e.contenu) })))
    fermerMenus()
  }
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
  const ongletTexte: OngletCouleur = {
    cle: 'texte',
    libelle: t('note.texte'),
    icone: 'texte',
    pastilles: [
      { cle: 'aucune', libelle: t('couleur.aucune'), genre: 'aucune', actif: commun((c) => c.couleurTexte) === undefined, choisir: () => colorer((n) => sans(n, 'couleurTexte')) },
      ...COULEURS_NOTE.map((c) => ({ cle: c, libelle: LIBELLES_COULEUR[c], teinte: FOND_NOTE[c], actif: commun((n) => n.couleurTexte) === FOND_NOTE[c], choisir: () => colorer((n) => ({ ...n, couleurTexte: FOND_NOTE[c] })) })),
    ],
    libre: commun((c) => c.couleurTexte),
    poserLibre: (hex) => colorer((n) => ({ ...n, couleurTexte: hex })),
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
        <PanneauCouleur onglets={[ongletFond, ongletBande]} depart={barre && fond === undefined ? 1 : 0} suggerees={suggerees} />
      </OutilAvecMenu>
      <OutilAvecMenu menu={texte} icone="texte" titre={t('note.texte')} libelle={t('note.texte')} pastille={teinteDe(commun((c) => c.couleurTexte))} secondaire>
        <PanneauCouleur onglets={[ongletTexte]} suggerees={suggerees} />
      </OutilAvecMenu>
      <OutilAvecMenu menu={legende} icone="legende" titre={t('note.legende')} libelle={t('note.legende')} secondaire>
        <ChampLegende depart={commun((c) => c.legende) ?? ''} appliquer={appliquer} />
      </OutilAvecMenu>
    </>
  )
}

function ChampLegende({ depart, appliquer }: { depart: string; appliquer(f: Changement): void }) {
  const [texte, setTexte] = useState(depart)
  return (
    <div className="notak-note-palette" role="menu">
      <input
        className="notak-note-hex"
        autoFocus
        value={texte}
        placeholder={t('note.legende')}
        aria-label={t('note.legendeSous')}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') appliquer((c) => (texte.trim() ? { ...c, legende: texte.trim() } : sans(c, 'legende')))
        }}
      />
    </div>
  )
}
