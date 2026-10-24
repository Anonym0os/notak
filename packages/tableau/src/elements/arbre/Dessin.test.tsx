import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Arbre, Id, StyleSujet } from '../../coeur/tableau'
import { Dessin } from './Dessin'
import { mesureDeSujet } from './apparence'
import { disposer } from './disposition'
import { ajouterLimite, ajouterRelation, ajouterResume, resumesValides, sujetsDePlage } from './modele/elements'
import { appliquerGeste } from './modele/gestes'
import { appliquerSquelette } from './modele/reglages'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'
import { themeDeArbre } from './themes'
import type { Mesure } from './apparence'

/** Dessine la carte comme la fenêtre : lecture, mesures, disposition, puis le SVG. */
function svg(a: Arbre): string {
  const lecture = lire(a)
  const theme = themeDeArbre(a)
  const mesures = new Map<Id, Mesure>([...lecture.sujets.keys()].map((id) => [id, mesureDeSujet(lecture, id, theme)]))
  const resumes = resumesValides(a, lecture).map(([id, r]) => ({ id, sujet: r.sujet, plage: sujetsDePlage(lecture, r), ...(r.style?.forme ? { forme: r.style.forme } : {}) }))
  const disposition = disposer(lecture, (id) => mesures.get(id) ?? { l: 40, h: 20 }, undefined, false, resumes)
  return renderToStaticMarkup(
    <svg>
      <Dessin arbre={a} lecture={lecture} disposition={disposition} mesures={mesures} />
    </svg>,
  )
}

function base() {
  let a: Arbre = nouvelArbre('Centre')
  const c = lire(a).central
  let p: Id, q: Id, s: Id
  ;[a, p] = ajouterEnfant(a, c, 'Alpha')
  ;[a, q] = ajouterEnfant(a, c, 'Beta')
  ;[a, s] = ajouterEnfant(a, p, 'Sous')
  return { a, c, p, q, s }
}

const stylise = (a: Arbre, id: Id, style: StyleSujet) => appliquerGeste(a, { type: 'style', ids: [id], style }, () => 'x')!.arbre

/** Le `<g>` d'un sujet, pour n'y chercher que ce qui le regarde. */
const sujet = (html: string, id: Id) => html.slice(html.indexOf(`data-sujet="${id}"`)).split('</g>')[0]!

describe('le rendu d’un sujet suit son style', () => {
  it('le remplissage hachuré dessine un motif, la forme son contour', () => {
    const { a, p } = base()
    const html = svg(stylise(a, p, { forme: 'etoile', remplissage: '#ff0000', motifRemplissage: 'diagonales' }))
    expect(html).toContain(`<pattern id="notak-hachure-${p}"`)
    expect(html).toContain(`fill="url(#notak-hachure-${p})"`)
    // L'étoile a dix sommets.
    expect(html).toMatch(/fill="url\(#notak-hachure-[^"]+\)"[^>]*d="M[^"]*(L[^L"]*){9}Z"|d="M[^"]*(L[^L"]*){9}Z"[^>]*fill="url\(#notak-hachure/)
  })

  it('un remplissage à huit chiffres devient une couleur et une opacité', () => {
    const { a, p } = base()
    const html = sujet(svg(stylise(a, p, { forme: 'rectangle', remplissage: '#ff000080' })), p)
    expect(html).toContain('fill="#ff0000"')
    expect(html).toContain('fill-opacity="0.5"')
  })

  it('la bordure suit son motif et son épaisseur ; « aucune » n’en laisse pas', () => {
    const { a, p } = base()
    const html = sujet(svg(stylise(a, p, { forme: 'rectangle', bordure: '#00aa00', motifBordure: 'tirets', epaisseurBordure: 5 })), p)
    expect(html).toContain('stroke="#00aa00"')
    expect(html).toContain('stroke-width="5"')
    expect(html).toContain('stroke-dasharray="7 5"')
    const sans = sujet(svg(stylise(a, p, { forme: 'rectangle', bordure: '#00aa00', motifBordure: 'aucun', epaisseurBordure: 0 })), p)
    expect(sans).toContain('stroke="none"')
  })

  it('le texte suit graisse, italique, barré, souligné, casse et alignement', () => {
    const { a, p } = base()
    const html = sujet(svg(stylise(a, p, { graisse: 300, italique: true, barre: true, souligne: true, casse: 'majuscules', alignement: 'droite', police: 'Georgia, serif' })), p)
    expect(html).toContain('font-weight="300"')
    expect(html).toContain('font-style="italic"')
    expect(html).toContain('text-decoration="line-through underline"')
    expect(html).toContain('font-family="Georgia, serif"')
    expect(html).toContain('text-anchor="end"')
    expect(html).toContain('>ALPHA<')
  })

  it('une bordure à main levée tremble (le filtre), une bordure pleine non', () => {
    const { a, p, q } = base()
    const html = svg(stylise(a, p, { forme: 'rectangle', bordure: '#000000', motifBordure: 'main' }))
    expect(html).toContain('<filter id="notak-arbre-main"')
    expect(sujet(html, p)).toContain('filter="url(#notak-arbre-main)"')
    expect(sujet(html, q)).not.toContain('filter=')
  })

  it('un signe de ponctuation dessine ses traits', () => {
    const { a, p } = base()
    const html = sujet(svg(stylise(a, p, { forme: 'crochets', bordure: '#000000' })), p)
    expect(html).toMatch(/fill="none"[^>]*stroke="#000000"|stroke="#000000"[^>]*fill="none"/)
  })
})

