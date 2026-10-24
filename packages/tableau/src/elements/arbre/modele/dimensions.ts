import type { RatioPitch } from '../themesPitch'
import { type Gabarit, estPortrait } from './gabarits'

/**
 * Les mesures des diapositives du mode Pitch (relevé 11 § 0 et chapitres) : la taille de base de chaque rapport, les
 * tables de dimensions de chaque gabarit, et l'ajustement d'un texte à sa place. Tout se compte en pixels de base,
 * dans le repère de la diapositive (1600 × 900 en 16:9) ; la scène met ensuite la diapositive à l'échelle de l'écran.
 * La mesure du texte est donnée par l'appelant : le modèle reste pur, le dessin y branche une mesure réelle.
 */

/** Largeur et hauteur de base d'une diapositive. */
export const TAILLES_DE_BASE: Readonly<Record<RatioPitch, { l: number; h: number }>> = {
  '16:9': { l: 1600, h: 900 },
  '4:3': { l: 1200, h: 900 },
  '9:16': { l: 900, h: 1600 },
  '3:4': { l: 900, h: 1200 },
}

/** Les quatre unités relatives à la diapositive, en pixels de base pour ce rapport : `vw(10)` = 10 % de la largeur. */
export function unites(r: RatioPitch) {
  const { l, h } = TAILLES_DE_BASE[r]
  return {
    l,
    h,
    vw: (n: number) => (n * l) / 100,
    vh: (n: number) => (n * h) / 100,
    vmin: (n: number) => (n * Math.min(l, h)) / 100,
    vmax: (n: number) => (n * Math.max(l, h)) / 100,
  }
}

/** Une taille de texte cherchée entre deux bornes (px de base), avec ses plafonds de lignes. */
export interface Police {
  max: number
  min: number
  lignesPreferees?: number
  lignesMax?: number
}

const police = (max: number, min: number, lignesPreferees?: number, lignesMax?: number): Police => ({
  max,
  min,
  ...(lignesPreferees !== undefined ? { lignesPreferees } : {}),
  ...(lignesMax !== undefined ? { lignesMax } : {}),
})

/**
 * Le socle commun (relevé 11 § 0.2 à 0.6) : les marges de diapositive, l'échelle des espacements, l'en-tête et son
 * filet, les étiquettes, la note et la bulle.
 */
export function socle(r: RatioPitch) {
  const u = unites(r)
  const p = estPortrait(r)
  const v = (paysage: number, portrait: number) => u.vmin(p ? portrait : paysage)
  return {
    taille: { l: u.l, h: u.h },
    portrait: p,
    /** hSlidePadding, vSlidePadding. */
    marges: { h: u.vw(100 / (p ? 15 : 13)), v: u.vh(12.5) },
    espacementV: { xxs: v(1, 2), xs: v(2, 5), s: v(4, 11), normal: v(6, 13), m: v(8, 15), l: v(16, 16), xl: v(16, 20), xxl: v(25, 30) },
    espacementH: { xs: u.vmin(1), s: u.vmin(2), normal: u.vmin(3), m: v(4, 5), l: v(5, 8), xl: v(7, 11) },
    /** Au plus trois marqueurs devant un titre. */
    marqueursMax: 3,
    entete: p
      ? { x: u.vmin(100 / 15), y: u.vmin(5), police: u.vmin(4), hauteurLigne: u.vmin(4), largeurMax: u.vmax(20), filet: { longueur: u.vmin(5), epaisseur: 4 } }
      : { x: u.vmin(5), y: u.vmin(4), police: u.vmin(2.5), hauteurLigne: u.vh(2.5), largeurMax: u.vw(20), filet: { longueur: u.vmin(5), epaisseur: 4 } },
    etiquettes: { police: u.vmin(3), marge: u.vmin(2), largeurMin: u.vmin(9), trait: 2, ecart: v(2, 3), interligne: u.vmin(2) },
    note: { police: v(4, 5), opacite: 0.8 },
    bulle: { police: v(4, 6), opacite: 0.6 },
    /** Les éléments à venir d'une liste : cachés, et à 0,3 dans la vue du présentateur. */
    attente: { opacite: 0, presentateur: 0.3 },
    /** Le bord estompé d'une zone qui défile. */
    estompe: u.vh(12.5),
  }
}

