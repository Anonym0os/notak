import type { DOMOutputSpec } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Node, mergeAttributes } from '@tiptap/react'
import { type ContenuExterne, hotesDe } from '../elements/contenuExterne'
import { adresseSure } from '../elements/lien/adresse'
import { Citation } from '../elements/note/noeuds'
import type { ChercheurApercu } from '../elements/types'
import type { Apercu } from '../coeur/tableau'
import { t } from '../langue'
import { attributsDepuisApercu } from './apercu'
import { blocsChoisis } from './selection'

/** Une petite icône de trait, 16 px, à la couleur du bouton : chaque chaîne est un tracé (grille de 16). */
function dessin(...traces: string[]): SVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  for (const [k, v] of Object.entries({ width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
  for (const d of traces) {
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

/** L'icône d'un alignement : le bloc (un carré) posé à gauche, au centre ou à droite d'un trait. */
const dessinAlignement = (cote: 'gauche' | 'centre' | 'droite') => {
  const x = cote === 'gauche' ? 2.5 : cote === 'droite' ? 7.5 : 5
  return dessin(`M${x} 3.5h6v6h-6z`, 'M2.5 12.5h11')
}

/** Les icônes de la barre d'image (dessinées ici, dans l'esprit de celles de Notion, pas reprises). */
const ICONES_IMAGE = {
  commenter: () => dessin('M3 3.5h10v7H7l-3 2.5v-2.5H3z'),
  legende: () => dessin('M3.5 2.5h9v6h-9z', 'M3.5 11h9', 'M3.5 13.5h5.5'),
  agrandir: () => dessin('M7 2.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z', 'M10.3 10.3l3.2 3.2', 'M7 5v4M5 7h4'),
  telecharger: () => dessin('M8 2.5v8', 'M4.5 7l3.5 3.5L11.5 7', 'M3 13.5h10'),
  // Trois points : des traits nuls, épaissis pour se voir.
  plus: () => {
    const svg = dessin('M3.5 8h.01M8 8h.01M12.5 8h.01')
    svg.setAttribute('stroke-width', '2.4')
    return svg
  },
}

/**
 * Les blocs que le moteur ajoute à ceux de la note (docs/NOTION.md § 2). Les noms des nœuds de la note restent : un
 * texte de note se lit tel quel comme un document.
 */

/** La citation, sans la règle `> ` de la note : dans le moteur, `> ` fait un dépliant (NOTION.md § 4). */
export const CitationBloc = Citation.extend({ addInputRules: () => [] })

/**
 * Le dépliant : une ligne de résumé, puis des blocs qui se cachent. `niveau` 1 à 3 en fait un titre dépliant. Qu'il
 * soit ouvert est écrit dans le texte : → Notak, tout le monde le voit ouvert ou fermé (Notion le garde par personne).
 */
export const Deroulant = Node.create({
  name: 'deroulant',
  group: 'block',
  content: 'resumeDeroulant block*',
  defining: true,
  addAttributes() {
    return {
      ouvert: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-ouvert') !== 'non',
        renderHTML: (a: { ouvert?: boolean }) => (a.ouvert === false ? { 'data-ouvert': 'non' } : {}),
      },
      niveau: {
        default: 0,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-niveau') ?? 0) || 0,
        renderHTML: (a: { niveau?: number }) => (a.niveau ? { 'data-niveau': a.niveau } : {}),
      },
    }
  },
  parseHTML: () => [{ tag: 'div[data-type="deroulant"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'deroulant', class: 'notak-deroulant' }), 0],
  addProseMirrorPlugins() {
    const type = this.type
    return [
      new Plugin({
        key: new PluginKey('triangleDeroulant'),
        props: {
          // Le triangle est dessiné dans la marge gauche du résumé : un appui là ouvre ou ferme le dépliant.
          handleDOMEvents: {
            mousedown: (view, e) => {
              const resume = (e.target as HTMLElement).closest?.('.notak-deroulant-resume')
              if (!resume || e.clientX - resume.getBoundingClientRect().left > 0) return false
              const pos = view.posAtDOM(resume, 0) - 2
              const noeud = view.state.doc.nodeAt(pos)
              if (noeud?.type !== type) return false
              e.preventDefault()
              view.dispatch(view.state.tr.setNodeAttribute(pos, 'ouvert', !noeud.attrs.ouvert))
              return true
            },
          },
        },
      }),
    ]
  },
})

/** La ligne de résumé d'un dépliant. */
export const ResumeDeroulant = Node.create({
  name: 'resumeDeroulant',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-type="resume"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'resume', class: 'notak-deroulant-resume' }), 0],
})

/**
 * Une rangée de colonnes (NOTION.md § 8). Le schéma accepte une seule colonne, pour qu'une fusion à plusieurs ne
 * jette jamais de texte : c'est le modèle qui dissout une rangée restée seule.
 */
export const Colonnes = Node.create({
  name: 'colonnes',
  group: 'block',
  content: 'colonne+',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-type="colonnes"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'colonnes', class: 'notak-blocs-rangee' }), 0],
})