describe('le rendu d’une branche', () => {
  it('suit le motif, l’épaisseur, la couleur et la pointe de son parent', () => {
    const { a, c } = base()
    const html = svg(stylise(a, c, { motif: 'tiret-point', epaisseurBranche: 6, pointeBranche: 'diamant', couleurBranche: '#123456' }))
    const branches = html.slice(html.indexOf('notak-arbre-branches'))
    expect(branches).toContain('stroke-dasharray="7 4 1.5 4"')
    expect(branches).toContain('stroke-width="6"')
    // Une pointe pleine à chaque bout de branche principale.
    expect(branches).toMatch(/<path d="M[^"]+Z" fill="[^"]+" stroke="[^"]+" stroke-width="1"/)
  })

  it('une ligne « aucune » ne se dessine pas', () => {
    const { a, c } = base()
    const html = svg(stylise(a, c, { motif: 'aucun', epaisseurBranche: 0 }))
    const branches = html.slice(html.indexOf('notak-arbre-branches'), html.indexOf('data-sujet'))
    expect(branches).not.toContain('<path')
  })

  it('une branche à main levée tremble', () => {
    const { a, c } = base()
    expect(svg(stylise(a, c, { motif: 'main' }))).toContain('<g filter="url(#notak-arbre-main)"><rect')
  })

  it('la forme « anse » se trace d’une seule courbe cubique', () => {
    const { a, c } = base()
    const html = svg(stylise(a, c, { branche: 'anse' }))
    expect(html.slice(html.indexOf('notak-arbre-branches'))).toMatch(/d="M[\d. -]+C[\d. -]+"/)
  })

  it('la forme organique se trace d’un seul arc quadratique', () => {
    const { a, c } = base()
    const html = svg(stylise(a, c, { branche: 'organique' }))
    expect(html.slice(html.indexOf('notak-arbre-branches'))).toMatch(/d="M[\d. -]+Q[\d. -]+"/)
  })
})