/** Les tables de chaque gabarit, en px de base pour ce rapport. */
export function dimensions(r: RatioPitch) {
  const u = unites(r)
  const s = socle(r)
  const p = s.portrait
  const q = r === '4:3'
  const v = (paysage: number, portrait: number) => u.vmin(p ? portrait : paysage)
  const contenu = u.l - 2 * s.marges.h
  const k = contenu
  return {
    sujet: {
      /** Une ligne, puis deux, puis plusieurs ; à défaut la taille de repli, et la diapositive défile. */
      paliers: p
        ? [police(u.vmin(14), u.vmin(8), 1), police(0.8 * u.vmin(14), u.vmin(8), 2), police(u.vmin(8), u.vmin(7))]
        : [police(u.vmin(15), u.vmin(8), 1), police(0.8 * u.vmin(15), u.vmin(8), 2), police(u.vmin(8), u.vmin(5))],
      repli: u.vmin(8),
      largeurTexte: contenu,
      ecarts: { bulleTitre: v(1, 2), titreEtiquettes: v(1, 2), titreNote: v(16, 20), etiquettesNote: v(16, 20) },
      /** Sous cette hauteur de contenu, les formes « tient dans la page » du thème s'ajoutent. */
      tientDansLaPage: u.vh(p ? 77.5 : 74.7),
    },
    'sujet-image': {
      cote: { zone: { l: u.vw(46.67), lPetite: u.vw(20), h: u.h - 2 * u.vh(12.5) }, ecart: u.vw(100 / 15), paliers: [police(u.vmin(10), u.vmin(8), 1), police(0.8 * u.vmin(10), u.vmin(8), 2), police(u.vmin(8), u.vmin(7))] },
      dessus: {
        zone: { l: contenu, h: u.vh(62.5), hPetite: u.vh(25) },
        ecart: u.vmin(4),
        paliers: p
          ? [police(u.vmin(14), u.vmin(8), 1), police(0.8 * u.vmin(14), u.vmin(8), 2), police(u.vmin(8), u.vmin(7))]
          : [police(u.vmin(7), u.vmin(6), 1), police(0.8 * u.vmin(7), u.vmin(6), 2), police(u.vmin(6), u.vmin(4.5))],
      },
      fond: { paliers: [police(u.vmin(15), u.vmin(8), 1), police(0.8 * u.vmin(15), u.vmin(8), 2), police(u.vmin(8), u.vmin(5))], ombre: '0 0 8px rgb(0 0 0 / 0.3)' },
      seulImage: { l: contenu, h: u.h - 2 * s.marges.v },
      ecartEtiquettesNote: u.vmin(8),
    },
    accolade: {
      zoneParent: 0.3 * contenu,
      zoneAccolade: u.vmin(10.6),
      margeDroiteListe: u.vmin(100 / 13),
      parent: p ? police(u.vmin(14), u.vmin(11), 2, 5) : police(u.vmin(10), u.vmin(7), 2, 5),
      elements: p ? police(u.vmin(8), u.vmin(7), 2, 3) : police(u.vmin(7), u.vmin(4.5), 2, 3),
      /** Place prévue pour cinq lignes simples : l'écart minimal se déduit de la hauteur restante. */
      lignesPrevues: 5,
      trait: 8,
      bec: { marge: u.vmin(2), courbe: { l: 20, h: 30 }, coude: { l: 20, h: 20 }, bras: 10, repli: 50 },
    },
    puces: {
      titre: p ? police(u.vmin(14), u.vmin(14), 1, 1) : police(u.vmin(11), u.vmin(9), 1, 1),
      elements: p ? police(u.vmin(7.3), u.vmin(6.4), 2, 3) : police(u.vmin(5.5), u.vmin(4.4), 2, 3),
      titreListe: v(2, 5),
      margeHaute: u.vmin(6),
      ecart: v(6, 13),
      /** Le disque : une fraction de la taille du texte. */
      puce: 0.3,
      margePuce: u.vmin(2),
      page: 0.85,
    },
    paroles: {
      titre: p ? police(u.vmin(14), u.vmin(14), 1, 1) : police(u.vmin(11), u.vmin(9), 1, 1),
      elements: p ? police(u.vmin(7.3), u.vmin(6.4), 2, 3) : police(u.vmin(6), u.vmin(4.5), 2, 3),
      repli: p ? u.vmin(6.4) : u.vmin(6),
      titreListe: v(2, 5),
      margeGauche: u.vw(100 / (p ? 15 : 13)),
      ecart: v(4, 11),
      passes: 0.4,
      fleche: { l: 46, h: 36, rayon: 4 },
      interlettrage: { pas: 0.005, max: 0.1 },
    },
    arbre: {
      titre: police(u.vmin(14), u.vmin(11), 1, 2),
      elements: police(u.vmin(7.3), u.vmin(6.4), undefined, 2),
      titreListe: v(1, 2),
      margeHaute: u.vmin(16),
      ecart: v(4, 11),
      branche: { margeGauche: k / 6, largeur: k / 12, margeDroite: u.vmin(2), trait: 8 },
    },
    'enfant-unique': {
      parent: police(u.vmin(14), u.vmin(14), undefined, 2),
      enfant: p ? police(u.vmin(8), u.vmin(4)) : police(u.vmin(10), u.vmin(4)),
      repli: { taille: u.vmin(10), lignesPreferees: 2, lignesMax: 3 },
      separateur: { trait: 4, ecart: v(4, 5) },
    },
    resume: {
      plage: { police: u.vmin(8), lignes: 1, ecart: u.vmin(8) },
      forme: { margeGauche: u.vmin(3), largeur: u.vw(100 / 15), margeDroite: u.vmin(1), margeDroiteTrait: u.vmin(3), trait: p ? 4 : 5 },
      zoneResume: 0.3 * contenu,
      titre: police(u.vmin(10), u.vmin(6), 2, 5),
    },
    'resume-defilant': {
      plage: { police: u.vmin(7.3), lignes: 1, ecart: u.vmin(11), visibles: 2 },
      trait: { ecart: u.vmin(11), barre: u.vh(3.125) },
      titre: police(u.vmin(14), u.vmin(8)),
      estompe: u.vh(25),
    },
    arete: {
      zoneParent: u.vw(q ? 30 : 32),
      ecart: u.vmin(4),
      epine: 6,
      areteTrait: 4,
      longueur: u.vmin(21),
      /** Par rapport à la verticale, en degrés. */
      angle: 35,
      intervalle: u.vmin(q ? 47 : 66),
      decalageBas: u.vmin(q ? 9 : 16),
      largeurEtiquette: u.vmin(q ? 38 : 50),
      parent: q ? police(u.vmin(6), u.vmin(5), 1, 3) : police(u.vmin(10), u.vmin(8), 1, 3),
      elements: q ? police(u.vmin(5), u.vmin(4), 1, 2) : police(u.vmin(7), u.vmin(6), 1, 2),
    },
    'tete-arete': {
      longueur: u.vmin(80),
      intervalle: u.vmin(200),
      angle: 20,
      decalageTete: u.vmin(21.44),
      zoneParent: u.vmin(62.22),
      soeurs: { police: u.vmin(10), lignes: 1, nombre: 4 },
      trait: { longueur: 0.8 * u.vmin(9), epaisseur: 4 },
      margeTitre: u.vmin(9),
      decalageArriere: u.vmin(22.5),
      /** 8 vmin pour au plus trois éléments d'une ligne, 6 sinon. */
      ecart: { court: u.vmin(8), long: u.vmin(6) },
      elements: police(u.vmin(5.5), u.vmin(4.4), 1, 2),
    },
    chronologie: {
      zoneParent: u.vw(32),
      axe: 6,
      /** C : largeur maxi d'étiquette ; O, S : décalages de colonne et du bas. */
      colonne: { c: u.vmin(q ? 38 : 48.67), o: u.vmin(q ? 16 : 11.56), s: u.vmin(q ? 3.1 : 5.67) },
      point: 10,
      tige: { trait: 4, longueur: u.vmin(16) },
      margeEtiquette: u.vmin(2),
      parent: q ? police(u.vmin(6), u.vmin(5), 1, 3) : police(u.vmin(10), u.vmin(8), 1, 3),
      elements: q ? police(u.vmin(5), u.vmin(4), 1, 2) : police(u.vmin(7), u.vmin(6), 1, 2),
    },
    'tete-chronologie': {
      tige: u.vmin(80),
      point: 10,
      soeurs: { police: u.vmin(10), lignes: 1, nombre: 4 },
      margeTitre: u.vmin(12),
      ecart: { court: u.vmin(8), long: u.vmin(6) },
      elements: police(u.vmin(5.5), u.vmin(4.4), 1, 2),
    },
    'parent-illustre': {
      /** Paysage, et image petite ou de rapport < 4 : image à gauche, liste à droite. */
      cote: { largeurImageMin: 6 * s.marges.h, largeurImageMinPetite: 2 * s.marges.h, hauteurImage: u.h - 2 * s.marges.v, largeurListe: 4 * s.marges.h, largeurListePetite: 8 * s.marges.h, police: u.vmin(6), lignesMax: 3, ecart: u.vmin(6), ecartImage: s.marges.h },
      dessus: { hauteurImage: 0.25 * u.h, largeurImage: contenu, ecartImage: u.vmin(2), police: u.vmin(6), lignesMax: 2, ecart: u.vmin(4), margeHaute: v(8, 20) },
      rapportLarge: 4,
    },
    'enfant-unique-parent-illustre': {
      cote: { enfant: police(u.vmin(6), u.vmin(5)), separateur: 3, ecart: s.marges.h },
      dessus: { hauteurImage: 0.375 * u.h, hauteurImagePetite: 0.25 * u.h, separateur: 3, ecart: 2 * v(6, 2), enfant: p ? police(u.vmin(7.3), u.vmin(6.4)) : police(u.vmin(6), u.vmin(5)) },
      rapportLarge: 4,
    },
    'enfants-illustres': {
      titre: p ? police(u.vmin(14), u.vmin(11), 1, 1) : police(u.vmin(10), u.vmin(10), 1, 1),
      titreGalerie: v(8, 4),
      ecart: u.vmin(4),
    },
    'liste-illustree': { flou: 50, opacite: 0.7, ecart: u.vmin(4), zone: { l: contenu, h: u.h - 2 * s.marges.v } },
    'enfant-unique-illustre': {
      cote: { titre: police(u.vmin(10), u.vmin(10), undefined, 4), largeurTitre: 4 * s.marges.h, largeurTitrePetite: 8 * s.marges.h, trait: { longueur: 120, epaisseur: 3, ecart: u.vmin(4) }, largeurImageMin: 6 * s.marges.h, ecart: s.marges.h },
      dessus: {
        titre: p ? police(u.vmin(14), u.vmin(14), 1, 1) : police(u.vmin(10), u.vmin(10), undefined, 2),
        trait: { longueur: p ? 780 : null, epaisseur: 3, ecart: 2 * v(6, 5) },
        hauteurImage: (p ? 0.625 : 0.375) * u.h,
      },
      rapportLarge: 4,
    },
  } satisfies Record<Gabarit, unknown>
}

