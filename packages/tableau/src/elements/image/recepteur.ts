import { type Element, type Image as ContenuImage, type Operation, nouvelId } from '../../coeur/tableau'
import { commencerEnvoi } from '../envois'
import { lireDimensions, lireTransparence } from './lecture'
import type { ContexteToile, DepotFichiers } from '../types'
import { annoncer } from '../../avis'
import { t } from '../../langue'
import { type TailleUG, TAILLE_MAX, TYPES_ACCEPTES, hauteurPour, imageSous, largeurInitiale, nombreColonnes, placerImages, remplacerContenu } from './geometrie'

export function recevoirImages(donnees: DataTransfer, ou: { x: number; y: number }, contexte: ContexteToile) {
  // Pris tout de suite : le navigateur vide le presse-papiers dès qu'on rend la main.
  const images = [...donnees.files].filter((f) => TYPES_ACCEPTES.includes(f.type))
  // Une image trop lourde est refusée à voix haute : un filtre muet laisse croire que le dépôt n'a pas pris.
  for (const f of images) if (f.size > TAILLE_MAX) annoncer({ texte: t('envois.tropGros', { nom: f.name, max: '25' }) })
  const fichiers = images.filter((f) => f.size <= TAILLE_MAX)
  const depot = contexte.services.fichiers
  if (!depot || fichiers.length === 0) return null
  // Une image lâchée sur une autre la remplace. Seul un dépôt a un point visé : un collage ou le sélecteur n'en ont pas.
  const cible = fichiers.length === 1 && estUnDepot(donnees) && !contexte.services.lectureSeule
    ? imageSous(contexte.magasin.lire().elements, (id) => contexte.rect(id), ou)
    : null
  if (cible) return remplacerImage(cible, fichiers[0]!, depot)
  return poserImages(fichiers, ou, contexte, depot)
}

/** Un `DataTransfer` de glisser-déposer a un effet permis ; celui du presse-papiers ou du sélecteur n'en a pas. */
const estUnDepot = (d: DataTransfer) => d.effectAllowed !== 'uninitialized' && d.effectAllowed !== 'none'

/** Ouvre le sélecteur d'images, puis l'image choisie prend la place de celle-ci (« Remplacer l'image »). */
export function choisirPourRemplacer(cible: Element<ContenuImage>, contexte: ContexteToile) {
  const depot = contexte.services.fichiers
  if (!depot) return
  const champ = document.createElement('input')
  champ.type = 'file'
  champ.accept = 'image/*'
  champ.addEventListener('change', () => {
    const f = champ.files?.[0]
    if (!f) return
    if (!TYPES_ACCEPTES.includes(f.type)) return void annoncer({ texte: t('envois.imageNonPrise') })
    if (f.size > TAILLE_MAX) return void annoncer({ texte: t('envois.tropGros', { nom: f.name, max: '25' }) })
    void remplacerImage(cible, f, depot).then((ops) => ops.length > 0 && contexte.magasin.faire(ops))
  })
  champ.click()
}

/** Le fichier prend la place de celui de l'image visée, dans le même élément : même place, même largeur, même légende. */
export async function remplacerImage(cible: Element<ContenuImage>, f: File, depot: DepotFichiers): Promise<Operation[]> {
  const d = await lireDimensions(f)
  if (!d) return []
  const transparente = await lireTransparence(f)
  const nouveau: Omit<ContenuImage, 'fichier'> = {
    type: 'image',
    largeurOrigine: d.largeur,
    hauteurOrigine: d.hauteur,
    typeMime: f.type,
    ...(transparente !== undefined ? { transparente } : {}),
  }
  const apres = remplacerContenu(cible.contenu, nouveau, commencerEnvoi(f, depot))
  return [{ type: 'contenu', id: cible.id, avant: cible.contenu, apres }]
}

/** Les images naissent dès que leurs dimensions sont lues ; l'envoi suit (voir `envois.ts`). */
async function poserImages(fichiers: File[], ou: { x: number; y: number }, contexte: ContexteToile, depot: DepotFichiers): Promise<Operation[]> {
  const lues: { fichier: Blob; contenu: Omit<ContenuImage, 'fichier'>; largeur: number }[] = []
  for (const f of fichiers) {
    const d = await lireDimensions(f)
    if (!d) continue
    const transparente = await lireTransparence(f)
    const contenu = {
      type: 'image' as const,
      largeurOrigine: d.largeur,
      hauteurOrigine: d.hauteur,
      typeMime: f.type,
      ...(transparente !== undefined ? { transparente } : {}),
    }
    lues.push({ fichier: f, contenu, largeur: largeurInitiale(d.largeur) })
  }
  if (lues.length === 0) return []

  const tailles: TailleUG[] = lues.map((l) => ({ largeur: l.largeur, hauteur: hauteurPour(l.largeur, l.contenu) }))
  const positions = placerImages(tailles, ou, nombreColonnes(contexte.largeurVue()))
  const elements: Element[] = []
  for (const [i, l] of lues.entries()) {
    const [x, y] = positions[i]!
    elements.push({
      id: nouvelId(),
      x,
      y,
      largeur: l.largeur,
      contenu: { ...l.contenu, fichier: commencerEnvoi(l.fichier, depot) },
    })
  }
  return elements.map((element) => ({ type: 'creer' as const, element }))
}
