import { readFileSync } from 'node:fs'

// Le texte des cartes d'aperçu (apercuLien.ts), dessiné en tracés : librsvg, qui rend le SVG pour `sharp`, chercherait
// sinon ses polices dans le système, et l'image du serveur (node:24-slim) n'en a aucune. Les contours viennent d'Inter,
// la police de l'app, lus ici dans ses fichiers TrueType (`polices/`) : le même dessin au pixel près sur un Mac et en
// production, sans rien installer.
//
// Ce qu'il en faut, et rien de plus : les caractères (`cmap`), les chasses (`hmtx`), les contours (`glyf`, composites
// compris) et l'approche des paires (`GPOS`, `kern`). Ni ligatures ni variantes contextuelles : un titre n'en a pas besoin.

interface Point {
  x: number
  y: number
  /** Sur la courbe ; sinon un point de contrôle de la quadratique. */
  sur: boolean
}

export interface Police {
  /** Unités par cadratin. */
  unites: number
  /** Le haut des capitales, en unités : de quoi poser un texte par son œil plutôt que par sa ligne de base. */
  capitales: number
  /** Le glyphe d'un caractère ; 0 (le glyphe manquant) quand la police ne le dessine pas. */
  glyphe(caractere: number): number
  avance(glyphe: number): number
  /** L'approche entre deux glyphes qui se suivent, en unités (négative : ils se rapprochent). */
  approche(gauche: number, droite: number): number
  contours(glyphe: number): Point[][]
}

const DOSSIER = new URL('./polices/', import.meta.url)
const chargees = new Map<string, Police>()

/** Une police de `polices/`, lue une fois. */
export function police(nom: string): Police {
  let p = chargees.get(nom)
  if (!p) {
    p = lirePolice(readFileSync(new URL(nom, DOSSIER)))
    chargees.set(nom, p)
  }
  return p
}

