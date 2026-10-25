import type { ErreurNotee } from './journal'

/**
 * Le contexte d'un signalement, relevé seul au moment du raccourci, puis écrit en Markdown sous les mots de la
 * personne (`signalement.md` côté serveur).
 */

export interface ElementDecrit {
  id: string
  type: string
  extrait: string
}

export interface Contexte {
  adresse: string
  titrePage: string
  tableau: string | null
  choisis: ElementDecrit[]
  enEdition: ElementDecrit | null
  focus: string
  version: string
  navigateur: string
  bureau: boolean
  fenetre: { largeur: number; hauteur: number; densite: number }
  ecran: { largeur: number; hauteur: number }
  theme: string
  erreurs: ErreurNotee[]
}

/** `⌥⌘S` (Ctrl+Alt+S hors Mac), lu sur `code` : Option change `key` sur Mac. ⇧⌘S est déjà le barré du texte. */
export function estLeRaccourci(e: Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, surMac: boolean): boolean {
  const commande = surMac ? e.metaKey : e.ctrlKey
  return commande && e.altKey && !e.shiftKey && e.code === 'KeyS'
}

const decrire = (el: ElementDecrit) => `\`${el.type}\` ${el.id}${el.extrait ? ` « ${el.extrait} »` : ''}`
const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour12: false })

export function contexteEnMarkdown(c: Contexte): string {
  const lignes = [
    `- Adresse : ${c.adresse}`,
    `- Page : ${c.titrePage || '(sans titre)'}`,
    `- Tableau ouvert : ${c.tableau ?? '(aucun)'}`,
    `- Sélection : ${c.choisis.length === 0 ? '(rien)' : c.choisis.map(decrire).join(' ; ')}`,
    ...(c.enEdition ? [`- En cours d'édition : ${decrire(c.enEdition)}`] : []),
    `- Focus : ${c.focus}`,
    `- Version : ${c.version}`,
    `- Navigateur : ${c.bureau ? 'Notak de bureau (Tauri), ' : ''}${c.navigateur}`,
    `- Fenêtre : ${c.fenetre.largeur}×${c.fenetre.hauteur} (densité ${c.fenetre.densite}), écran ${c.ecran.largeur}×${c.ecran.hauteur}`,
    `- Thème : ${c.theme}`,
    '',
    '## Erreurs récentes de la console',
    '',
    ...(c.erreurs.length === 0 ? ['(aucune)'] : ['```', ...c.erreurs.map((e) => `[${heure(e.quand)}] ${e.texte}`), '```']),
  ]
  return lignes.join('\n')
}

function decrireElement(n: Element): ElementDecrit {
  const extrait = ((n as HTMLElement).innerText ?? n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  return { id: n.getAttribute('data-id') ?? '?', type: n.getAttribute('data-type') ?? n.tagName.toLowerCase(), extrait }
}

/** Ce qui a le focus, en une ligne : la balise, sa classe, son libellé. */
function decrireFocus(n: Element | null): string {
  if (!n || n === document.body) return '(la page)'
  const classe = typeof n.className === 'string' && n.className ? `.${n.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''
  const libelle = n.getAttribute('aria-label') ?? n.getAttribute('placeholder') ?? n.getAttribute('title')
  return `${n.tagName.toLowerCase()}${classe}${libelle ? ` « ${libelle} »` : ''}${n.closest('[contenteditable="true"]') ? ' (texte en édition)' : ''}`
}

export function releverContexte(version: string, erreurs: ErreurNotee[]): Contexte {
  const chemin = location.pathname.match(/^\/t\/([^/]+)/)
  const titre = document.querySelector('.notak-espace .notak-titre')?.getAttribute('data-valeur')
  const espace = document.querySelector('.notak-espace')
  return {
    adresse: location.href,
    titrePage: document.title,
    tableau: chemin ? `${decodeURIComponent(chemin[1]!)}${titre ? ` « ${titre} »` : ''}` : null,
    choisis: [...document.querySelectorAll('.notak-carte[data-choisie]')].slice(0, 10).map(decrireElement),
    enEdition: ((n) => (n ? decrireElement(n) : null))(document.querySelector('.notak-carte[data-edition]')),
    focus: decrireFocus(document.activeElement),
    version,
    navigateur: navigator.userAgent,
    bureau: document.documentElement.hasAttribute('data-bureau'),
    fenetre: { largeur: window.innerWidth, hauteur: window.innerHeight, densite: window.devicePixelRatio },
    ecran: { largeur: screen.width, hauteur: screen.height },
    theme: espace?.getAttribute('data-theme') ?? 'clair',
    erreurs,
  }
}