export type Dimensions = ReturnType<typeof dimensions>

// — L'ajustement du texte (relevé 11 § 0.3) —

/** Une ligne mesurée : son texte et sa largeur (px de base). */
export interface Ligne {
  texte: string
  largeur: number
}

/** La mesure injectée : comment ce texte se coupe, à cette taille, dans cette police, sur cette largeur. */
export type Mesure = (texte: string, taille: number, police: string, largeur: number) => readonly Ligne[]

/** L'interligne, en em, selon la taille : 1,5 sous 50 px, 1,4 jusqu'à 90 px, 1,3 au-delà. */
export const interligne = (taille: number): number => (taille < 50 ? 1.5 : taille < 90 ? 1.4 : 1.3)

/** La hauteur de tant de lignes à cette taille. */
export const hauteurDe = (lignes: number, taille: number): number => lignes * taille * interligne(taille)

/**
 * La plus grande taille entière de [min, max] qui satisfait le critère, par dichotomie (pas de 1 px). Le critère est
 * supposé monotone : ce qui tient à une taille tient aux plus petites. `null` si même `min` ne tient pas.
 */
export function plusGrandeTaille(min: number, max: number, tient: (taille: number) => boolean): number | null {
  let bas = Math.ceil(min)
  let haut = Math.floor(max)
  // Des bornes non entières (0,8 × 15 vmin) : on essaie la borne haute exacte d'abord.
  if (max !== haut && tient(max)) return max
  if (bas > haut || !tient(bas)) return min !== bas && tient(min) ? min : null
  while (bas < haut) {
    const milieu = Math.ceil((bas + haut) / 2)
    if (tient(milieu)) bas = milieu
    else haut = milieu - 1
  }
  return bas
}

