import type { GenreLien, Lien, RenvoiTableau } from '../../coeur/tableau'
import type { Point } from '../../coeur/geometrie'
import type { ContexteToile } from '../types'
import { type Element, nouvelId } from '../../coeur/tableau'
import { estUnDepotToile, registre } from '../registre'
import { TYPES_ACCEPTES } from '../image/geometrie'
import { adresseSure, lireAdresse } from './adresse'
import { LARGEUR_MEDIA_SEUL, largeurMaxLien, largeurOrigineLien, largeurMinLien, mediaSeul, proportionLien } from './affichage'
import { choisirImageApercu, estVideo, imageMontree, lienSous, poserImageApercu } from './imageApercu'
import { lireRaccourci } from './raccourciUrl'
import { RenduLien, amorcerLegendeLien, legendeAEditer, titreDuLien } from './Lien'
import './lien.css'
import { OutilsLien } from './Outils'
import { t } from '../../langue'
import { type NomIcone, ico } from '../../icones'
import { couleurDuContenu } from '../couleur'
import { OutilCouleurCarte } from '../couleur/OutilCouleurCarte'

const LARGEUR_LIEN = 34

const GENRES: { genre: GenreLien; libelle: string; icone: NomIcone; rang: number }[] = [
  // Dans « ••• » de la barre de création, l'ordre de Milanote : Audio, Carte, Vidéo.
  { genre: 'audio', get libelle() { return t('lien.audio') }, icone: 'audio', rang: 230 },
  { genre: 'carte', get libelle() { return t('lien.carte') }, icone: 'carte', rang: 240 },
  { genre: 'video', get libelle() { return t('lien.video') }, icone: 'lecture', rang: 250 },
]

const nouveauLien = (ou: Point, url: string, genre?: GenreLien): Element<Lien> => ({
  id: nouvelId(),
  x: Math.round(ou.x),
  y: Math.round(ou.y),
  largeur: LARGEUR_LIEN,
  contenu: { type: 'lien', url, statut: 'attente', ...(genre ? { genre } : {}) },
})

registre.type<Lien>({
  type: 'lien',
  get nom() {
    return t('type.lien')
  },
  resume: (c) => titreDuLien(c) || c.url,
  Rendu: RenduLien,
  editable: true,
  hauteurParDefaut: 7,
  sansFond: true,
  hauteurBornable: true,
  // 4 UG avec un média (comme une image), 17 sans ; une vidéo seule garde ses proportions.
  largeurMin: largeurMinLien,
  // Une image d'aperçu ne s'étire pas au-delà de sa taille d'origine, et le double-clic sur la poignée y revient.
  largeurMax: largeurMaxLien,
  largeurNaturelle: largeurOrigineLien,
  proportion: proportionLien,
  // Taper sur un lien choisi commence sa légende (sauf si la carte est trop étroite pour en avoir une).
  surFrappe(e, caractere, contexte) {
    const c = e.contenu
    if (contexte.services.lectureSeule || c.statut !== 'pret' || !c.url || e.largeur < LARGEUR_MEDIA_SEUL) return false
    if (c.sansLegende) {
      const { sansLegende: _, ...reste } = c
      contexte.magasin.faire([{ type: 'contenu', id: e.id, avant: c, apres: reste }])
    }
    legendeAEditer.add(e.id)
    amorcerLegendeLien(caractere)
    return true
  },
  // En « média seul », le double-clic sur l'aperçu ouvre l'adresse dans un nouvel onglet (pas en présentation).
  surDoubleClic(e, cible, contexte) {
    if (contexte.services.presentation || !e.contenu.url || !cible?.closest('.notak-lien-media')) return false
    if (!mediaSeul(e.contenu, e.parent ? undefined : e.largeur)) return false
    const url = adresseSure(e.contenu.url)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    return true
  },
  Outils: OutilCouleurCarte,
  // La couleur est une barre de 5 px en haut de la carte (le fond reste blanc), pas une teinte.
  couleur: couleurDuContenu<Lien>(),
  OutilsApres: OutilsLien,
  outils: [
    {
      get libelle() {
        return t('type.lien')
      },
      icone: ico('lien'),
      rang: 20,
      vignette: 'lien',
      fantome: () => nouveauLien({ x: 0, y: 0 }, ''),
      creer: (ou) => [{ type: 'creer', element: nouveauLien(ou, '') }],
    },
    ...GENRES.map(({ genre, libelle, icone, rang }) => ({
      libelle,
      icone: ico(icone),
      rang,
      vignette: genre,
      tiroir: true,
      fantome: () => nouveauLien({ x: 0, y: 0 }, '', genre),
      // Un lien vide, en édition : on y colle l'adresse de la vidéo, du morceau ou de la carte.
      creer: (ou: Point) => [{ type: 'creer' as const, element: nouveauLien(ou, '', genre) }],
    })),
  ],
})

/** Plusieurs adresses collées ou déposées se posent l'une sous l'autre, à ce pas (UG). */
const PAS_ADRESSES = 12

