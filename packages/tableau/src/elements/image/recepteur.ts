import { type Element, type Id, type Image as ContenuImage, type Operation, nouvelId } from '../../coeur/tableau'
import type { Magasin } from '../../coeur/magasin'
import { commencerEnvoi, fichierRecu } from '../envois'
import { lireDimensions, lireTransparence } from './lecture'
import { lirePalette } from './palette'
import type { ContexteToile } from '../types'
import { annoncer } from '../../avis'
import { imageARemplacer } from './survolDepot'
import { t, tn } from '../../langue'
import { type TailleUG, hauteurPour, largeurInitiale, nombreColonnes, placerImages, remplacerContenu } from './geometrie'
import { type Refus, estHeic, preparerImage, prisEnImage } from './conversion'

/** Ce que dit l'avis d'une image qui n'est pas prise. */
function messageDeRefus(nom: string, refus: Refus): string {
  if (refus === 'heic') return t('envois.heicIllisible', { nom })
  if (refus === 'taille') return t('envois.tropGros', { nom, max: '25' })
  return t('envois.imageIllisible', { nom })
}

/** Un seul avis à la fois : plusieurs refus se disent ensemble, par leur nombre et la première raison. */
function annoncerRefus(messages: string[]) {
  if (messages.length === 1) annoncer({ texte: messages[0]! })
  else if (messages.length > 1) annoncer({ texte: tn('envois.imagesRefusees', messages.length, { premiere: messages[0]! }) })
}

/** Une image lue, prête à naître : son contenu sans fichier, et le fichier à envoyer. */
type Lue = { fichier: File; contenu: Omit<ContenuImage, 'fichier'> }

/**
 * Prépare et lit une image reçue, ou dit pourquoi elle ne se prend pas : rien n'en sort qui ferait tomber les autres
 * images du même dépôt.
 */
async function lireImage(f: File): Promise<Lue | { refus: Refus }> {
  try {
    const prete = await preparerImage(f)
    if ('refus' in prete) return prete
    const { fichier, entete } = prete
    const d = entete ?? (await lireDimensions(fichier))
    if (!d) return { refus: 'illisible' }
    const transparente = await lireTransparence(fichier)
    return {
      fichier,
      contenu: {
        type: 'image',
        largeurOrigine: d.largeur,
        hauteurOrigine: d.hauteur,
        typeMime: fichier.type,
        ...(transparente !== undefined ? { transparente } : {}),
      },
    }
  } catch {
    return { refus: 'illisible' }
  }
}

/** Lit les images une à une (une conversion décode toute la photo : deux à la fois doubleraient la mémoire), dans l'ordre reçu. */
async function lireImages(fichiers: File[]): Promise<Lue[]> {
  const aConvertir = fichiers.filter(estHeic).length
  if (aConvertir > 1) annoncer({ texte: tn('envois.conversion', aConvertir) })
  const lues: Lue[] = []
  const refus: string[] = []
  for (const f of fichiers) {
    const lue = await lireImage(f)
    if ('refus' in lue) refus.push(messageDeRefus(f.name || t('type.image'), lue.refus))
    else lues.push(lue)
  }
  annoncerRefus(refus)
  return lues
}

/**
 * Attend que l'image porte ce fichier : la toile pose ce que rendent les récepteurs quand tous ont répondu (une image
 * remplacée garde l'ancien jusque-là). `undefined` si elle a changé d'ici là, ou n'est jamais venue.
 */
function quandPosee(magasin: Magasin, id: Id, envoi: string, delai = 10_000): Promise<Element<ContenuImage> | undefined> {
  const trouver = () => {
    const e = magasin.lire().elements.find((x) => x.id === id)
    const f = e?.contenu.type === 'image' ? e.contenu.fichier : undefined
    return f !== undefined && (f === envoi || f === fichierRecu(envoi)) ? (e as Element<ContenuImage>) : undefined
  }
  const deja = trouver()
  if (deja) return Promise.resolve(deja)
  return new Promise((fin) => {
    let arreter = () => {}
    const minuteur = setTimeout(() => {
      arreter()
      fin(undefined)
    }, delai)
    arreter = magasin.ecouter(() => {
      const e = trouver()
      if (!e) return
      clearTimeout(minuteur)
      arreter()
      fin(e)
    })
  })
}

/**
 * Les couleurs dominantes, lues après la naissance : elles demandent de décoder toute la photo (une demi-seconde pour
 * 48 Mpx), et l'image n'a pas à les attendre pour paraître. Une à une, et hors de l'historique, comme la fin d'un envoi.
 */