/** Un palier de recherche : une fourchette, et ce qu'il faut tenir (nombre de lignes, hauteur). */
export interface Palier {
  max: number
  min: number
  lignes?: number
  hauteur?: number
}

export interface DemandeAjustement {
  texte: string
  police: string
  largeur: number
  /** Essayés dans l'ordre ; le premier où une taille tient gagne. */
  paliers: readonly Palier[]
  /** Quand aucun palier ne tient : cette taille, tronquée à `lignesMax` s'il est donné (sinon le texte défile). */
  repli: { taille: number; lignesMax?: number }
  /** La règle de la dernière ligne trop courte ; vraie par défaut. */
  derniereLigne?: boolean
  mesurer: Mesure
}

export interface Ajuste {
  taille: number
  /** En em. */
  interligne: number
  lignes: readonly Ligne[]
  hauteur: number
  /** Coupé et suivi de « ... ». */
  tronque: boolean
}

/** Le seuil de la dernière ligne trop courte, en part de la largeur, et la réduction qu'on essaie alors. */
export const DERNIERE_LIGNE = { seuil: 0.2, reduction: 0.8 }

const tientDans = (lignes: readonly Ligne[], taille: number, p: Palier) => (p.lignes === undefined || lignes.length <= p.lignes) && (p.hauteur === undefined || hauteurDe(lignes.length, taille) <= p.hauteur)