describe('le rendu d’une relation, d’une limite, d’un résumé', () => {
  it('une relation : motif, épaisseur, couleur, pointes et titre', () => {
    const { a, p, q } = base()
    let b: Arbre
    let r: Id | null
    ;[b, r] = ajouterRelation(a, p, q)
    b = appliquerGeste(b, { type: 'styleObjet', ids: [r!], style: { motif: 'points', epaisseur: 4, couleur: '#aa00aa', pointeArrivee: 'carre', pointeDepart: 'point', casse: 'majuscules', taille: 20 } }, () => 'x')!.arbre
    b = appliquerGeste(b, { type: 'titrer', id: r!, titre: 'lie' }, () => 'x')!.arbre
    const html = svg(b)
    const rel = html.slice(html.indexOf('notak-arbre-relation'))
    expect(rel).toContain('stroke="#aa00aa"')
    expect(rel).toContain('stroke-width="4"')
    expect(rel).toContain('stroke-dasharray="1.5 4"')
    expect(rel).toContain('>LIE<')
    expect(rel).toContain('font-size="20"')
    // Deux pointes pleines, une à chaque bout.
    expect(rel.match(/fill="#aa00aa" stroke="#aa00aa" stroke-width="1"/g)).toHaveLength(2)
  })

  it('une relation zigzag se trace en droites', () => {
    const { a, p, q } = base()
    const [b, r] = ajouterRelation(a, p, q)
    const html = svg(appliquerGeste(b, { type: 'styleObjet', ids: [r!], style: { forme: 'zigzag' } }, () => 'x')!.arbre)
    expect(html.slice(html.indexOf('notak-arbre-relation'))).toMatch(/d="M[\d. -]+H[\d. -]+V[\d. -]+H[\d. -]+"/)
  })

  it('une limite : forme, remplissage, contour', () => {
    const { a, p } = base()
    const [b, x] = ajouterLimite(a, [p])
    const html = svg(appliquerGeste(b, { type: 'styleObjet', ids: [x!], style: { forme: 'polygone', remplissage: '#00ff0033', motif: 'points', epaisseur: 3, couleur: '#0000ff' } }, () => 'x')!.arbre)
    const lim = html.slice(html.indexOf('notak-arbre-limite'), html.indexOf('notak-arbre-branches'))
    expect(lim).toContain('fill="#00ff00"')
    expect(lim).toContain('fill-opacity="0.2"')
    expect(lim).toContain('stroke="#0000ff"')
    expect(lim).toContain('stroke-dasharray="1.5 4"')
    // Un polygone : huit sommets.
    expect(lim).toMatch(/d="M[^"]*(L[^L"]*){7}Z"/)
  })

  it('un résumé : la forme de son accolade, son épaisseur et sa couleur', () => {
    const { a, p, q } = base()
    const [b] = ajouterResume(a, [p, q], 'R')
    const rid = Object.keys(b.resumes!)[0]!
    const html = svg(appliquerGeste(b, { type: 'styleObjet', ids: [rid], style: { forme: 'carre', epaisseur: 5, couleur: '#ff00ff', motif: 'tirets' } }, () => 'x')!.arbre)
    const trait = html.slice(html.indexOf('notak-arbre-branches'), html.indexOf('data-sujet'))
    expect(trait).toContain('stroke="#ff00ff"')
    expect(trait).toContain('stroke-width="5"')
    expect(trait).toContain('stroke-dasharray="7 5"')
    expect(trait).toMatch(/d="M[\d. -]+H[\d. -]+V[\d. -]+H[\d. -]+M[\d. -]+H[\d. -]+"/)
  })
})

describe('le rendu d’une carte à squelette', () => {
  /** Le dernier chemin d'une branche, par ordre d'apparition : les `d` des `<path>` du groupe des branches. */
  const branches = (html: string) => {
    const g = html.slice(html.indexOf('notak-arbre-branches'), html.indexOf('data-sujet'))
    return [...g.matchAll(/<path d="([^"]+)"([^>]*)>/g)].map((m) => ({ d: m[1]!, attrs: m[2]! }))
  }

  it('le squelette par défaut : une courbe organique sort du central, des coudes arrondis ensuite', () => {
    const { a } = base()
    const b = branches(svg(appliquerSquelette(a, 'carte-1')))
    // Le central a deux principaux : deux arcs quadratiques ; le sous-sujet d'Alpha un coude arrondi.
    expect(b.filter((x) => /^M[\d. -]+Q[\d. -]+$/.test(x.d))).toHaveLength(2)
    expect(b.filter((x) => x.d.includes('H') || x.d.includes('Q'))).toHaveLength(3)
  })

  it('sans squelette, la carte garde son rendu : le coude du thème classique, pas d’arc organique', () => {
    const { a } = base()
    const b = branches(svg(a))
    expect(b.every((x) => !/^M[\d. -]+Q[\d. -]+$/.test(x.d))).toBe(true)
  })

  it('un squelette effilé : les branches du central sont des surfaces pleines, les suivantes des traits', () => {
    const { a } = base()
    const b = branches(svg(appliquerSquelette(a, 'carte-2')))
    const pleines = b.filter((x) => x.d.endsWith('Z'))
    expect(pleines).toHaveLength(2)
    expect(pleines.every((x) => x.attrs.includes('stroke="none"'))).toBe(true)
    expect(b.filter((x) => !x.d.endsWith('Z'))).toHaveLength(1)
  })

  it('un squelette dessiné à la main fait trembler ses branches', () => {
    const { a } = base()
    expect(svg(appliquerSquelette(a, 'carte-10'))).toContain('<g filter="url(#notak-arbre-main)">')
  })

  it('le style d’un sujet passe avant celui du squelette : sa branche garde la forme choisie', () => {
    const { a, c } = base()
    const b = branches(svg(stylise(appliquerSquelette(a, 'carte-1'), c, { branche: 'droite' })))
    expect(b.filter((x) => /^M[\d. -]+L[\d. -]+$/.test(x.d)).length).toBeGreaterThanOrEqual(2)
  })

  it('la forme du sujet vient du squelette : des soulignés, ici', () => {
    const { a, p } = base()
    const html = svg(appliquerSquelette(a, 'carte-5'))
    // Un souligné se dessine par une ligne, pas par un contour.
    expect(sujet(html, p)).toContain('<line')
  })
})
