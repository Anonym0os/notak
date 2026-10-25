// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Apercu, NoeudTexte } from '../coeur/tableau'
import type { ChercheurApercu } from '../elements/types'
import { attributsDepuisApercu, hoteDe, insererSignet, normaliserAdresse, placeDuSignet, proposerCollerComme } from './apercu'
import { CATALOGUE, chercher } from './catalogue'
import { coller, type Presse } from './collage'
import { CLE_APERCU, choisirApercu, fermerApercu, ouvrirApercu, rangSuivant, suivreCollerComme } from './collerComme'
import { poserIds } from './ids'
import { choisirDansSlash } from './menuInsertion'
import { ApercuLien } from './noeuds'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })
const p = (text: string, attrs: Record<string, unknown> = {}) => b('paragraph', text, attrs)

/** Un éditeur, le curseur à la fin du bloc `i` ; `extensions` remplace celles du moteur. */
function ouvrir(blocs: NoeudTexte[], i = 0, extensions: Editor['extensionManager']['extensions'] = EXTENSIONS_BLOCS): Editor {
  editeur = new Editor({ extensions, content: { type: 'doc', content: blocs } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  let pos = 0
  for (let k = 0; k < i; k++) pos += editeur.state.doc.child(k).nodeSize
  editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.create(editeur.state.doc, pos + 1 + editeur.state.doc.child(i).content.size)))
  return editeur
}

const presse = (texte: string): Presse => ({ texte, html: '', notak: '', vscode: '' })
const URL1 = 'https://notak.fr/docs'
const etat = (ed: Editor) => CLE_APERCU.getState(ed.state) ?? null
const types = (ed: Editor) => ((ed.getJSON() as NoeudTexte).content ?? []).map((n) => n.type)
const touche = (ed: Editor, key: string) => ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

