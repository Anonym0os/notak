import type { Element, Lien, Operation } from '../../coeur/tableau'
import type { Rect } from '../../coeur/geometrie'
import { annoncer } from '../../avis'
import { t } from '../../langue'
import { TAILLE_MAX, TYPES_ACCEPTES } from '../image/geometrie'
import { lireDimensions } from '../image/lecture'
import type { ContexteToile } from '../types'
import { lecteurDe } from './lecteurs'

/** Une image est-elle montrée en haut de la carte (celle qu'on a donnée, ou celle de la page) ? */
export const imageMontree = (c: Lien) => !c.sansApercu && (!!c.image || (c.statut === 'pret' && !!c.apercu?.image))

/** La taille de l'image d'aperçu en pixels, quand on la connaît : la nôtre, sinon celle que la page a dite. */
export function dimensionsApercu(c: Lien): { largeur: number; hauteur: number } | null {
  if (c.image) return { largeur: c.image.largeur, hauteur: c.image.hauteur }
  const a = c.apercu
  return a?.image && a.largeur && a.hauteur ? { largeur: a.largeur, hauteur: a.hauteur } : null
}

/** Le contenu avec cette image pour aperçu ; l'aperçu caché se remontre. */
export function avecImageApercu(c: Lien, image: NonNullable<Lien['image']>): Lien {
  const { sansApercu: _, ...reste } = c
  return { ...reste, image }
}

/** Range le fichier avec les fichiers du tableau et le pose en aperçu du lien. Rien si ce n'est pas une image lisible. */
export async function poserImageApercu(cible: Element<Lien>, f: File, contexte: ContexteToile): Promise<Operation[]> {
  const depot = contexte.services.fichiers
  if (!depot) return []
  if (!TYPES_ACCEPTES.includes(f.type)) {
    annoncer({ texte: t('envois.imageNonPrise') })
    return []
  }
  if (f.size > TAILLE_MAX) {
    annoncer({ texte: t('envois.tropGros', { nom: f.name, max: '25' }) })
    return []
  }
  const d = await lireDimensions(f)
  if (!d) return []
  let fichier: string
  try {
    fichier = await depot.enregistrer(f)
  } catch (e) {
    annoncer({ texte: e instanceof Error ? e.message : t('envois.impossible') })
    return []
  }
  // Pendant l'envoi, la carte a pu changer ou disparaître : on part de son état présent.
  const present = contexte.magasin.lire().elements.find((e) => e.id === cible.id)
  if (!present || present.contenu.type !== 'lien') return []
  return [{ type: 'contenu', id: cible.id, avant: present.contenu, apres: avecImageApercu(present.contenu, { fichier, largeur: d.largeur, hauteur: d.hauteur }) }]
}

/** « Ajouter une image » / « Remplacer l'image » : le sélecteur de fichiers, puis l'image prend la place de l'aperçu. */
export function choisirImageApercu(cible: Element<Lien>, contexte: ContexteToile) {
  const champ = document.createElement('input')
  champ.type = 'file'
  champ.accept = 'image/*'
  champ.addEventListener('change', () => {
    const f = champ.files?.[0]
    if (f) void poserImageApercu(cible, f, contexte).then((ops) => ops.length > 0 && contexte.magasin.faire(ops))
  })
  champ.click()
}

/** Le lien visé par un dépôt à `ou` (UG) : sur son aperçu, ou n'importe où s'il n'en montre pas. `hauteurApercu` : celle du média, en UG. */
export function lienSous(
  elements: readonly Element[],
  rect: (id: string) => Rect | null,
  hauteurApercu: (id: string) => number,
  ou: { x: number; y: number },
): Element<Lien> | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i]!
    if (e.contenu.type !== 'lien' || e.corbeille !== undefined || e.verrou || !e.contenu.url) continue
    const r = rect(e.id)
    if (!r || ou.x < r.min.x || ou.x > r.max.x || ou.y < r.min.y) continue
    const h = hauteurApercu(e.id)
    if (ou.y <= (h > 0 ? r.min.y + h : r.max.y)) return e as Element<Lien>
  }
  return null
}

/** Cette carte montre-t-elle une vidéo (« Remplacer l'aperçu » plutôt que « l'image ») ? */
export const estVideo = (c: Lien) => lecteurDe(c.url)?.genre === 'video'
