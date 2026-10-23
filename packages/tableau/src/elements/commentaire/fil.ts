import { type Auteur, type Commentaire, type Element, type Id, type Message, nouvelId } from '../../coeur/tableau'
import { langue, t, tn } from '../../langue'

/** 34 unités de grille : la largeur d'une note, et la plus étroite d'un fil. */
export const LARGEUR_COMMENTAIRE = 34

/** Qui écrit, quand la toile ne sait pas qui l'on est (pas de présence) : le nom reste lisible des autres. */
export const AUTEUR_INCONNU: Auteur = { id: 'inconnu', nom: 'Anonyme' }

export const nouveauCommentaire = (x: number, y: number): Element<Commentaire> => ({
  id: nouvelId(),
  x,
  y,
  largeur: LARGEUR_COMMENTAIRE,
  contenu: { type: 'commentaire', messages: [] },
})

/** Le fil, avec ce message en plus ; un texte vide ne change rien. Répondre rouvre un fil résolu. */
export function ajouterMessage(c: Commentaire, m: Message): Commentaire {
  const texte = m.texte.trim()
  if (!texte) return c
  const { resolu: _, replie: __, ...reste } = c
  return { ...reste, messages: [...c.messages.filter((x) => x.id !== m.id), { ...m, texte }] }
}

/** Un fil sans le moindre message n'a rien à dire : il disparaît quand on en sort. */
export const filVide = (c: Commentaire) => c.messages.length === 0

export const retirerMessage = (c: Commentaire, id: Id): Commentaire => ({ ...c, messages: c.messages.filter((m) => m.id !== id) })

export function resoudre(c: Commentaire, resolu: boolean): Commentaire {
  const { resolu: _, ...reste } = c
  return resolu ? { ...reste, resolu: true } : reste
}

/** Replier le fil sur une ligne, ou le déplier. */
export function plier(c: Commentaire, replie: boolean): Commentaire {
  const { replie: _, ...reste } = c
  return replie ? { ...reste, replie: true } : reste
}

/** Les initiales d'un nom, pour sa pastille : « Samy Agher » → « SA ». */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  const lettres = mots.length === 1 ? [...mots[0]!].slice(0, 2) : [[...mots[0]!][0]!, [...mots[mots.length - 1]!][0]!]
  return lettres.join('').toUpperCase()
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Une date dite comme Milanote la dit : « à l'instant », « il y a 5 min », « il y a 3 h », « il y a 2 jours »,
 * « il y a 3 semaines », puis, au-delà de quatre semaines, la date courte « 12 oct. 2026 ».
 */
export function dateLisible(date: number, maintenant = Date.now()): string {
  const s = Math.max(0, (maintenant - date) / 1000)
  if (s < 60) return t('fil.instant')
  if (s < 3600) return t('fil.minutes', { n: Math.floor(s / 60) })
  if (s < 86_400) return t('fil.heures', { n: Math.floor(s / 3600) })
  const jours = Math.floor(s / 86_400)
  if (jours < 7) return tn('fil.jours', jours)
  const semaines = Math.floor(jours / 7)
  if (semaines <= 4) return tn('fil.semaines', semaines)
  const d = new Date(date)
  return langue() === 'en' ? `${d.getDate()} ${MOIS_EN[d.getMonth()]} ${d.getFullYear()}` : `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

/** Le prénom d'un auteur : le premier mot de son nom, « Quelqu'un » s'il n'en a pas. */
export const prenom = (nom: string): string => nom.trim().split(/\s+/)[0] || t('decor.quelquun')

/** Ce message avec un autre texte ; un texte vide ne change rien (supprimer est un autre geste). */
export function modifierMessage(c: Commentaire, id: Id, texte: string): Commentaire {
  const propre = texte.trim()
  if (!propre) return c
  return { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, texte: propre } : m)) }
}

/** Une adresse web dans un texte, à rendre cliquable. */
const ADRESSE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g

/** Le texte découpé en morceaux : du texte, et les adresses qu'il contient. */
export function morceauxDeTexte(texte: string): { texte: string; lien?: string }[] {
  const morceaux: { texte: string; lien?: string }[] = []
  let fin = 0
  for (const m of texte.matchAll(ADRESSE)) {
    if (m.index > fin) morceaux.push({ texte: texte.slice(fin, m.index) })
    morceaux.push({ texte: m[0], lien: m[0] })
    fin = m.index + m[0].length
  }
  if (fin < texte.length) morceaux.push({ texte: texte.slice(fin) })
  return morceaux
}

/**
 * Ce qu'on montre d'un long fil replié : le premier message, le compte de ceux du milieu, le dernier.
 * Rend les messages montrés et le nombre de ceux qu'on cache.
 */
export function replier(messages: readonly Message[], max = 3): { montres: Message[]; caches: number } {
  if (messages.length <= max) return { montres: [...messages], caches: 0 }
  return { montres: [messages[0]!, messages[messages.length - 1]!], caches: messages.length - 2 }
}