describe('NOTION.md § 10.3 : l’adresse saisie dans le champ', () => {
  it('complète le schéma, refuse ce qui n’est pas une adresse web', () => {
    expect(normaliserAdresse('notak.fr/docs')).toBe('https://notak.fr/docs')
    expect(normaliserAdresse('  https://notak.fr  ')).toBe('https://notak.fr')
    expect(normaliserAdresse('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normaliserAdresse('bonjour')).toBeNull()
    expect(normaliserAdresse('deux mots.fr')).toBeNull()
    expect(normaliserAdresse('javascript://x.y/%0Aalert(1)')).toBeNull()
    expect(normaliserAdresse('ftp://notak.fr')).toBeNull()
    expect(normaliserAdresse('')).toBeNull()
  })

  it('le nom du site se lit sans « www. »', () => {
    expect(hoteDe('https://www.notak.fr/a?b=1')).toBe('notak.fr')
    expect(hoteDe('pas une adresse')).toBe('pas une adresse')
  })
})

describe('NOTION.md § 10.3 : quand le menu « coller comme » s’ouvre, et où va la carte', () => {
  const cadre = { curseur: true, brut: false, type: 'paragraph', dansLaPage: true }
  it('à un curseur, hors ⌘⇧V, hors titre et code, dans la page', () => {
    expect(proposerCollerComme(cadre)).toBe(true)
    expect(proposerCollerComme({ ...cadre, type: 'puce' })).toBe(true)
    expect(proposerCollerComme({ ...cadre, curseur: false })).toBe(false)
    expect(proposerCollerComme({ ...cadre, brut: true })).toBe(false)
    expect(proposerCollerComme({ ...cadre, type: 'heading' })).toBe(false)
    expect(proposerCollerComme({ ...cadre, type: 'codeBlock' })).toBe(false)
    expect(proposerCollerComme({ ...cadre, dansLaPage: false })).toBe(false)
  })

  it('la carte prend la place du bloc s’il ne reste rien, sinon elle vient dessous', () => {
    expect(placeDuSignet('')).toBe('remplacer')
    expect(placeDuSignet('  ')).toBe('remplacer')
    expect(placeDuSignet('Voir ')).toBe('dessous')
  })

  it('le menu suit le lien quand le texte bouge avant lui, et se ferme dès que le curseur le quitte ou que le lien change', () => {
    const lien = { genre: 'coller' as const, de: 5, a: 15 }
    const decale = (n: number) => (pos: number) => pos + n
    expect(suivreCollerComme(lien, decale(3), { vide: true, pos: 18 })).toEqual({ genre: 'coller', de: 8, a: 18 })
    expect(suivreCollerComme(lien, decale(0), { vide: true, pos: 14 })).toBeNull()
    expect(suivreCollerComme(lien, decale(0), { vide: false, pos: 15 })).toBeNull()
    expect(suivreCollerComme(lien, (pos, sens) => (pos === 15 ? pos + sens * 2 : pos), { vide: true, pos: 13 })).toBeNull()
    expect(rangSuivant(0, 1)).toBe(1)
    expect(rangSuivant(1, 1)).toBe(0)
    expect(rangSuivant(0, -1)).toBe(1)
  })
})

describe('NOTION.md § 10.3 : ce que la page dit d’elle devient les attributs de la carte', () => {
  it('le titre, à défaut le site, à défaut le nom du site ; l’image et la favicon doivent être du web', () => {
    const a: Apercu = { titre: ' Notak ', description: ' Un éditeur ', image: 'https://notak.fr/i.png', favicon: 'javascript:alert(1)', site: 'Notak.fr' }
    expect(attributsDepuisApercu(URL1, a)).toEqual({ titre: 'Notak', description: 'Un éditeur', image: 'https://notak.fr/i.png', favicon: null })
    expect(attributsDepuisApercu(URL1, { site: 'Le site' }).titre).toBe('Le site')
    expect(attributsDepuisApercu('https://www.notak.fr/x', {}).titre).toBe('notak.fr')
  })
})

describe('NOTION.md § 2.2 : l’entrée « Aperçu de lien web » du menu « / »', () => {
  it('se trouve par ses mots-clés français et anglais', () => {
    for (const mot of ['miniature', 'aperçu', 'bookmark', 'web link']) expect(chercher(CATALOGUE, mot).map((e) => e.id)).toContain('apercuLien')
  })

  it('choisie, elle retire le « / » et ouvre le champ, sans poser de carte tant que l’adresse manque', () => {
    const ed = ouvrir([p('/apercu')])
    const entree = CATALOGUE.find((e) => e.id === 'apercuLien')!
    let ouvert = 0
    expect(choisirDansSlash(ed, entree, { de: 1, a: 8 }, undefined, () => void ouvert++)).toBe(true)
    expect(ouvert).toBe(1)
    expect(ed.state.doc.textContent).toBe('')
    expect(types(ed)).toEqual(['paragraph'])
  })

  it('l’adresse validée pose la carte à la place du bloc vide, avec un paragraphe dessous pour continuer', () => {
    const ed = ouvrir([p('avant'), p('')], 1)
    expect(insererSignet(ed, URL1)).toBe(true)
    expect(types(ed)).toEqual(['paragraph', 'apercuLien', 'paragraph'])
    expect(ed.state.doc.child(1).attrs.url).toBe(URL1)
    expect(ed.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(ed.state.selection.$from.parentOffset).toBe(0)
    expect(ed.state.selection.from).toBe(ed.state.doc.child(0).nodeSize + ed.state.doc.child(1).nodeSize + 1)
  })

  it('sur un bloc qui a du texte, la carte vient dessous, après ses enfants, au même retrait', () => {
    const ed = ouvrir([b('puce', 'parent'), b('puce', 'enfant', { retrait: 1 }), p('suite')], 0)
    insererSignet(ed, URL1)
    expect(types(ed)).toEqual(['puce', 'puce', 'apercuLien', 'paragraph'])
    expect(ed.state.doc.child(2).attrs.retrait).toBe(0)
  })

  it('un seul ⌘Z défait le choix du menu et la carte', () => {
    const ed = ouvrir([p('/apercu')])
    const entree = CATALOGUE.find((e) => e.id === 'apercuLien')!
    choisirDansSlash(ed, entree, { de: 1, a: 8 }, undefined, () => {})
    insererSignet(ed, URL1)
    expect(types(ed)).toEqual(['apercuLien', 'paragraph'])
    ed.commands.undo()
    expect(types(ed)).toEqual(['paragraph'])
  })
})

describe('NOTION.md § 10.3 : coller une adresse ouvre « coller comme »', () => {
  it('à un curseur, le lien est collé comme avant et le menu s’ouvre à la fin du lien, sur « Lien »', () => {
    const ed = ouvrir([p('Voir ')])
    expect(coller(ed.view, presse(URL1), false)).toBe(true)
    expect(ed.state.doc.textContent).toBe(`Voir ${URL1}`)
    expect(ed.getJSON().content?.[0]?.content?.[1]).toMatchObject({ text: URL1, marks: [{ type: 'link', attrs: { href: URL1 } }] })
    const e = etat(ed)
    expect(e).toMatchObject({ genre: 'coller', url: URL1, texte: URL1, rang: 0 })
    expect(e && e.genre === 'coller' && e.a - e.de).toBe(URL1.length)
    expect(e && e.genre === 'coller' && e.a).toBe(ed.state.selection.from)
  })

  it('pas de menu sur une sélection, dans un titre ni dans le code ; ⌘⇧V ne colle même pas de lien', () => {
    const ed = ouvrir([p('un passage')])
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 4)))
    coller(ed.view, presse(URL1), false)
    expect(etat(ed)).toBeNull()
    expect(ed.getJSON().content?.[0]?.content?.[0]).toMatchObject({ text: 'un ', marks: [{ type: 'link' }] })
    ed.destroy()
    const titre = ouvrir([b('heading', 'Titre', { level: 2 })])
    coller(titre.view, presse(URL1), false)
    expect(etat(titre)).toBeNull()
    titre.destroy()
    const code = ouvrir([b('codeBlock', 'x')])
    coller(code.view, presse(URL1), false)
    expect(etat(code)).toBeNull()
    code.destroy()
    const brut = ouvrir([p('')])
    expect(coller(brut.view, presse(URL1), true)).toBe(false)
    expect(etat(brut)).toBeNull()
  })

  it('« Aperçu » sur un paragraphe qui ne contenait que l’adresse : la carte prend sa place', () => {
    const ed = ouvrir([p('avant'), p('')], 1)
    coller(ed.view, presse(URL1), false)
    expect(choisirApercu(ed.view)).toBe(true)
    expect(types(ed)).toEqual(['paragraph', 'apercuLien', 'paragraph'])
    expect(ed.state.doc.child(1).attrs.url).toBe(URL1)
    expect(etat(ed)).toBeNull()
    expect(ed.state.doc.textContent).toBe('avant')
  })

  it('« Aperçu » sur un paragraphe qui avait du texte : le lien s’en va, la carte vient dessous, le curseur reste', () => {
    const ed = ouvrir([p('Voir '), p('suite')])
    coller(ed.view, presse(URL1), false)
    choisirApercu(ed.view)
    expect(types(ed)).toEqual(['paragraph', 'apercuLien', 'paragraph'])
    expect(ed.state.doc.child(0).textContent).toBe('Voir ')
    expect(ed.state.selection.from).toBe(6)
  })

  it('une seule annulation rend le lien collé ; la suivante retire le collage', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse(URL1), false)
    choisirApercu(ed.view)
    expect(types(ed)).toEqual(['apercuLien', 'paragraph'])
    ed.commands.undo()
    expect(types(ed)).toEqual(['paragraph'])
    expect(ed.getJSON().content?.[0]?.content?.[0]).toMatchObject({ text: URL1, marks: [{ type: 'link' }] })
    ed.commands.undo()
    expect(ed.state.doc.textContent).toBe('')
  })

  it('le texte a bougé sous le menu : rien n’est retiré au hasard', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse(URL1), false)
    const e = etat(ed)
    if (e?.genre !== 'coller') throw new Error('menu fermé')
    // Un autre auteur remplace le lien sans que le menu en sache rien.
    ed.view.dispatch(ed.state.tr.setMeta(CLE_APERCU, { ...e, texte: 'autre chose' }))
    expect(choisirApercu(ed.view)).toBe(false)
    expect(etat(ed)).toBeNull()
    expect(types(ed)).toEqual(['paragraph'])
  })
})