/**
 * Le texte coupé au plus grand nombre de caractères qui tient en `lignesMax` lignes, suivi de « ... » (trois points
 * ASCII). Le texte entier, s'il tient.
 */
export function tronquer(texte: string, taille: number, police: string, largeur: number, lignesMax: number, mesurer: Mesure): { texte: string; lignes: readonly Ligne[]; tronque: boolean } {
  const entier = mesurer(texte, taille, police, largeur)
  if (entier.length <= lignesMax) return { texte, lignes: entier, tronque: false }
  const car = [...texte]
  const essai = (n: number) => `${car.slice(0, n).join('').trimEnd()}...`
  let bas = 0
  let haut = car.length - 1
  while (bas < haut) {
    const milieu = Math.ceil((bas + haut) / 2)
    if (mesurer(essai(milieu), taille, police, largeur).length <= lignesMax) bas = milieu
    else haut = milieu - 1
  }
  const coupe = essai(bas)
  return { texte: coupe, lignes: mesurer(coupe, taille, police, largeur), tronque: true }
}

/**
 * La plus grande taille où le texte tient, palier après palier ; à défaut la taille de repli (tronquée au besoin). Puis,
 * si la dernière ligne fait au plus 20 % de la largeur, un essai à 0,8 × la taille, gardé s'il fait moins de lignes.
 */
export function ajuster(d: DemandeAjustement): Ajuste {
  const mesure = (taille: number) => d.mesurer(d.texte, taille, d.police, d.largeur)
  const fini = (taille: number, lignes: readonly Ligne[], tronque: boolean): Ajuste => ({ taille, interligne: interligne(taille), lignes, hauteur: hauteurDe(lignes.length, taille), tronque })
  let taille: number | null = null
  for (const p of d.paliers) {
    taille = plusGrandeTaille(p.min, p.max, (t) => tientDans(mesure(t), t, p))
    if (taille !== null) break
  }
  let sortie: Ajuste
  if (taille === null) {
    if (d.repli.lignesMax === undefined) sortie = fini(d.repli.taille, mesure(d.repli.taille), false)
    else {
      const t = tronquer(d.texte, d.repli.taille, d.police, d.largeur, d.repli.lignesMax, d.mesurer)
      sortie = fini(d.repli.taille, t.lignes, t.tronque)
    }
  } else sortie = fini(taille, mesure(taille), false)
  const derniere = sortie.lignes.at(-1)
  if (d.derniereLigne !== false && !sortie.tronque && sortie.lignes.length > 1 && derniere && derniere.largeur <= DERNIERE_LIGNE.seuil * d.largeur) {
    const petite = sortie.taille * DERNIERE_LIGNE.reduction
    const lignes = mesure(petite)
    if (lignes.length < sortie.lignes.length) return fini(petite, lignes, false)
  }
  return sortie
}