registre.recepteur({
  priorite: 30,
  recevoir(donnees, ou, contexte) {
    // Une liste d'adresses (glissées d'un navigateur, ou une par ligne) : un lien chacune, tant qu'aucune ligne
    // n'est autre chose qu'une adresse.
    const brut = donnees.getData('text/uri-list') || donnees.getData('text/plain')
    const lignes = brut.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    const urls = lignes.map(lireAdresse)
    if (urls.length === 0 || urls.some((u) => !u)) return null
    return adressesEnElements([...new Set(urls as string[])], ou, contexte).map((element) => ({ type: 'creer' as const, element }))
  },
})

/** Une adresse de tableau de cet espace devient un raccourci vers lui ; toute autre adresse, un lien. */
function adressesEnElements(urls: string[], ou: Point, contexte?: ContexteToile): Element[] {
  return urls.map((url, i) => {
    const place = { x: ou.x, y: ou.y + i * PAS_ADRESSES }
    const cible = contexte && tableauDeAdresse(url, contexte)
    return cible ? nouveauRaccourciVers(cible, place) : nouveauLien(place, url)
  })
}

/** Le tableau que désigne une adresse de cette application (`/t/<id>`), s'il existe dans l'espace. */
export function tableauDeAdresse(url: string, contexte: ContexteToile, origine = typeof location === 'undefined' ? '' : location.origin): string | null {
  try {
    const u = new URL(url)
    const m = u.origin === origine ? /^\/t\/([^/]+)\/?$/.exec(u.pathname) : null
    const id = m ? decodeURIComponent(m[1]!) : null
    return id && contexte.services.tableau?.(id) ? id : null
  } catch {
    return null
  }
}

const nouveauRaccourciVers = (cible: string, ou: Point): Element<RenvoiTableau> => ({
  id: nouvelId(),
  x: Math.round(ou.x),
  y: Math.round(ou.y),
  largeur: 10,
  contenu: { type: 'tableau', cible, raccourci: true },
})

// Un fichier .url (Windows) ou .webloc (macOS) lâché sur la toile devient un lien vers l'adresse qu'il contient.
registre.recepteur({
  priorite: 36,
  async recevoir(donnees, ou) {
    const raccourcis = [...donnees.files].filter((f) => /\.(url|webloc)$/i.test(f.name))
    if (raccourcis.length === 0) return []
    const urls: string[] = []
    for (const f of raccourcis) {
      const url = lireRaccourci(await f.text())
      if (url && !urls.includes(url)) urls.push(url)
    }
    return urls.map((url, i) => ({ type: 'creer' as const, element: nouveauLien({ x: ou.x, y: ou.y + i * PAS_ADRESSES }, url) }))
  },
})

// Une image lâchée sur l'aperçu d'un lien le remplace (un lien sans image la reçoit).
registre.recepteur({
  priorite: 41,
  async recevoir(donnees, ou, contexte) {
    const fichiers = [...donnees.files].filter((f) => TYPES_ACCEPTES.includes(f.type))
    if (fichiers.length !== 1 || [...donnees.files].length !== 1 || !estUnDepotToile(donnees) || contexte.services.lectureSeule || !contexte.services.fichiers) return []
    const cible = lienSous(
      contexte.magasin.lire().elements,
      (id) => contexte.rect(id),
      (id) => (document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .notak-lien-media`)?.offsetHeight ?? 0) / 10,
      ou,
    )
    return cible ? poserImageApercu(cible, fichiers[0]!, contexte) : []
  },
})

// Copier l'adresse n'a pas de tuile : il est au menu « ••• » de la barre, comme chez Milanote (on ouvre en cliquant l'en-tête).
const liensAvecAdresse = (els: Element[]) => els.length > 0 && els.every((e) => e.contenu.type === 'lien' && !!e.contenu.url)
const adressesDe = (els: Element[]) => els.flatMap((e) => (e.contenu.type === 'lien' ? [e.contenu.url] : []))

registre.entreeMenu({
  get libelle() {
    return t('lien.copierAdresse')
  },
  visible: (els) => liensAvecAdresse(els),
  faire: (els) => void navigator.clipboard.writeText(adressesDe(els).join('\n')),
})

// « Ajouter une image » à un lien qui n'en montre pas ; « Remplacer l'image » (celle d'une image, aussi : voir elements/image) ou
// « Remplacer l'aperçu » (une vidéo) quand il en montre une.
const lienSeul = (els: Element[], contexte: ContexteToile) =>
  els.length === 1 && els[0]!.contenu.type === 'lien' && !!els[0]!.contenu.url && !contexte.services.lectureSeule && !!contexte.services.fichiers

registre.entreeMenu({
  get libelle() {
    return t('lien.ajouterImage')
  },
  visible: (els, contexte) => lienSeul(els, contexte) && els[0]!.contenu.type === 'lien' && !imageMontree(els[0]!.contenu),
  faire: ([e], contexte) => e?.contenu.type === 'lien' && choisirImageApercu(e as Element<Lien>, contexte),
})

registre.entreeMenu({
  get libelle() {
    return t('lien.remplacerApercu')
  },
  visible: (els, contexte) => lienSeul(els, contexte) && els[0]!.contenu.type === 'lien' && imageMontree(els[0]!.contenu) && estVideo(els[0]!.contenu),
  faire: ([e], contexte) => e?.contenu.type === 'lien' && choisirImageApercu(e as Element<Lien>, contexte),
})