describe('NOTION.md § 10.3 : le clavier du menu « coller comme »', () => {
  const coller1 = (ed: Editor) => coller(ed.view, presse(URL1), false)

  it('Entrée sur « Aperçu » (le défaut) pose la carte ; ↓ et ↑ bouclent', () => {
    const ed = ouvrir([p('')])
    coller1(ed)
    touche(ed, 'ArrowDown')
    expect(etat(ed)).toMatchObject({ rang: 1 })
    touche(ed, 'ArrowDown')
    expect(etat(ed)).toMatchObject({ rang: 0 })
    touche(ed, 'ArrowUp')
    expect(etat(ed)).toMatchObject({ rang: 1 })
    touche(ed, 'ArrowUp')
    touche(ed, 'Enter')
    expect(types(ed)).toEqual(['apercuLien', 'paragraph'])
  })

  it('Entrée sur « URL » et Échap gardent le lien et ferment le menu', () => {
    const ed = ouvrir([p('')])
    coller1(ed)
    touche(ed, 'ArrowDown')
    touche(ed, 'Enter')
    expect(etat(ed)).toBeNull()
    expect(types(ed)).toEqual(['paragraph'])
    expect(ed.state.doc.textContent).toBe(URL1)
    ed.destroy()
    const autre = ouvrir([p('')])
    coller1(autre)
    touche(autre, 'Escape')
    expect(etat(autre)).toBeNull()
    expect(autre.state.doc.textContent).toBe(URL1)
  })

  it('taper autre chose, ou déplacer le curseur, ferme le menu en gardant le lien', () => {
    const ed = ouvrir([p('')])
    coller1(ed)
    touche(ed, 'a')
    expect(etat(ed)).toBeNull()
    ed.destroy()
    const autre = ouvrir([p('')])
    coller1(autre)
    autre.view.dispatch(autre.state.tr.setSelection(TextSelection.create(autre.state.doc, 1)))
    expect(etat(autre)).toBeNull()
    expect(autre.state.doc.textContent).toBe(URL1)
  })

  it('une touche de modification seule ne ferme rien', () => {
    const ed = ouvrir([p('')])
    coller1(ed)
    touche(ed, 'Shift')
    expect(etat(ed)).not.toBeNull()
    fermerApercu(ed.view)
    expect(etat(ed)).toBeNull()
    ouvrirApercu(ed.view, { genre: 'champ' })
    expect(etat(ed)).toEqual({ genre: 'champ' })
  })
})

