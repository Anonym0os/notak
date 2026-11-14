/**
 * Le menu du clic droit du système (celui de WebKit dans l'app : « Rechercher », « Traduire », « Copier »… ; celui de
 * Chrome) ne paraît que dans ce qu'on écrit : un champ, une note, une page, où il sert à l'orthographe et au
 * presse-papiers, et sur un texte qu'on a soi-même choisi pour le copier. Partout ailleurs (la bibliothèque, les
 * en-têtes, les barres, les panneaux, les dialogues, la toile), Notak est une application : un clic droit y ouvre son
 * propre menu quand il en a un, et rien sinon, comme dans le Finder ou dans Notion.
 *
 * L'écoute se fait à la capture, sur la fenêtre : un menu de Notak n'a pas à y penser, et une surcouche qui garde ses
 * événements pour elle (la page, la carte, le dessin ouverts en grand) est couverte aussi. Elle n'arrête rien : le
 * menu de Notak s'ouvre comme avant, seul.
 *
 * Ce fichier est chargé au premier script (`main.tsx`) : il ne tire rien, ni la toile ni les textes.
 */

/** Les champs `input` où l'on écrit du texte ; une case, un bouton ou un curseur n'ont rien à corriger ni à coller. */
const CHAMPS_TEXTE = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])

/** Un texte qu'on écrit : un champ de texte, ou ce qui se modifie en place (une note, une page). */
export function ecritIci(cible: EventTarget | null): boolean {
  const el = cible instanceof Element ? cible : cible instanceof Node ? cible.parentElement : null
  if (!el) return false
  const champ = el.closest('input, textarea')
  if (champ instanceof HTMLTextAreaElement) return true
  if (champ instanceof HTMLInputElement) return CHAMPS_TEXTE.has(champ.type)
  // `isContentEditable` dit l'héritage tel que le navigateur le lit (un bloc figé dans une page n'en est pas).
  if (el instanceof HTMLElement && typeof el.isContentEditable === 'boolean') return el.isContentEditable
  const zone = el.closest('[contenteditable]')?.getAttribute('contenteditable')
  return zone === '' || zone === 'true' || zone === 'plaintext-only'
}

/** Un texte choisi dans la page, qui couvre ce point. */
function choisiSous(fenetre: Window, x: number, y: number): boolean {
  const s = fenetre.getSelection()
  if (!s || s.isCollapsed || s.rangeCount === 0) return false
  for (let i = 0; i < s.rangeCount; i++) {
    for (const r of s.getRangeAt(i).getClientRects?.() ?? []) if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true
  }
  return false
}

const rienDeChoisi = (fenetre: Window) => {
  const s = fenetre.getSelection()
  return !s || s.isCollapsed || s.rangeCount === 0
}

/**
 * Branche la règle sur la fenêtre. `inspecter` : ⇧ et le clic droit gardent le menu du système, pour « Inspecter
 * l'élément » pendant qu'on développe. Rend de quoi la débrancher (les essais).
 */
export function brancherMenuNatif(fenetre: Window = window, { inspecter = import.meta.env.DEV }: { inspecter?: boolean } = {}): () => void {
  /**
   * Ce qui était choisi à l'appui du clic droit : WebKit et Chrome, sur un Mac, choisissent ensuite le mot sous le
   * pointeur avant d'ouvrir leur menu. Un texte choisi après coup n'est pas un texte qu'on voulait copier.
   */
  let auClic: { voulu: boolean; vide: boolean } | null = null
  const appui = (e: MouseEvent) => {
    // Ctrl et un clic, sur un Mac, valent un clic droit.
    if (e.button !== 2 && !(e.button === 0 && e.ctrlKey)) return
    auClic = { voulu: choisiSous(fenetre, e.clientX, e.clientY), vide: rienDeChoisi(fenetre) }
  }
  const menu = (e: MouseEvent) => {
    const avant = auClic
    auClic = null
    if (e.defaultPrevented || ecritIci(e.target) || (inspecter && e.shiftKey)) return
    // Au clavier (la touche Menu, ⇧F10), pas d'appui : ce qui est choisi l'a été exprès.
    if (avant ? avant.voulu : !rienDeChoisi(fenetre)) return
    e.preventDefault()
    // Le mot que le clic droit vient de choisir n'a plus de menu pour s'en servir : il ne reste pas surligné.
    if (avant?.vide) fenetre.getSelection()?.removeAllRanges()
  }
  fenetre.addEventListener('mousedown', appui, true)
  fenetre.addEventListener('contextmenu', menu, true)
  return () => {
    fenetre.removeEventListener('mousedown', appui, true)
    fenetre.removeEventListener('contextmenu', menu, true)
  }
}