/** Lit un fichier TrueType (contours `glyf`). Lève si le fichier n'en est pas un. */
export function lirePolice(octets: Buffer): Police {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  const u16 = (o: number) => v.getUint16(o)
  const i16 = (o: number) => v.getInt16(o)
  const u32 = (o: number) => v.getUint32(o)
  const tables = new Map<string, number>()
  for (let i = 0, n = u16(4); i < n; i++) {
    const o = 12 + i * 16
    tables.set(octets.toString('latin1', o, o + 4), u32(o + 8))
  }
  const table = (nom: string) => {
    const o = tables.get(nom)
    if (o === undefined) throw new Error(`police sans table ${nom}`)
    return o
  }
  const head = table('head')
  const unites = u16(head + 18)
  const locaLongs = i16(head + 50) === 1
  const glyphes = u16(table('maxp') + 4)
  const metriques = u16(table('hhea') + 34)
  const hmtx = table('hmtx')
  const loca = table('loca')
  const glyf = table('glyf')
  const os2 = tables.get('OS/2')
  // sCapHeight n'existe qu'à partir de la version 2 de OS/2 ; à défaut, 70 % du cadratin, l'usage.
  const capitales = os2 !== undefined && u16(os2) >= 2 ? i16(os2 + 88) : Math.round(unites * 0.7)

  // Les caractères : la sous-table Unicode complète (format 12) de préférence, sinon celle du plan de base (format 4).
  const cmap = table('cmap')
  let sousTable = -1
  for (let i = 0, n = u16(cmap + 2); i < n; i++) {
    const r = cmap + 4 + i * 8
    const [plateforme, codage, o] = [u16(r), u16(r + 2), cmap + u32(r + 4)]
    const format = u16(o)
    if (plateforme === 3 && codage === 10 && format === 12) sousTable = o
    else if (sousTable < 0 && ((plateforme === 3 && codage === 1) || plateforme === 0) && (format === 4 || format === 12)) sousTable = o
  }
  if (sousTable < 0) throw new Error('police sans table de caractères Unicode')
  const glyphe = (c: number): number => {
    if (u16(sousTable) === 12) {
      let [bas, haut] = [0, u32(sousTable + 12) - 1]
      while (bas <= haut) {
        const milieu = (bas + haut) >> 1
        const g = sousTable + 16 + milieu * 12
        if (c < u32(g)) haut = milieu - 1
        else if (c > u32(g + 4)) bas = milieu + 1
        else return u32(g + 8) + c - u32(g)
      }
      return 0
    }
    if (c > 0xffff) return 0
    const segments = u16(sousTable + 6) / 2
    const fins = sousTable + 14
    const debuts = fins + segments * 2 + 2
    const deltas = debuts + segments * 2
    const decalages = deltas + segments * 2
    for (let i = 0; i < segments; i++) {
      if (c > u16(fins + i * 2)) continue
      if (c < u16(debuts + i * 2)) return 0
      const decalage = u16(decalages + i * 2)
      if (decalage === 0) return (c + i16(deltas + i * 2)) & 0xffff
      const g = u16(decalages + i * 2 + decalage + (c - u16(debuts + i * 2)) * 2)
      return g === 0 ? 0 : (g + i16(deltas + i * 2)) & 0xffff
    }
    return 0
  }

  const avance = (g: number) => u16(hmtx + Math.min(g, metriques - 1) * 4)

  const debutDe = (g: number) => (locaLongs ? u32(loca + g * 4) : u16(loca + g * 2) * 2)
  const enCache = new Map<number, Point[][]>()
  const contours = (g: number, profondeur = 0): Point[][] => {
    const deja = enCache.get(g)
    if (deja) return deja
    if (g < 0 || g >= glyphes || profondeur > 8) return []
    const [debut, fin] = [debutDe(g), debutDe(g + 1)]
    if (fin <= debut) return []
    const o = glyf + debut
    const n = i16(o)
    const lus: Point[][] = []
    if (n >= 0) {
      const finsDeContour = Array.from({ length: n }, (_, i) => u16(o + 10 + i * 2))
      const total = n === 0 ? 0 : finsDeContour[n - 1]! + 1
      let p = o + 10 + n * 2
      p += 2 + u16(p)
      const drapeaux: number[] = []
      while (drapeaux.length < total) {
        const d = v.getUint8(p++)
        drapeaux.push(d)
        if (d & 8) for (let r = v.getUint8(p++); r > 0; r--) drapeaux.push(d)
      }
      const coordonnees = (court: number, meme: number) => {
        const valeurs: number[] = []
        let c = 0
        for (const d of drapeaux) {
          if (d & court) c += d & meme ? v.getUint8(p++) : -v.getUint8(p++)
          else if (!(d & meme)) {
            c += i16(p)
            p += 2
          }
          valeurs.push(c)
        }
        return valeurs
      }
      const xs = coordonnees(2, 16)
      const ys = coordonnees(4, 32)
      let premier = 0
      for (const dernier of finsDeContour) {
        const contour: Point[] = []
        for (let i = premier; i <= dernier; i++) contour.push({ x: xs[i]!, y: ys[i]!, sur: (drapeaux[i]! & 1) === 1 })
        lus.push(contour)
        premier = dernier + 1
      }
    } else {
      // Un glyphe composé (une lettre et son accent) : ses morceaux, chacun déplacé et peut-être mis à l'échelle.
      let p = o + 10
      for (let encore = true; encore; ) {
        const drapeaux = u16(p)
        const morceau = u16(p + 2)
        p += 4
        let [dx, dy] = [0, 0]
        if (drapeaux & 1) {
          ;[dx, dy] = drapeaux & 2 ? [i16(p), i16(p + 2)] : [0, 0]
          p += 4
        } else {
          ;[dx, dy] = drapeaux & 2 ? [v.getInt8(p), v.getInt8(p + 1)] : [0, 0]
          p += 2
        }
        const f2dot14 = (q: number) => i16(q) / 16384
        let [a, b, c, d] = [1, 0, 0, 1]
        if (drapeaux & 8) {
          a = d = f2dot14(p)
          p += 2
        } else if (drapeaux & 0x40) {
          ;[a, d] = [f2dot14(p), f2dot14(p + 2)]
          p += 4
        } else if (drapeaux & 0x80) {
          ;[a, b, c, d] = [f2dot14(p), f2dot14(p + 2), f2dot14(p + 4), f2dot14(p + 6)]
          p += 8
        }
        for (const contour of contours(morceau, profondeur + 1)) lus.push(contour.map((q) => ({ x: a * q.x + c * q.y + dx, y: b * q.x + d * q.y + dy, sur: q.sur })))
        encore = (drapeaux & 0x20) !== 0
      }
    }
    enCache.set(g, lus)
    return lus
  }

  return { unites, capitales, glyphe, avance, approche: lireApproches(v, tables.get('GPOS')), contours }
}

/**
 * L'approche des paires de la table GPOS : les recherches de positionnement par paires (type 2, ou 9 qui l'enveloppe)
 * de la fonction `kern`, pour l'écriture latine et celle par défaut. Une paire se calcule à la demande, puis se garde.
 */