describe('NOTION.md § 10.3 : la carte lit l’aperçu de sa page', () => {
  const avecChercheur = (chercher: ChercheurApercu | null) => EXTENSIONS_BLOCS.map((x) => (x.name === 'apercuLien' ? ApercuLien.configure({ chercher }) : x))
  const carte = (attrs: Record<string, unknown> = {}): NoeudTexte => ({ type: 'apercuLien', attrs: { url: URL1, ...attrs } })
  const attendre = () => new Promise((r) => setTimeout(r, 0))
  const titre = (ed: Editor) => ed.view.dom.querySelector('.notak-apercu-lien-titre')?.textContent

  it('pendant l’attente, l’adresse seule, discrète ; puis titre, description, image et favicon s’écrivent dans le nœud', async () => {
    let rendre: (a: Apercu) => void = () => {}
    const appels: string[] = []
    const ed = ouvrir([carte(), p('')], 1, avecChercheur((url) => (appels.push(url), new Promise<Apercu>((r) => (rendre = r)))))
    expect(appels).toEqual([URL1])
    expect(ed.view.dom.querySelector('.notak-apercu-lien')?.getAttribute('data-etat')).toBe('attente')
    expect(titre(ed)).toBe(URL1)
    rendre({ titre: 'Notak', description: 'Un éditeur de tableaux', image: 'https://notak.fr/i.png', favicon: 'https://notak.fr/f.ico' })
    await attendre()
    expect(ed.state.doc.child(0).attrs).toMatchObject({ url: URL1, titre: 'Notak', description: 'Un éditeur de tableaux', image: 'https://notak.fr/i.png', favicon: 'https://notak.fr/f.ico' })
    expect(titre(ed)).toBe('Notak')
    expect(ed.view.dom.querySelector('.notak-apercu-lien')?.getAttribute('data-etat')).toBe('pret')
    expect(ed.view.dom.querySelector('.notak-apercu-lien-description')?.textContent).toBe('Un éditeur de tableaux')
    expect(ed.view.dom.querySelector('img.notak-apercu-lien-image')?.getAttribute('src')).toBe('https://notak.fr/i.png')
    expect(ed.view.dom.querySelector('img.notak-apercu-lien-icone')?.getAttribute('src')).toBe('https://notak.fr/f.ico')
    expect(ed.view.dom.querySelector('.notak-apercu-lien-adresse')?.textContent).toBe(URL1)
    // Une fois : la mise à jour du nœud ne redemande rien.
    expect(appels).toHaveLength(1)
  })

  it('l’écriture est hors de l’historique : ⌘Z ne retire pas le titre', async () => {
    const ed = ouvrir([p('un'), carte(), p('')], 2, avecChercheur(async () => ({ titre: 'Notak' })))
    await attendre()
    expect(ed.state.doc.child(1).attrs.titre).toBe('Notak')
    ed.commands.undo()
    expect(ed.state.doc.child(1).attrs.titre).toBe('Notak')
  })

  it('un échec garde l’adresse pour titre et n’écrit rien', async () => {
    const ed = ouvrir([carte(), p('')], 1, avecChercheur(() => Promise.reject(new Error('injoignable'))))
    await attendre()
    expect(ed.state.doc.child(0).attrs.titre).toBe('')
    expect(titre(ed)).toBe(URL1)
    expect(ed.view.dom.querySelector('.notak-apercu-lien')?.getAttribute('data-etat')).toBe('vide')
  })

  it('une carte qui a déjà son titre ne cherche rien ; sans chercheur, l’adresse fait le titre', () => {
    const appels: string[] = []
    ouvrir([carte({ titre: 'Déjà là' }), p('')], 1, avecChercheur(async (url) => (appels.push(url), {})))
    expect(appels).toEqual([])
    expect(titre(editeur!)).toBe('Déjà là')
    editeur!.destroy()
    ouvrir([carte(), p('')], 1, avecChercheur(null))
    expect(titre(editeur!)).toBe(URL1)
  })

  it('une réponse qui arrive après un changement d’adresse ne s’écrit pas', async () => {
    const rendre = new Map<string, (a: Apercu) => void>()
    const ed = ouvrir([carte(), p('')], 1, avecChercheur((url) => new Promise<Apercu>((r) => rendre.set(url, r))))
    ed.view.dispatch(ed.state.tr.setNodeAttribute(0, 'url', 'https://autre.fr'))
    rendre.get(URL1)?.({ titre: 'Ancienne page' })
    await attendre()
    expect(ed.state.doc.child(0).attrs.titre).toBe('')
    rendre.get('https://autre.fr')?.({ titre: 'Autre page' })
    await attendre()
    expect(ed.state.doc.child(0).attrs.titre).toBe('Autre page')
  })

  it('un clic ouvre l’adresse dans un autre onglet, sauf avec Maj ou quand des blocs sont choisis', () => {
    const ed = ouvrir([carte({ titre: 'Notak' }), p('')], 1, avecChercheur(null))
    const ouverts: unknown[][] = []
    const vrai = window.open
    window.open = (...args: unknown[]) => (ouverts.push(args), null)
    try {
      const a = ed.view.dom.querySelector('a.notak-apercu-lien')!
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      expect(ouverts).toEqual([[URL1, '_blank', 'noopener,noreferrer']])
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }))
      expect(ouverts).toHaveLength(1)
    } finally {
      window.open = vrai
    }
  })

  it('le rendu figé (lecture, export HTML) porte les mêmes classes, et n’emporte que des adresses web', () => {
    const ed = ouvrir([carte({ titre: 'Notak', description: 'Un éditeur', image: 'https://notak.fr/i.png', favicon: 'javascript:alert(1)' }), p('')], 1)
    const html = ed.getHTML()
    expect(html).toContain('class="notak-apercu-lien"')
    expect(html).toContain('notak-apercu-lien-titre">Notak')
    expect(html).toContain('class="notak-apercu-lien-image" src="https://notak.fr/i.png"')
    expect(html).not.toContain('javascript:')
  })
})