/** Une colonne : des blocs, et sa part de la largeur (`ratio`, absente : parts égales). */
export const Colonne = Node.create({
  name: 'colonne',
  content: 'block+',
  isolating: true,
  addAttributes() {
    return {
      ratio: {
        default: null,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-ratio')) || null,
        renderHTML: (a: { ratio?: number | null }) => (a.ratio ? { 'data-ratio': a.ratio, style: `flex-grow: ${a.ratio}` } : {}),
      },
    }
  },
  parseHTML: () => [{ tag: 'div[data-type="colonne"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'colonne', class: 'notak-blocs-colonne' }), 0],
})

/**
 * Une image dans le texte : un fichier du tableau (`fichier`) ou une adresse (`url`), sa part de la largeur de la
 * page (`largeur`, de 0 à 1 ; absente : sa taille naturelle), son alignement et sa légende.
 */
export interface OptionsImage {
  /** L'adresse affichable d'un fichier du tableau (voir `DepotFichiers.adresse`). */
  adresse: ((fichier: string) => Promise<string | null>) | null
  /** Ce que la toile attend avant de charger une image d'un autre site (copie reçue) ; absent, tout se charge. */
  externe: ContenuExterne | null
  /** Qui dessine : l'éditeur (ses vues de nœud, et son presse-papiers, qui garde l'adresse), la lecture, ou un export. */
  rendu: RenduTexte
}

/**
 * Qui dessine le texte. Dans l'éditeur, une image ou un signet qui attend l'accord est une vue de nœud à place ; son
 * rendu fixe (`renderHTML`), lui, sert aussi au presse-papiers et garde l'adresse. La lecture et l'export, eux, ne
 * demandent rien à un autre site tant que l'accord n'est pas donné ; un export n'a pas de bouton à cliquer.
 */
export type RenduTexte = 'editeur' | 'lecture' | 'export'

/** Ce que disent les places du contenu d'un autre site : l'image ou le signet qui attend, et d'où il viendrait. */
type FormeExterne = 'image' | 'signet'

/**
 * La place du contenu d'un autre site qui attend l'accord, dans le rendu fixe (lecture, export) : où il serait, et
 * « Afficher » (la lecture le prend par `data-externe`, voir `Document.tsx`) ; `inerte`, sans bouton.
 */
function placeExterne(forme: FormeExterne, partie: string, hotes: string[], inerte: boolean): DOMOutputSpec {
  const d = hotes.join(', ')
  const bouton = { type: 'button', class: 'notak-externe-bouton', 'data-externe': partie, 'aria-label': t('externe.afficherDe', { hotes: d }) }
  return [
    forme === 'signet' ? 'span' : 'div',
    { class: 'notak-externe', 'data-forme': forme },
    ['span', { class: 'notak-externe-texte' }, t('externe.de', { hote: d })],
    ...(inerte ? [] : [['button', bouton, t('externe.afficher')] as const]),
  ]
}

/** La même place dans l'éditeur, en DOM : `dire` l'écrit (ou la retire, sans hôtes), `afficher` est ce que fait le bouton. */
function lieuExterne(forme: FormeExterne, afficher: () => void) {
  const dom = document.createElement(forme === 'signet' ? 'span' : 'div')
  dom.className = 'notak-externe'
  dom.dataset.forme = forme
  dom.contentEditable = 'false'
  const texte = document.createElement('span')
  texte.className = 'notak-externe-texte'
  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.className = 'notak-externe-bouton'
  // Ni le curseur du texte ni le lien d'une carte ne prennent le clic.
  bouton.addEventListener('mousedown', (e) => e.preventDefault())
  bouton.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    afficher()
  })
  dom.append(texte, bouton)
  return {
    dom,
    dire(hotes: string[]) {
      const d = hotes.join(', ')
      texte.textContent = t('externe.de', { hote: d })
      texte.title = d
      bouton.textContent = t('externe.afficher')
      bouton.setAttribute('aria-label', t('externe.afficherDe', { hotes: d }))
    },
  }
}

