import type { NoeudTexte } from '../../coeur/tableau'
import { texteBrut } from '../../coeur/tableau'

/** Les formats que le navigateur sait fabriquer seul : le PDF passe par l'impression. */
export type FormatDocument = 'md' | 'txt'
/** Le titre d'un document tient en 100 caractères, comme chez Milanote. */
export const TITRE_MAX = 100

const chaine = (v: unknown): string => (typeof v === 'string' ? v : '')

function enveloppe(texte: string, marques: NonNullable<NoeudTexte['marks']>, md: boolean): string {
  if (!md || texte.trim() === '') return texte
  // Les espaces du bord restent dehors : `** gras**` ne fait pas du gras en Markdown.
  const [, avant = '', coeur = '', apres = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(texte) ?? []
  let sortie = coeur
  for (const m of marques) {
    if (m.type === 'bold') sortie = `**${sortie}**`
    else if (m.type === 'italic') sortie = `*${sortie}*`
    else if (m.type === 'strike') sortie = `~~${sortie}~~`
    else if (m.type === 'code') sortie = `\`${sortie}\``
    else if (m.type === 'link' && chaine(m.attrs?.href)) sortie = `[${sortie}](${chaine(m.attrs?.href)})`
  }
  return avant + sortie + apres
}

function enLigne(n: NoeudTexte, md: boolean): string {
  if (n.type === 'hardBreak') return md ? '  \n' : '\n'
  if (n.text !== undefined) return enveloppe(n.text, n.marks ?? [], md)
  if (n.type === 'mention' || n.type === 'lienTableau') return texteBrut(n)
  return (n.content ?? []).map((c) => enLigne(c, md)).join('')
}

const indenter = (lignes: string[], marge: string) => lignes.map((l) => (l === '' ? l : marge + l))

function blocs(noeuds: readonly NoeudTexte[], md: boolean, serre = false): string[] {
  const sortie: string[] = []
  for (const n of noeuds) {
    const lignes = bloc(n, md)
    if (lignes.length === 0) continue
    if (sortie.length > 0 && !serre) sortie.push('')
    sortie.push(...lignes)
  }
  return sortie
}

function liste(n: NoeudTexte, md: boolean): string[] {
  const sortie: string[] = []
  const debut = Number(n.attrs?.start ?? 1)
  ;(n.content ?? []).forEach((item, i) => {
    const interne = blocs(item.content ?? [], md, true)
    const tache = n.type === 'taskList' ? (item.attrs?.checked === true ? '[x] ' : '[ ] ') : ''
    const puce = n.type === 'orderedList' ? `${(Number.isFinite(debut) ? debut : 1) + i}. ` : `- ${tache}`
    const [premiere = '', ...suite] = interne
    sortie.push(puce + premiere, ...indenter(suite, ' '.repeat(puce.length)))
  })
  return sortie
}

function bloc(n: NoeudTexte, md: boolean): string[] {
  switch (n.type) {
    case 'paragraph': {
      const t = enLigne(n, md)
      return t === '' ? [] : t.split('\n')
    }
    case 'heading': {
      const t = enLigne(n, md)
      return t === '' ? [] : [md ? `${'#'.repeat(Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1))))} ${t}` : t]
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return liste(n, md)
    case 'blockquote':
      return indenter(blocs(n.content ?? [], md), '> ').map((l) => (l === '' ? '>' : l))
    case 'codeBlock': {
      const code = (n.content ?? []).map((c) => c.text ?? '').join('')
      return md ? ['```' + chaine(n.attrs?.language), ...code.split('\n'), '```'] : code.split('\n')
    }
    case 'horizontalRule':
      return md ? ['---'] : []
    // Le moteur de blocs (docs/NOTION.md § 2) : un dépliant s'exporte ouvert, son résumé en tête (en titre s'il en
    // est un) ; des colonnes s'exportent l'une après l'autre.
    case 'deroulant': {
      const [resume, ...dedans] = n.content ?? []
      const t = resume ? enLigne(resume, md) : ''
      const niveau = Number(n.attrs?.niveau) || 0
      const tete = t === '' ? [] : [md && niveau ? `${'#'.repeat(Math.min(3, niveau))} ${t}` : t]
      const suite = blocs(dedans, md)
      return tete.length && suite.length ? [...tete, '', ...suite] : [...tete, ...suite]
    }
    case 'image': {
      const legende = chaine(n.attrs?.legende)
      const url = chaine(n.attrs?.url)
      return md && url ? [`![${legende}](${url})`] : legende ? [legende] : []
    }
    case 'apercuLien': {
      const url = chaine(n.attrs?.url)
      const titre = chaine(n.attrs?.titre) || url
      if (!url) return []
      return [md ? `[${titre}](${url})` : titre === url ? url : `${titre} (${url})`]
    }
    default:
      return n.content ? blocs(n.content, md) : n.text ? [n.text] : []
  }
}

/** Le titre puis le texte, en Markdown ou en texte brut. */
export function documentEnTexte(titre: string, texte: NoeudTexte, format: FormatDocument): string {
  const md = format === 'md'
  const corps = blocs(texte.type === 'doc' ? (texte.content ?? []) : [texte], md).join('\n')
  const t = titre.trim()
  return [t ? (md ? `# ${t}` : t) : '', corps].filter((p) => p !== '').join('\n\n') + '\n'
}

/** Un nom de fichier sûr tiré du titre. */
export const nomFichier = (titre: string, extension: string): string =>
  `${titre.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document'}.${extension}`

/** Ce que le navigateur télécharge : le fichier de ce format. */
export function telecharger(nom: string, contenu: string, mime: string) {
  const adresse = URL.createObjectURL(new Blob([contenu], { type: `${mime};charset=utf-8` }))
  const lien = document.createElement('a')
  lien.href = adresse
  lien.download = nom
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(adresse), 1000)
}

/** Comme `telecharger`, pour un fichier binaire (le .docx). */
export function telechargerOctets(nom: string, octets: Uint8Array, mime: string) {
  const adresse = URL.createObjectURL(new Blob([octets as BlobPart], { type: mime }))
  const lien = document.createElement('a')
  lien.href = adresse
  lien.download = nom
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(adresse), 1000)
}

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** La page que l'impression du navigateur met en PDF : le titre, puis le texte déjà dessiné. */
export const pageImpression = (titre: string, corpsHtml: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${echapper(titre)}</title><style>` +
  'body{font:16px/24px system-ui,sans-serif;color:#323b4a;margin:0;padding:24px}h1.t{font-size:24px;line-height:29px;margin:0 0 24px}' +
  'p{margin:0 0 12px}h1{font-size:24px}h2{font-size:21px}pre,code{font-family:ui-monospace,monospace}blockquote{margin:0 0 12px;padding-left:12px;border-left:2px solid #ccc}' +
  `@page{margin:18mm}</style></head><body><h1 class="t">${echapper(titre)}</h1>${corpsHtml}</body></html>`

/** Ouvre l'impression du navigateur sur cette page, dans un cadre caché : « Enregistrer en PDF » y est proposé. */
export function imprimer(html: string) {
  const cadre = document.createElement('iframe')
  cadre.setAttribute('aria-hidden', 'true')
  cadre.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  document.body.appendChild(cadre)
  const fenetre = cadre.contentWindow
  if (!fenetre) return cadre.remove()
  fenetre.document.open()
  fenetre.document.write(html)
  fenetre.document.close()
  fenetre.addEventListener('afterprint', () => cadre.remove())
  setTimeout(() => {
    fenetre.focus()
    fenetre.print()
  }, 50)
}
