import { type Auteur, type Commentaire, type Element, type Id, type Message, nouvelId } from '../../coeur/tableau'
import { langue, t } from '../../langue'

export const LARGEUR_COMMENTAIRE = 28

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

/** Une date dite comme on la dit : « à l'instant », « il y a 5 min », « hier », « 12 oct. ». */
export function dateLisible(date: number, maintenant = Date.now()): string {
  const s = Math.max(0, (maintenant - date) / 1000)
  if (s < 60) return t('fil.instant')
  if (s < 3600) return t('fil.minutes', { n: Math.floor(s / 60) })
  const d = new Date(date)
  const auj = new Date(maintenant)
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const ecartJours = Math.round((jour(auj) - jour(d)) / 86_400_000)
  if (ecartJours === 0) return t('fil.heures', { n: Math.floor(s / 3600) })
  if (ecartJours === 1) return t('fil.hier')
  const base = langue() === 'en' ? `${MOIS_EN[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MOIS[d.getMonth()]}`
  return d.getFullYear() === auj.getFullYear() ? base : langue() === 'en' ? `${base}, ${d.getFullYear()}` : `${base} ${d.getFullYear()}`
}

/**
 * Ce qu'on montre d'un long fil replié : le premier message, le compte de ceux du milieu, le dernier.
 * Rend les messages montrés et le nombre de ceux qu'on cache.
 */
export function replier(messages: readonly Message[], max = 3): { montres: Message[]; caches: number } {
  if (messages.length <= max) return { montres: [...messages], caches: 0 }
  return { montres: [messages[0]!, messages[messages.length - 1]!], caches: messages.length - 2 }
}
