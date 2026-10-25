/**
 * La bulle d'aide des boutons de la poignée (docs/NOTION.md § 6, relevé « 4-rendu-mesures ») : elle remplace l'infobulle
 * du navigateur, paraît 150 ms après l'arrivée sur le bouton, centrée 6 px dessous, sur deux lignes dont les mots du
 * geste sont en clair. Ici, ses décisions, en fonctions pures.
 */

/** Le délai entre l'arrivée sur le bouton et la bulle. */
export const DELAI_AIDE = 150
/** L'écart entre le bouton et la bulle. */
export const ECART_AIDE = 6
/** La marge gardée entre la bulle et le bord de la fenêtre. */
export const MARGE_AIDE = 8

export interface BoiteAide {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Où poser une bulle de `taille` sous `bouton` : centrée, à 6 px. Elle reste dans la fenêtre : poussée contre le côté
 * qu'elle déborde ; passée au-dessus du bouton s'il n'y a pas la place dessous.
 */
export function placerAide(bouton: BoiteAide, taille: { largeur: number; hauteur: number }, fenetre: { largeur: number; hauteur: number }): { left: number; top: number } {
  const maxGauche = Math.max(MARGE_AIDE, fenetre.largeur - MARGE_AIDE - taille.largeur)
  const left = Math.max(MARGE_AIDE, Math.min((bouton.left + bouton.right) / 2 - taille.largeur / 2, maxGauche))
  let top = bouton.bottom + ECART_AIDE
  if (top + taille.hauteur > fenetre.hauteur - MARGE_AIDE) {
    const dessus = bouton.top - ECART_AIDE - taille.hauteur
    top = dessus >= MARGE_AIDE ? dessus : Math.max(MARGE_AIDE, fenetre.hauteur - MARGE_AIDE - taille.hauteur)
  }
  return { left, top }
}

export interface Morceau {
  texte: string
  /** Un mot du geste, que la bulle montre en clair. */
  clair: boolean
}

/**
 * Découpe un texte de langue où `**…**` marque les mots du geste. Un `**` qui n'a pas de fermeture reste un texte
 * ordinaire ; les morceaux vides disparaissent.
 */
export function morceauxAide(texte: string): Morceau[] {
  const parties = texte.split('**')
  // Un nombre pair de parties veut dire un `**` sans fermeture : on le remet tel quel à la fin.
  const queue = parties.length % 2 === 0 ? `**${parties.pop()}` : ''
  const morceaux: Morceau[] = parties.map((p, i) => ({ texte: p, clair: i % 2 === 1 }))
  if (queue) {
    const dernier = morceaux[morceaux.length - 1]
    if (dernier && !dernier.clair) dernier.texte += queue
    else morceaux.push({ texte: queue, clair: false })
  }
  return morceaux.filter((m) => m.texte !== '')
}
