/**
 * Une liste HTML collée (Google Docs, une page web, un autre éditeur) changée en tâches : chaque ligne et
 * chaque puce devient une tâche, les listes imbriquées deviennent des sous-tâches, la mise en forme s'en va.
 * Lit le DOM, sans toucher à la page : le HTML est analysé dans un document à part.
 */
import type { NoeudTexte } from '../../coeur/tableau'
import { PROFONDEUR_MAX } from './liste'

const LISTES = new Set(['UL', 'OL'])
const IGNORES = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'TEMPLATE', 'NOSCRIPT'])
/** Ce qui fait une ligne à soi. */
const BLOCS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TR',
  'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'DL', 'DT', 'DD',
])

const estElement = (n: Node): n is Element => n.nodeType === 1
const estTexte = (n: Node): n is Text => n.nodeType === 3

const nettoyer = (texte: string) => texte.replace(/[\s ]+/g, ' ').trim()

const tache = (texte: string, fait: boolean, sous: NoeudTexte[]): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: fait },
  content: [
    texte ? { type: 'paragraph', content: [{ type: 'text', text: texte }] } : { type: 'paragraph' },
    ...(sous.length > 0 ? [{ type: 'taskList', content: sous }] : []),
  ],
})

/** Un bloc contient-il d'autres blocs ? Alors on le traverse au lieu d'en faire une ligne. */
const contientDesBlocs = (e: Element) => [...e.querySelectorAll('*')].some((x) => BLOCS.has(x.tagName))

/** Une puce : son texte propre, ses sous-listes en sous-tâches. */
function puce(li: Element): NoeudTexte {
  let texte = ''
  const sous: NoeudTexte[] = []
  for (const c of li.childNodes) {
    if (estTexte(c)) texte += c.data
    else if (estElement(c) && LISTES.has(c.tagName)) sous.push(...puces(c))
    else if (estElement(c) && !IGNORES.has(c.tagName)) texte += ` ${c.textContent ?? ''} `
  }
  const fait = !!li.querySelector('input[type="checkbox"][checked], input[type="checkbox"]:checked')
  return tache(nettoyer(texte), fait, sous)
}

const puces = (liste: Element) => [...liste.children].filter((c) => c.tagName === 'LI').map(puce)

interface Recolte {
  taches: NoeudTexte[]
  /** Y avait-il une vraie liste dans le HTML ? Une ligne seule n'est une tâche que si elle en vient. */
  deListe: boolean
}

function recolter(parent: Node, sortie: Recolte) {
  let ligne = ''
  const finir = () => {
    const t = nettoyer(ligne)
    if (t) sortie.taches.push(tache(t, false, []))
    ligne = ''
  }
  for (const c of parent.childNodes) {
    if (estTexte(c)) ligne += c.data
    else if (!estElement(c) || IGNORES.has(c.tagName)) continue
    else if (LISTES.has(c.tagName)) {
      finir()
      sortie.deListe = true
      sortie.taches.push(...puces(c))
    } else if (c.tagName === 'LI') {
      finir()
      sortie.deListe = true
      sortie.taches.push(puce(c))
    } else if (c.tagName === 'BR') ligne += ' '
    else if (BLOCS.has(c.tagName)) {
      finir()
      if (contientDesBlocs(c)) recolter(c, sortie)
      else {
        const t = nettoyer(c.textContent ?? '')
        if (t) sortie.taches.push(tache(t, false, []))
      }
    } else if (contientDesBlocs(c)) {
      // Une enveloppe en ligne qui contient des blocs : Google Docs entoure toute sa copie d'un <b>.
      finir()
      recolter(c, sortie)
    } else ligne += c.textContent ?? ''
  }
  finir()
}

/** Au-delà du sixième niveau, les sous-tâches remontent à côté de leur parente. */
function borner(taches: NoeudTexte[], niveau = 1): NoeudTexte[] {
  return taches.flatMap((t) => {
    const [p, sous] = t.content!
    const enfants = sous?.content ?? []
    if (enfants.length === 0) return [t]
    if (niveau >= PROFONDEUR_MAX) return [tache(p!.content?.[0]?.text ?? '', t.attrs?.checked === true, []), ...borner(enfants, niveau)]
    return [{ ...t, content: [p!, { ...sous!, content: borner(enfants, niveau + 1) }] }]
  })
}

/**
 * Les tâches que dit ce HTML, ou `null` s'il n'y a rien à en tirer ou si c'est une seule ligne sans puce :
 * elle se colle alors comme du texte.
 */
export function htmlEnTaches(html: string): NoeudTexte[] | null {
  if (!html.trim()) return null
  const sortie: Recolte = { taches: [], deListe: false }
  recolter(new DOMParser().parseFromString(html, 'text/html').body, sortie)
  if (sortie.taches.length === 0 || (sortie.taches.length === 1 && !sortie.deListe)) return null
  return borner(sortie.taches)
}