function lireApproches(v: DataView, gpos: number | undefined): (gauche: number, droite: number) => number {
  if (gpos === undefined) return () => 0
  const u16 = (o: number) => v.getUint16(o)
  const i16 = (o: number) => v.getInt16(o)
  const u32 = (o: number) => v.getUint32(o)
  const [scripts, fonctions, recherches] = [gpos + u16(gpos + 4), gpos + u16(gpos + 6), gpos + u16(gpos + 8)]

  const indices = new Set<number>()
  for (let i = 0, n = u16(scripts); i < n; i++) {
    const r = scripts + 2 + i * 6
    const nom = String.fromCharCode(v.getUint8(r), v.getUint8(r + 1), v.getUint8(r + 2), v.getUint8(r + 3))
    if (!['DFLT', 'latn', 'cyrl', 'grek'].includes(nom)) continue
    const script = scripts + u16(r + 4)
    const parDefaut = u16(script)
    if (!parDefaut) continue
    const langue = script + parDefaut
    for (let k = 0, m = u16(langue + 4); k < m; k++) {
      const f = fonctions + 2 + u16(langue + 6 + k * 2) * 6
      if (String.fromCharCode(v.getUint8(f), v.getUint8(f + 1), v.getUint8(f + 2), v.getUint8(f + 3)) !== 'kern') continue
      const fonction = fonctions + u16(f + 4)
      for (let j = 0, l = u16(fonction + 2); j < l; j++) indices.add(u16(fonction + 4 + j * 2))
    }
  }

  // Les sous-tables de paires, dans l'ordre des recherches : chaque recherche ajoute la sienne, la première sous-table
  // qui connaît la paire répond pour sa recherche.
  const parRecherche: number[][] = [...indices]
    .sort((a, b) => a - b)
    .map((i) => {
      const recherche = recherches + u16(recherches + 2 + i * 2)
      const type = u16(recherche)
      const sous: number[] = []
      for (let k = 0, n = u16(recherche + 4); k < n; k++) {
        let s = recherche + u16(recherche + 6 + k * 2)
        if (type === 9) {
          if (u16(s + 2) !== 2) continue
          s += u32(s + 4)
        } else if (type !== 2) continue
        sous.push(s)
      }
      return sous
    })

  const couverture = (o: number, g: number): number => {
    if (u16(o) === 1) {
      let [bas, haut] = [0, u16(o + 2) - 1]
      while (bas <= haut) {
        const milieu = (bas + haut) >> 1
        const x = u16(o + 4 + milieu * 2)
        if (g < x) haut = milieu - 1
        else if (g > x) bas = milieu + 1
        else return milieu
      }
      return -1
    }
    let [bas, haut] = [0, u16(o + 2) - 1]
    while (bas <= haut) {
      const milieu = (bas + haut) >> 1
      const r = o + 4 + milieu * 6
      if (g < u16(r)) haut = milieu - 1
      else if (g > u16(r + 2)) bas = milieu + 1
      else return u16(r + 4) + g - u16(r)
    }
    return -1
  }
  const classe = (o: number, g: number): number => {
    if (u16(o) === 1) {
      const debut = u16(o + 2)
      return g >= debut && g < debut + u16(o + 4) ? u16(o + 6 + (g - debut) * 2) : 0
    }
    let [bas, haut] = [0, u16(o + 2) - 1]
    while (bas <= haut) {
      const milieu = (bas + haut) >> 1
      const r = o + 4 + milieu * 6
      if (g < u16(r)) haut = milieu - 1
      else if (g > u16(r + 2)) bas = milieu + 1
      else return u16(r + 4)
    }
    return 0
  }
  const bits = (f: number) => {
    let n = 0
    for (let x = f; x; x >>= 1) n += x & 1
    return n
  }
  /** L'avance horizontale d'un enregistrement de valeurs (`XAdvance`), s'il en porte une. */
  const avanceDe = (format: number, o: number) => (format & 4 ? i16(o + 2 * bits(format & 3)) : 0)

  const paire = (s: number, gauche: number, droite: number): number | null => {
    const index = couverture(s + u16(s + 2), gauche)
    if (index < 0) return null
    const [format1, format2] = [u16(s + 4), u16(s + 6)]
    const taille = 2 * (bits(format1) + bits(format2))
    if (u16(s) === 1) {
      if (index >= u16(s + 8)) return null
      const ensemble = s + u16(s + 10 + index * 2)
      let [bas, haut] = [0, u16(ensemble) - 1]
      while (bas <= haut) {
        const milieu = (bas + haut) >> 1
        const r = ensemble + 2 + milieu * (2 + taille)
        const seconde = u16(r)
        if (droite < seconde) haut = milieu - 1
        else if (droite > seconde) bas = milieu + 1
        else return avanceDe(format1, r + 2)
      }
      return null
    }
    if (u16(s) !== 2) return null
    const [c1, c2] = [classe(s + u16(s + 8), gauche), classe(s + u16(s + 10), droite)]
    const [n1, n2] = [u16(s + 12), u16(s + 14)]
    if (c1 >= n1 || c2 >= n2) return null
    return avanceDe(format1, s + 16 + (c1 * n2 + c2) * taille)
  }

  const gardees = new Map<number, number>()
  return (gauche, droite) => {
    const cle = gauche * 65536 + droite
    const deja = gardees.get(cle)
    if (deja !== undefined) return deja
    let total = 0
    for (const sous of parRecherche) {
      for (const s of sous) {
        const a = paire(s, gauche, droite)
        if (a !== null) {
          total += a
          break
        }
      }
    }
    gardees.set(cle, total)
    return total
  }
}