async function lireCouleursApres(images: { id: Id; fichier: Blob; envoi: string }[], magasin: Magasin) {
  for (const { id, fichier, envoi } of images) {
    const couleurs = await lirePalette(fichier)
    if (couleurs.length === 0) continue
    // L'image a pu changer entre-temps (remplacée de nouveau, défaite) : on ne colore que celle qu'on a lue.
    const e = await quandPosee(magasin, id, envoi)
    if (!e || e.contenu.couleurs) continue
    magasin.corriger([{ type: 'contenu', id, avant: e.contenu, apres: { ...e.contenu, couleurs } }])
  }
}

export function recevoirImages(donnees: DataTransfer, ou: { x: number; y: number }, contexte: ContexteToile) {
  // Pris tout de suite : le navigateur vide le presse-papiers dès qu'on rend la main.
  const fichiers = [...donnees.files].filter(prisEnImage)
  const depot = contexte.services.fichiers
  if (!depot || fichiers.length === 0) return null
  // Une image lâchée sous le voile « Remplacer l'image » (500 ms de survol) prend la place de l'autre ; lâchée plus tôt,
  // ou collée, ou choisie dans le sélecteur, elle est une image de plus.
  const visee = fichiers.length === 1 && !contexte.services.lectureSeule ? imageARemplacer() : null
  const cible = visee ? (contexte.magasin.lire().elements.find((e) => e.id === visee && e.contenu.type === 'image' && !e.verrou && e.corbeille === undefined) as Element<ContenuImage> | undefined) : undefined
  if (cible) return remplacerImage(cible, fichiers[0]!, contexte)
  return poserImages(fichiers, ou, contexte)
}

/** Ouvre le sélecteur d'images, puis l'image choisie prend la place de celle-ci (« Remplacer l'image »). */
export function choisirPourRemplacer(cible: Element<ContenuImage>, contexte: ContexteToile) {
  if (!contexte.services.fichiers) return
  const champ = document.createElement('input')
  champ.type = 'file'
  champ.accept = 'image/*'
  champ.addEventListener('change', () => {
    const f = champ.files?.[0]
    if (!f) return
    if (!prisEnImage(f)) return void annoncer({ texte: t('envois.imageNonPrise') })
    void remplacerImage(cible, f, contexte).then((ops) => ops.length > 0 && contexte.magasin.faire(ops))
  })
  champ.click()
}

/** Le fichier prend la place de celui de l'image visée, dans le même élément : même place, même largeur, même légende. */
export async function remplacerImage(cible: Element<ContenuImage>, f: File, contexte: ContexteToile): Promise<Operation[]> {
  const depot = contexte.services.fichiers
  if (!depot) return []
  const [lue] = await lireImages([f])
  if (!lue) return []
  const envoi = commencerEnvoi(lue.fichier, depot)
  const apres = remplacerContenu(cible.contenu, lue.contenu, envoi)
  void lireCouleursApres([{ id: cible.id, fichier: lue.fichier, envoi }], contexte.magasin)
  return [{ type: 'contenu', id: cible.id, avant: cible.contenu, apres }]
}

/**
 * Les images naissent dès que leurs dimensions sont lues (dans l'en-tête, le plus souvent) ; l'envoi suit (voir
 * `envois.ts`), puis leurs couleurs. Plusieurs se rangent en colonnes, dans l'ordre où elles sont arrivées.
 */
async function poserImages(fichiers: File[], ou: { x: number; y: number }, contexte: ContexteToile): Promise<Operation[]> {
  const depot = contexte.services.fichiers
  const lues = depot ? await lireImages(fichiers) : []
  if (!depot || lues.length === 0) return []
  const largeurs = lues.map((l) => largeurInitiale(l.contenu.largeurOrigine))
  const tailles: TailleUG[] = lues.map((l, i) => ({ largeur: largeurs[i]!, hauteur: hauteurPour(largeurs[i]!, l.contenu) }))
  const positions = placerImages(tailles, ou, nombreColonnes(contexte.largeurVue()))
  const elements: Element<ContenuImage>[] = lues.map((l, i) => ({
    id: nouvelId(),
    x: positions[i]![0],
    y: positions[i]![1],
    largeur: largeurs[i]!,
    contenu: { ...l.contenu, fichier: commencerEnvoi(l.fichier, depot) },
  }))
  void lireCouleursApres(
    elements.map((e, i) => ({ id: e.id, fichier: lues[i]!.fichier, envoi: e.contenu.fichier })),
    contexte.magasin,
  )
  return elements.map((element) => ({ type: 'creer' as const, element }))
}