export const ImageBloc = Node.create<OptionsImage>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: false,
  addOptions: () => ({ adresse: null, externe: null, rendu: 'editeur' }),
  addAttributes() {
    return {
      fichier: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-fichier') },
      url: { default: null, parseHTML: (el: HTMLElement) => el.querySelector('img')?.getAttribute('src') ?? null },
      largeur: { default: null, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-largeur')) || null },
      alignement: { default: 'centre', parseHTML: (el: HTMLElement) => el.getAttribute('data-alignement') ?? 'centre' },
      legende: { default: '', parseHTML: (el: HTMLElement) => el.querySelector('figcaption')?.textContent ?? '' },
    }
  },
  parseHTML: () => [{ tag: 'figure[data-type="image"]' }],
  renderHTML({ node, HTMLAttributes }) {
    const { externe, rendu } = this.options
    const { fichier, url, largeur, alignement, legende, ...reste } = HTMLAttributes as Record<string, unknown>
    const attrs = mergeAttributes(reste, {
      'data-type': 'image',
      class: 'notak-image-bloc',
      'data-alignement': String(alignement ?? 'centre'),
      ...(fichier ? { 'data-fichier': String(fichier) } : {}),
      ...(largeur ? { 'data-largeur': String(largeur), style: `width: ${Math.round(Number(largeur) * 100)}%` } : {}),
    })
    const texte = String(node.attrs.legende ?? '')
    // Une adresse d'image vient du document, donc de n'importe qui : seulement le web (`adresseSure`), et rien d'un autre site
    // tant que la toile attend l'accord. Les images des fichiers du tableau ont leur adresse plus tard (`remplirImages`).
    const sure = adresseSure(url, 'image')
    const attend = rendu !== 'editeur' && !!sure && !!externe?.attend(`image:${url}`)
    const image: DOMOutputSpec = attend ? placeExterne('image', `image:${url}`, hotesDe([sure]), rendu === 'export') : ['img', { ...(sure ? { src: sure } : {}), alt: texte }]
    return ['figure', attrs, image, ...(legende ? [['figcaption', {}, texte] as const] : [])]
  },
  // Dans l'éditeur, l'image d'un fichier du tableau va chercher son adresse ; hors édition, voir `remplirImages`.
  // Au survol, deux poignées sur ses bords règlent sa largeur (NOTION.md § 2), écrite au lâcher en part de la colonne.
  addNodeView() {
    const { adresse, externe } = this.options
    return ({ node: depart, view, getPos }) => {
      let node = depart
      const figure = document.createElement('figure')
      figure.className = 'notak-image-bloc'
      figure.dataset.type = 'image'
      const img = document.createElement('img')
      img.draggable = false
      // Une image d'un autre site, tant que la toile attend l'accord : sa place dit d'où elle viendrait (`elements/contenuExterne.ts`).
      const attente = lieuExterne('image', () => externe?.permettre(`image:${node.attrs.url}`))
      const legende = document.createElement('figcaption')
      legende.dataset.invite = t('blocs.image.legendeInvite')
      // La légende s'écrit sur place ; elle n'est écrite dans le texte qu'en la quittant.
      let enLegende = false
      let source = ''
      const peindre = () => {
        const a = node.attrs as Record<string, unknown>
        figure.dataset.alignement = String(a.alignement ?? 'centre')
        for (const [cle, v] of [['bloc', a.id], ['couleur', a.couleur], ['retrait', Number(a.retrait) || null], ['filBloc', a.fil]] as const) {
          if (v) figure.dataset[cle] = String(v)
          else delete figure.dataset[cle]
        }
        figure.style.width = a.largeur ? `${Math.round(Number(a.largeur) * 1000) / 10}%` : ''
        img.alt = String(a.legende ?? '')
        const distante = a.url ? adresseSure(a.url, 'image') : undefined
        const attend = !!distante && !!externe?.attend(`image:${a.url}`)
        if (attend) {
          // L'image n'est pas demandée : l'adresse se redemandera dès que l'accord est donné.
          source = ''
          img.removeAttribute('src')
          attente.dire(hotesDe([distante]))
          if (!attente.dom.isConnected) figure.insertBefore(attente.dom, img)
        } else {
          attente.dom.remove()
          const voulue = String(a.url ?? a.fichier ?? '')
          if (voulue !== source) {
            source = voulue
            // Une adresse d'image vient du document, donc de n'importe qui : seulement le web (`adresseSure`).
            if (a.url) img.src = adresseSure(a.url, 'image') ?? ''
            else if (a.fichier && adresse) void adresse(String(a.fichier)).then((u) => u && source === voulue && (img.src = u))
          }
        }
        for (const b of alignements) b.dataset.actif = String(b.dataset.valeur === figure.dataset.alignement)
        boutonAlignement.replaceChildren(dessinAlignement((figure.dataset.alignement as 'gauche' | 'centre' | 'droite') || 'centre'))
        legende.setAttribute('contenteditable', String(view.editable))
        if (enLegende) return
        legende.textContent = String(a.legende ?? '')
        if (a.legende) figure.append(legende)
        else legende.remove()
      }
      const ecrire = (attr: string, v: unknown) => {
        const pos = getPos()
        if (pos !== undefined && node.attrs[attr] !== v) view.dispatch(view.state.tr.setNodeAttribute(pos, attr, v))
      }
      /*
       * La barre au survol, mesurée dans Notion (relevé 4 § 7.7) : en haut à droite, six icônes — commenter, l'alignement
       * (un menu de trois), la légende, voir en grand, télécharger, et « ••• » pour le menu du bloc.
       */
      const bouton = (titre: string, contenu: string | SVGElement, agir: () => void) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.title = titre
        b.setAttribute('aria-label', titre)
        b.append(contenu)
        b.addEventListener('mousedown', (e) => e.preventDefault())
        b.addEventListener('click', agir)
        return b
      }
      // Le document répond aux gestes qui ne sont pas ceux de l'image : commenter le bloc, ouvrir son menu.
      const signaler = (nom: 'notak-commenter-bloc' | 'notak-menu-bloc') => {
        const id = node.attrs.id
        if (id) view.dom.dispatchEvent(new CustomEvent(nom, { bubbles: true, detail: { id } }))
      }
      const menuAlignement = document.createElement('div')
      menuAlignement.className = 'notak-image-alignements'
      const alignements = (['gauche', 'centre', 'droite'] as const).map((v) => {
        const b = bouton(t(`blocs.image.${v}`), dessinAlignement(v), () => {
          ecrire('alignement', v)
          menuAlignement.remove()
        })
        b.dataset.valeur = v
        return b
      })
      alignements.forEach((b, i) => {
        if (i > 0) menuAlignement.append(Object.assign(document.createElement('span'), { className: 'notak-image-alignements-trait' }))
        menuAlignement.append(b)
      })
      const boutonAlignement = bouton(t('blocs.image.alignement'), dessinAlignement('centre'), () => {
        if (menuAlignement.isConnected) return menuAlignement.remove()
        barre.append(menuAlignement)
        menuAlignement.style.left = `${boutonAlignement.offsetLeft + boutonAlignement.offsetWidth / 2}px`
      })
      // « Voir en grand » : l'image seule sur un voile sombre ; un clic ou Échap la referment.
      const agrandir = () => {
        if (!img.src) return
        const voile = document.createElement('div')
        voile.className = 'notak-image-plein-ecran'
        const grande = document.createElement('img')
        grande.src = img.src
        grande.alt = img.alt
        voile.append(grande)
        const fermer = () => {
          voile.remove()
          document.removeEventListener('keydown', touche, true)
        }
        const touche = (e: KeyboardEvent) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          fermer()
        }
        voile.addEventListener('click', fermer)
        document.addEventListener('keydown', touche, true)
        document.body.append(voile)
      }
      const telecharger = () => {
        // L'image d'un fichier de l'espace (`blob:`), ou une image du web ; rien d'autre ne part au clic.
        if (!img.src || !(img.src.startsWith('blob:') || adresseSure(img.src, 'image'))) return
        const a = document.createElement('a')
        a.href = img.src
        a.download = String(node.attrs.legende || 'image')
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.click()
      }
      const ecrireLegende = () => {
        figure.append(legende)
        enLegende = true
        legende.focus()
        const r = document.createRange()
        r.selectNodeContents(legende)
        r.collapse(false)
        getSelection()?.removeAllRanges()
        getSelection()?.addRange(r)
      }
      const barre = document.createElement('div')
      barre.className = 'notak-image-barre'
      barre.contentEditable = 'false'
      barre.append(
        bouton(t('blocs.image.commenter'), ICONES_IMAGE.commenter(), () => signaler('notak-commenter-bloc')),
        boutonAlignement,
        bouton(t('blocs.image.legende'), ICONES_IMAGE.legende(), ecrireLegende),
        bouton(t('blocs.image.agrandir'), ICONES_IMAGE.agrandir(), agrandir),
        bouton(t('blocs.image.telecharger'), ICONES_IMAGE.telecharger(), telecharger),
        bouton(t('blocs.image.plus'), ICONES_IMAGE.plus(), () => signaler('notak-menu-bloc')),
      )
      barre.addEventListener('mouseleave', () => menuAlignement.remove())
      const quitterLegende = () => {
        if (!enLegende) return
        enLegende = false
        ecrire('legende', (legende.textContent ?? '').trim())
        peindre()
      }
      legende.addEventListener('focus', () => (enLegende = true))
      legende.addEventListener('blur', quitterLegende)
      legende.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return
        // Entrée ou Échap : la légende est écrite, le curseur repasse sous l'image.
        e.preventDefault()
        quitterLegende()
        const pos = getPos()
        if (pos === undefined) return
        const apres = Math.min(pos + node.nodeSize, view.state.doc.content.size)
        view.focus()
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(apres))))
      })
      const poignee = (cote: 'gauche' | 'droite') => {
        const p = document.createElement('div')
        p.className = 'notak-image-poignee'
        p.dataset.cote = cote
        p.contentEditable = 'false'
        p.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || !view.editable) return
          e.preventDefault()
          e.stopPropagation()
          const conteneur = figure.parentElement
          if (!conteneur) return
          // La place qu'elle peut prendre : sa colonne, moins les marges de la rangée de bloc.
          const max = conteneur.clientWidth - 12
          const largeur0 = figure.getBoundingClientRect().width
          const centree = figure.dataset.alignement === 'centre'
          const x0 = e.clientX
          let largeur = largeur0
          const bouger = (m: PointerEvent) => {
            const dx = (m.clientX - x0) * (cote === 'droite' ? 1 : -1) * (centree ? 2 : 1)
            largeur = Math.max(64, Math.min(max, largeur0 + dx))
            figure.style.width = `${largeur}px`
          }
          const lacher = () => {
            window.removeEventListener('pointermove', bouger, true)
            window.removeEventListener('pointerup', lacher, true)
            const pos = getPos()
            if (pos === undefined) return
            const part = largeur / max
            view.dispatch(view.state.tr.setNodeAttribute(pos, 'largeur', part >= 0.99 ? null : Math.round(part * 1000) / 1000))
          }
          window.addEventListener('pointermove', bouger, true)
          window.addEventListener('pointerup', lacher, true)
        })
        return p
      }
      const poignees = [poignee('gauche'), poignee('droite')]
      figure.append(img, ...poignees, barre)
      peindre()
      // L'accord peut venir pendant que le texte est ouvert (le bouton de la place, le bandeau de la toile).
      const arreter = externe?.ecouter(peindre)
      return {
        dom: figure,
        update: (n) => {
          if (n.type !== node.type) return false
          node = n
          peindre()
          return true
        },
        stopEvent: (e) => [...poignees, barre, legende, attente.dom].some((p) => p.contains(e.target as HTMLElement)),
        ignoreMutation: () => true,
        destroy: () => arreter?.(),
      }
    }
  },
})