/** Comment poser un texte : sa taille en pixels, et l'interlettrage en fraction du cadratin (négatif : serré). */
export interface Corps {
  police: Police
  taille: number
  interlettrage?: number
}

/**
 * Les glyphes d'un texte et leur place, en unités de la police. Ce que la police ne dessine pas (un émoji, un idéogramme)
 * est laissé de côté : `manquants` le compte.
 */
function poser({ police: p, interlettrage = 0 }: Corps, texte: string): { glyphes: { g: number; x: number }[]; largeur: number; manquants: number } {
  const glyphes: { g: number; x: number }[] = []
  let [x, precedent, manquants] = [0, -1, 0]
  const espace = p.glyphe(0x20)
  for (const caractere of texte.normalize('NFC')) {
    const code = caractere.codePointAt(0)!
    // Les espaces insécables, fines comprises, se dessinent comme une espace quand la police ne les a pas.
    let g = p.glyphe(code)
    if (g === 0 && /\s/u.test(caractere)) g = espace
    if (g === 0) {
      // Les sélecteurs de variante et les liants d'émojis ne se voient pas : ils ne comptent pas pour manquants.
      if (!/[‍︎️]/u.test(caractere)) manquants++
      continue
    }
    if (precedent >= 0) x += p.approche(precedent, g) + interlettrage * p.unites
    glyphes.push({ g, x })
    x += p.avance(g)
    precedent = g
  }
  return { glyphes, largeur: x, manquants }
}

/** La largeur d'un texte, en pixels. */
export function mesurer(corps: Corps, texte: string): number {
  return (poser(corps, texte).largeur * corps.taille) / corps.police.unites
}

/** Combien de caractères d'un texte la police ne dessine pas. */
export function manquants(corps: Corps, texte: string): number {
  return poser(corps, texte).manquants
}

