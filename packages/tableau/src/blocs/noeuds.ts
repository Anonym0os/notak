import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Node, mergeAttributes } from '@tiptap/react'
import { adresseSure } from '../elements/lien/adresse'
import { Citation } from '../elements/note/noeuds'
import type { ChercheurApercu } from '../elements/types'
import type { Apercu } from '../coeur/tableau'
import { t } from '../langue'
import { attributsDepuisApercu } from './apercu'
import { blocsChoisis } from './selection'

/** L'icône d'un alignement : trois traits rangés à gauche, au centre ou à droite. */
function dessinAlignement(cote: 'gauche' | 'centre' | 'droite'): SVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  for (const [k, v] of Object.entries({ width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
  const x = (l: number) => (cote === 'gauche' ? 2 : cote === 'droite' ? 14 - l : 8 - l / 2)
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', [12, 7, 10].map((l, i) => `M${x(l)} ${4 + i * 4}h${l}`).join(''))
  svg.append(path)
  return svg
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
}

export const ImageBloc = Node.create<OptionsImage>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: false,
  addOptions: () => ({ adresse: null }),
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
  renderHTML: ({ node, HTMLAttributes }) => {
    const { fichier, url, largeur, alignement, legende, ...reste } = HTMLAttributes as Record<string, unknown>
    const attrs = mergeAttributes(reste, {
      'data-type': 'image',
      class: 'notak-image-bloc',
      'data-alignement': String(alignement ?? 'centre'),
      ...(fichier ? { 'data-fichier': String(fichier) } : {}),
      ...(largeur ? { 'data-largeur': String(largeur), style: `width: ${Math.round(Number(largeur) * 100)}%` } : {}),
    })
    const texte = String(node.attrs.legende ?? '')
    return ['figure', attrs, ['img', { src: String(url ?? ''), alt: texte }], ...(legende ? [['figcaption', {}, texte] as const] : [])]
  },
  // Dans l'éditeur, l'image d'un fichier du tableau va chercher son adresse ; hors édition, voir `remplirImages`.
  // Au survol, deux poignées sur ses bords règlent sa largeur (NOTION.md § 2), écrite au lâcher en part de la colonne.
  addNodeView() {
    const { adresse } = this.options
    return ({ node: depart, view, getPos }) => {
      let node = depart
      const figure = document.createElement('figure')
      figure.className = 'notak-image-bloc'
      figure.dataset.type = 'image'
      const img = document.createElement('img')
      img.draggable = false
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
        const voulue = String(a.url ?? a.fichier ?? '')
        if (voulue !== source) {
          source = voulue
          if (a.url) img.src = String(a.url)
          else if (a.fichier && adresse) void adresse(String(a.fichier)).then((u) => u && source === voulue && (img.src = u))
        }
        for (const b of alignements) b.dataset.actif = String(b.dataset.valeur === figure.dataset.alignement)
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
      // La barre au survol (NOTION.md § 2) : l'alignement, et « Légende » qui ouvre la légende à écrire.
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
      const alignements = (['gauche', 'centre', 'droite'] as const).map((v) => {
        const b = bouton(t(`blocs.image.${v}`), dessinAlignement(v), () => ecrire('alignement', v))
        b.dataset.valeur = v
        return b
      })
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
      const groupe = document.createElement('div')
      groupe.className = 'notak-image-barre-groupe'
      groupe.append(...alignements)
      barre.append(groupe, bouton(t('blocs.image.legende'), t('blocs.image.legende'), ecrireLegende))
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
      return {
        dom: figure,
        update: (n) => {
          if (n.type !== node.type) return false
          node = n
          peindre()
          return true
        },
        stopEvent: (e) => [...poignees, barre, legende].some((p) => p.contains(e.target as HTMLElement)),
        ignoreMutation: () => true,
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
  addOptions: () => ({ chercher: null }),
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
  renderHTML: ({ node, HTMLAttributes }) => {
    const { url, titre, description, image, favicon, ...reste } = HTMLAttributes as Record<string, unknown>
    const adresse = String(node.attrs.url ?? '')
    const titreVu = String(node.attrs.titre || adresse)
    const icone = adresseSure(node.attrs.favicon, 'image')
    const vignette = adresseSure(node.attrs.image, 'image')
    return [
      'a',
      mergeAttributes(reste, { 'data-type': 'apercu-lien', class: 'notak-apercu-lien', href: adresseSure(adresse) ?? '', target: '_blank', rel: 'noopener noreferrer', ...(node.attrs.titre ? {} : { 'data-etat': 'vide' }) }),
      [
        'span',
        { class: 'notak-apercu-lien-texte' },
        ['span', { class: 'notak-apercu-lien-titre' }, titreVu],
        ...(node.attrs.description ? [['span', { class: 'notak-apercu-lien-description' }, String(node.attrs.description)] as const] : []),
        // Sans titre, l'adresse est déjà le titre : elle n'est pas écrite deux fois.
        ...(node.attrs.titre
          ? [['span', { class: 'notak-apercu-lien-pied' }, ...(icone ? [['img', { class: 'notak-apercu-lien-icone', src: icone, alt: '' }] as const] : []), ['span', { class: 'notak-apercu-lien-adresse' }, adresse]] as const]
          : []),
      ],
      ...(vignette ? [['img', { class: 'notak-apercu-lien-image', src: vignette, alt: '' }] as const] : []),
    ]
  },
  addNodeView() {
    const { chercher } = this.options
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
      const pied = morceau('span', 'pied')
      const icone = imageDeCarte('icone')
      const adresse = morceau('span', 'adresse')
      pied.append(icone, adresse)
      texte.append(titre, description, pied)
      const vignette = imageDeCarte('image')
      carte.append(texte, vignette)
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
        pied.hidden = !a.titre
        montrer(icone, adresseSure(a.favicon, 'image'), pied, adresse)
        montrer(vignette, adresseSure(a.image, 'image'), carte)
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
      return {
        dom: carte,
        update: (n) => {
          if (n.type !== node.type) return false
          node = n
          peindre()
          chercherSiVide()
          return true
        },
        ignoreMutation: () => true,
        destroy: () => {
          detruit = true
        },
      }
    }
  },
})