/** Hors édition (aperçu, lecture), les images des fichiers du tableau reçoivent leur adresse. */
export function remplirImages(racine: HTMLElement, adresse: (fichier: string) => Promise<string | null>) {
  for (const figure of racine.querySelectorAll<HTMLElement>('figure[data-fichier]')) {
    const img = figure.querySelector('img')
    if (!img || img.getAttribute('src')) continue
    void adresse(figure.dataset.fichier!).then((u) => u && img.setAttribute('src', u))
  }
}

/**
 * Une adresse montrée en carte, le signet (NOTION.md § 10.3) : à gauche le titre, la description et l'adresse (avec la
 * favicon du site), à droite l'image de la page. Un clic ouvre l'adresse dans un autre onglet. Dans l'éditeur, une
 * carte sans titre va chercher l'aperçu de sa page une fois et l'écrit dans le nœud (hors historique d'annulation).
 */
export interface OptionsApercuLien {
  /** Lit l'aperçu d'une adresse (`contexte.services.apercu`) ; absent, la carte garde l'adresse pour titre. */
  chercher: ChercheurApercu | null
  /** Ce que la toile attend avant de charger l'image et la favicon d'une carte (copie reçue) ; absent, tout se charge. */
  externe: ContenuExterne | null
  /** Qui dessine : l'éditeur, la lecture, ou un export (voir `RenduTexte`). */
  rendu: RenduTexte
}