/** Le texte sans ce que la police ne dessine pas (un émoji, un idéogramme), ni les blancs qu'ils laissent. */
export function dessinable({ police: p }: Corps, texte: string): string {
  return [...texte.normalize('NFC')]
    .filter((c) => /\s/u.test(c) || p.glyphe(c.codePointAt(0)!) !== 0)
    .join('')
    .replace(/[^\S  ]+/gu, ' ')
    .replace(/ (?=[  ])|(?<=[  ]) /gu, '')
    .trim()
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/**
 * Le tracé SVG (`d`) d'une ligne de texte, sa ligne de base à `y`, commencée à `x`. Les quadratiques de TrueType y
 * restent des `Q`, avec les points sur la courbe qu'elles sous-entendent entre deux points de contrôle.
 */
export function tracer(corps: Corps, texte: string, x: number, y: number): string {
  const { police: p, taille } = corps
  const echelle = taille / p.unites
  const morceaux: string[] = []
  for (const { g, x: gx } of poser(corps, texte).glyphes) {
    const X = (q: { x: number }) => arrondi(x + (gx + q.x) * echelle)
    const Y = (q: { y: number }) => arrondi(y - q.y * echelle)
    for (const contour of p.contours(g)) {
      if (contour.length < 2) continue
      // Le départ : un point sur la courbe, ou, si le contour commence et finit hors d'elle, le milieu des deux.
      const premier = contour[0]!
      const dernier = contour[contour.length - 1]!
      const depart = premier.sur ? premier : dernier.sur ? dernier : { x: (premier.x + dernier.x) / 2, y: (premier.y + dernier.y) / 2, sur: true }
      const suite = premier.sur ? contour.slice(1) : dernier.sur ? contour.slice(0, -1) : contour
      const d = [`M${X(depart)} ${Y(depart)}`]
      let controle: Point | null = null
      for (const q of [...suite, depart]) {
        if (q.sur) {
          d.push(controle ? `Q${X(controle)} ${Y(controle)} ${X(q)} ${Y(q)}` : `L${X(q)} ${Y(q)}`)
          controle = null
        } else if (controle) {
          const milieu = { x: (controle.x + q.x) / 2, y: (controle.y + q.y) / 2 }
          d.push(`Q${X(controle)} ${Y(controle)} ${X(milieu)} ${Y(milieu)}`)
          controle = q
        } else controle = q
      }
      morceaux.push(`${d.join('')}Z`)
    }
  }
  return morceaux.join('')
}

/**
 * Comme `couper`, mais en lignes de longueurs voisines, comme `text-wrap: balance` sur le site : un titre de deux
 * lignes ne laisse pas un mot seul sur la seconde. Ce qui déborde garde la coupe de `couper`.
 */
export function equilibrer(corps: Corps, texte: string, largeur: number, lignes: number): string[] {
  const pleines = couper(corps, texte, largeur, lignes)
  if (pleines.length < 2 || pleines.at(-1)!.endsWith('…')) return pleines
  // La plus petite largeur qui garde autant de lignes, sans ellipse ni mot coupé.
  const tient = (l: number) => {
    const essai = couper(corps, texte, l, pleines.length)
    return essai.length === pleines.length && !essai.at(-1)!.endsWith('…') && essai.join(' ') === pleines.join(' ')
  }
  let [bas, haut] = [largeur / 2, largeur]
  for (let i = 0; i < 12; i++) {
    const milieu = (bas + haut) / 2
    if (tient(milieu)) haut = milieu
    else bas = milieu
  }
  return couper(corps, texte, haut, pleines.length)
}

/**
 * Les espaces où une ligne ne se coupe pas, à la française : avant « : ; ! ? » et le guillemet fermant, après le
 * guillemet ouvrant, avant un tiret d'incise. Elles deviennent insécables, de la même chasse ; les autres blancs, des
 * espaces simples.
 */
export function lier(texte: string): string {
  return texte
    .replace(/[^\S  ]+/gu, ' ')
    .trim()
    .replace(/ (?=[:;!?»])/gu, ' ')
    .replace(/« /gu, '« ')
    .replace(/ (?=[—–] )/gu, ' ')
}

/**
 * Le texte coupé en lignes d'au plus `largeur` pixels, `lignes` au plus : on coupe aux espaces (pas aux insécables,
 * voir `lier`), un mot trop long pour une ligne se coupe où il faut, et ce qui ne tient pas finit la dernière ligne
 * par une ellipse.
 */
export function couper(corps: Corps, texte: string, largeur: number, lignes: number): string[] {
  const tient = (t: string) => mesurer(corps, t) <= largeur
  const toutes: string[] = []
  let ligne = ''
  for (const brut of lier(texte).split(' ')) {
    if (!brut) continue
    let mot = brut
    const essai = ligne ? `${ligne} ${mot}` : mot
    if (tient(essai)) {
      ligne = essai
      continue
    }
    if (ligne) toutes.push(ligne)
    // Un mot plus long qu'une ligne : il se coupe à la lettre près.
    while (!tient(mot) && toutes.length <= lignes) {
      const lettres = [...mot]
      let n = lettres.length - 1
      while (n > 1 && !tient(lettres.slice(0, n).join(''))) n--
      toutes.push(lettres.slice(0, n).join(''))
      mot = lettres.slice(n).join('')
    }
    ligne = mot
    // Assez pour savoir que le texte déborde : la suite ne se mesure pas.
    if (toutes.length > lignes) break
  }
  if (ligne) toutes.push(ligne)
  if (toutes.length <= lignes) return toutes
  // La dernière ligne gardée s'arrête sur une ellipse, au mot près quand on peut.
  const sortie = toutes.slice(0, lignes)
  let fin = sortie[lignes - 1]!
  while (fin && !tient(`${fin}…`)) fin = fin.includes(' ') ? fin.slice(0, fin.lastIndexOf(' ')) : [...fin].slice(0, -1).join('')
  sortie[lignes - 1] = `${fin.replace(/[\s,;:.–—-]+$/u, '')}…`
  return sortie
}