/** Un élément de la carte, avec sa classe. */
function morceau<K extends keyof HTMLElementTagNameMap>(balise: K, classe: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(balise)
  el.className = `notak-apercu-lien-${classe}`
  return el
}

/** Une image de la carte (favicon, vignette) : elle se retire seule si l'adresse ne mène à rien. */
function imageDeCarte(classe: string): HTMLImageElement {
  const img = morceau('img', classe)
  img.alt = ''
  img.draggable = false
  img.loading = 'lazy'
  img.referrerPolicy = 'no-referrer'
  img.addEventListener('error', () => img.remove())
  return img
}

/**
 * Les demandes d'aperçu en cours, par chercheur puis par adresse : l'éditeur peut dessiner deux fois la même carte
 * (il redessine tout quand ses extensions changent), la page n'est lue qu'une fois. Une demande finie s'oublie : une
 * adresse qui a échoué se redemande à la prochaine ouverture.
 */
const EN_COURS = new WeakMap<ChercheurApercu, Map<string, Promise<Apercu>>>()

function demanderApercu(chercher: ChercheurApercu, url: string): Promise<Apercu> {
  const parAdresse = EN_COURS.get(chercher) ?? new Map<string, Promise<Apercu>>()
  EN_COURS.set(chercher, parAdresse)
  const deja = parAdresse.get(url)
  if (deja) return deja
  const demande = chercher(url)
  parAdresse.set(url, demande)
  const oublier = () => void parAdresse.delete(url)
  demande.then(oublier, oublier)
  return demande
}

export const ApercuLien = Node.create<OptionsApercuLien>({
  name: 'apercuLien',
  group: 'block',
  atom: true,
  draggable: false,
  addOptions: () => ({ chercher: null, externe: null, rendu: 'editeur' }),
  addAttributes() {
    return {
      url: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('href') ?? '' },
      titre: { default: '', parseHTML: (el: HTMLElement) => el.querySelector('.notak-apercu-lien-titre')?.textContent ?? '' },
      description: { default: '', parseHTML: (el: HTMLElement) => el.querySelector('.notak-apercu-lien-description')?.textContent ?? '' },
      image: { default: null, parseHTML: (el: HTMLElement) => el.querySelector('.notak-apercu-lien-image')?.getAttribute('src') ?? null },
      favicon: { default: null, parseHTML: (el: HTMLElement) => el.querySelector('.notak-apercu-lien-icone')?.getAttribute('src') ?? null },
    }
  },
  parseHTML: () => [{ tag: 'a[data-type="apercu-lien"]' }],
  renderHTML({ node, HTMLAttributes }) {
    const { externe, rendu } = this.options
    const { url, titre, description, image, favicon, ...reste } = HTMLAttributes as Record<string, unknown>
    const adresse = String(node.attrs.url ?? '')
    const titreVu = String(node.attrs.titre || adresse)
    const icone = node.attrs.titre ? adresseSure(node.attrs.favicon, 'image') : undefined
    const vignette = adresseSure(node.attrs.image, 'image')
    // L'image et la favicon viennent d'un autre site : rien n'en est demandé tant que la toile attend l'accord.
    const attend = rendu !== 'editeur' && !!(icone || vignette) && !!externe?.attend(`signet:${adresse}`)
    return [
      'a',
      mergeAttributes(reste, { 'data-type': 'apercu-lien', class: 'notak-apercu-lien', href: adresseSure(adresse) ?? '', target: '_blank', rel: 'noopener noreferrer', ...(node.attrs.titre ? {} : { 'data-etat': 'vide' }) }),
      // Comme chez Notion : l'image à gauche, puis la favicon, le titre, la description et l'adresse.
      ...(attend ? [placeExterne('signet', `signet:${adresse}`, hotesDe([vignette, icone]), rendu === 'export')] : vignette ? [['img', { class: 'notak-apercu-lien-image', src: vignette, alt: '' }] as const] : []),
      [
        'span',
        { class: 'notak-apercu-lien-texte' },
        ...(icone && !attend ? [['img', { class: 'notak-apercu-lien-icone', src: icone, alt: '' }] as const] : []),
        ['span', { class: 'notak-apercu-lien-titre' }, titreVu],
        ...(node.attrs.description ? [['span', { class: 'notak-apercu-lien-description' }, String(node.attrs.description)] as const] : []),
        // Sans titre, l'adresse est déjà le titre : elle n'est pas écrite deux fois.
        ...(node.attrs.titre ? [['span', { class: 'notak-apercu-lien-adresse' }, adresse] as const] : []),
      ],
    ]
  },
  addNodeView() {
    const { chercher, externe } = this.options
    return ({ node: depart, view, getPos }) => {
      let node = depart
      let detruit = false
      // L'adresse dont l'aperçu a été demandé (une fois par adresse), et si la réponse se fait attendre.
      let demandee = ''
      let enAttente = false
      const carte = document.createElement('a')
      carte.className = 'notak-apercu-lien'
      carte.dataset.type = 'apercu-lien'
      carte.target = '_blank'
      carte.rel = 'noopener noreferrer'
      carte.draggable = false
      const texte = morceau('span', 'texte')
      const titre = morceau('span', 'titre')
      const description = morceau('span', 'description')
      const icone = imageDeCarte('icone')
      const adresse = morceau('span', 'adresse')
      texte.append(icone, titre, description, adresse)
      const vignette = imageDeCarte('image')
      // Comme chez Notion : l'image à gauche, le texte à droite (favicon, titre, description, adresse en bas).
      carte.append(vignette, texte)
      // Tant que la toile attend l'accord, l'image et la favicon ne sont pas demandées : cette place dit d'où elles viendraient.
      const attente = lieuExterne('signet', () => externe?.permettre(`signet:${node.attrs.url}`))
      // Une image qui n'a pas pu se charger a retiré son élément : on le rend à la carte avec sa nouvelle adresse.
      const montrer = (img: HTMLImageElement, src: string | undefined, parent: HTMLElement, avant?: HTMLElement) => {
        if (!src) return img.remove()
        if (img.getAttribute('src') !== src) img.src = src
        if (!img.isConnected) parent.insertBefore(img, avant ?? null)
      }
      const peindre = () => {
        const a = node.attrs as Record<string, unknown>
        for (const [cle, v] of [['bloc', a.id], ['couleur', a.couleur], ['retrait', Number(a.retrait) || null], ['filBloc', a.fil]] as const) {
          if (v) carte.dataset[cle] = String(v)
          else delete carte.dataset[cle]
        }
        const url = String(a.url ?? '')
        const sure = adresseSure(url)
        if (sure) carte.href = sure
        else carte.removeAttribute('href')
        carte.dataset.etat = a.titre ? 'pret' : enAttente ? 'attente' : 'vide'
        titre.textContent = String(a.titre || url)
        description.textContent = String(a.description ?? '')
        description.hidden = !a.description
        adresse.textContent = url
        adresse.hidden = !a.titre
        const iconeSure = a.titre ? adresseSure(a.favicon, 'image') : undefined
        const vignetteSure = adresseSure(a.image, 'image')
        const attend = !!(iconeSure || vignetteSure) && !!externe?.attend(`signet:${url}`)
        if (attend) {
          attente.dire(hotesDe([vignetteSure, iconeSure]))
          if (!attente.dom.isConnected) carte.insertBefore(attente.dom, texte)
        } else attente.dom.remove()
        montrer(icone, attend ? undefined : iconeSure, texte, titre)
        montrer(vignette, attend ? undefined : vignetteSure, carte, texte)
      }
      // Sans titre, la carte demande l'aperçu de sa page, une fois ; la réponse s'écrit dans le nœud, hors annulation.
      const chercherSiVide = () => {
        const url = String(node.attrs.url ?? '')
        if (!chercher || !view.editable || node.attrs.titre || !adresseSure(url) || demandee === url) return
        demandee = url
        enAttente = true
        peindre()
        demanderApercu(chercher, url)
          .then((apercu) => {
            const pos = getPos()
            const actuel = pos === undefined || detruit || view.isDestroyed ? null : view.state.doc.nodeAt(pos)
            // Le bloc a disparu, changé d'adresse ou reçu un titre entre-temps : cette réponse ne le concerne plus.
            if (!actuel || actuel.type !== node.type || actuel.attrs.url !== url || actuel.attrs.titre) return
            view.dispatch(view.state.tr.setNodeMarkup(pos!, undefined, { ...actuel.attrs, ...attributsDepuisApercu(url, apercu) }).setMeta('addToHistory', false))
          })
          // Un échec garde la carte telle quelle : l'adresse fait le titre.
          .catch(() => {})
          .finally(() => {
            enAttente = false
            if (!detruit) peindre()
          })
      }
      // Un clic ouvre l'adresse, sauf s'il sert à choisir : avec Maj, ou pendant que des blocs sont choisis.
      carte.addEventListener('click', (e) => {
        if (!view.editable) return
        e.preventDefault()
        const sure = adresseSure(node.attrs.url)
        if (sure && !e.shiftKey && blocsChoisis(view.state).length === 0) window.open(sure, '_blank', 'noopener,noreferrer')
      })
      peindre()
      chercherSiVide()
      // L'accord peut venir pendant que le texte est ouvert (le bouton de la place, le bandeau de la toile).
      const arreter = externe?.ecouter(peindre)
      return {
        dom: carte,
        update: (n) => {
          if (n.type !== node.type) return false
          node = n
          peindre()
          chercherSiVide()
          return true
        },
        stopEvent: (e) => attente.dom.contains(e.target as HTMLElement),
        ignoreMutation: () => true,
        destroy: () => {
          detruit = true
          arreter?.()
        },
      }
    }
  },
})
