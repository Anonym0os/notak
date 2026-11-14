// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Les chemins se bâtissent à partir du fichier : écrits en dur dans `new URL`, Vite les changerait en adresses d'asset.
const ici = dirname(fileURLToPath(import.meta.url))
const PAQUET = join(ici, '../../../packages/tableau/src')

interface Regle {
  selecteur: string
  declarations: Record<string, string>
}

/** Les règles d'une feuille, celles des `@media` comprises, avec leurs déclarations (la dernière valeur l'emporte). */
function regles(css: string): Regle[] {
  const texte = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const sortie: Regle[] = []
  const pile: string[] = []
  let tampon = ''
  for (const c of texte) {
    if (c === '{') {
      pile.push(tampon.trim())
      tampon = ''
    } else if (c === '}') {
      const selecteur = pile.pop() ?? ''
      if (!selecteur.startsWith('@')) {
        const declarations: Record<string, string> = {}
        for (const d of tampon.split(';')) {
          const deux = d.indexOf(':')
          if (deux > 0) declarations[d.slice(0, deux).trim().toLowerCase()] = d.slice(deux + 1).trim()
        }
        sortie.push({ selecteur: selecteur.replace(/\s+/g, ' '), declarations })
      }
      tampon = ''
    } else tampon += c
  }
  return sortie
}

const feuilles = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'node_modules' ? [] : feuilles(join(dossier, e.name))) : e.name.endsWith('.css') ? [join(dossier, e.name)] : [],
  )

const APP = regles(readFileSync(join(ici, 'app.css'), 'utf8'))

/** La valeur de `user-select` que les règles d'app.css posent sur cet élément, la plus spécifique d'abord. */
const reglesQuiVisent = (el: Element, propriete: string) => APP.filter((r) => propriete in r.declarations && el.matches(r.selecteur))

const elementDe = (html: string) => {
  const boite = document.createElement('div')
  boite.innerHTML = html
  document.body.append(boite)
  return boite.firstElementChild!
}

describe('la sélection de texte', () => {
  it('ne prend pas l’interface : la page entière part de `none`, préfixe de WebKit compris', () => {
    const corps = APP.filter((r) => r.selecteur === 'body' && 'user-select' in r.declarations)
    expect(corps).toHaveLength(1)
    expect(corps[0]!.declarations).toMatchObject({ '-webkit-user-select': 'none', 'user-select': 'none' })
  })

  it('rend `text` à chaque champ et à chaque zone qu’on modifie, sans quoi Safari y refuse la saisie', () => {
    for (const html of ['<input>', '<textarea></textarea>', '<div contenteditable="true"></div>', '<div contenteditable=""></div>', '<p contenteditable="plaintext-only"></p>']) {
      const valeurs = reglesQuiVisent(elementDe(html), 'user-select').map((r) => [r.declarations['-webkit-user-select'], r.declarations['user-select']])
      expect(valeurs, html).toContainEqual(['text', 'text'])
    }
    // Un éditeur en lecture seule n'est pas un champ.
    expect(reglesQuiVisent(elementDe('<div contenteditable="false"></div>'), 'user-select')).toEqual([])
  })

  it('laisse copier un message d’erreur, une adresse, un code', () => {
    for (const html of ['<p role="alert">Le serveur ne répond pas</p>', '<code class="connexion-code-valeur">ABCD</code>', '<p class="autoriser-code">ABCD-EFGH</p>']) {
      const valeur = reglesQuiVisent(elementDe(html), 'user-select').at(-1)!.declarations
      expect(['text', 'all'], html).toContain(valeur['user-select'])
      expect(valeur['-webkit-user-select'], html).toBe(valeur['user-select'])
    }
  })

  it('ne sélectionne jamais une commande, même dans un texte qui se sélectionne', () => {
    for (const html of ['<button>Pages</button>', '<label>Thème</label>', '<div role="menuitem">Copier</div>', '<span role="button">Fermer</span>', '<div role="option">Toile</div>', '<button role="tab">Général</button>']) {
      const valeurs = reglesQuiVisent(elementDe(html), 'user-select').map((r) => r.declarations['user-select'])
      expect(valeurs, html).toEqual(['none'])
    }
  })

  it('écrit chaque `user-select` avec le préfixe que lit WebKit (Safari, l’app de bureau, l’iPad), à la même valeur', () => {
    const fautes: string[] = []
    for (const fichier of [...feuilles(ici), ...feuilles(PAQUET)]) {
      for (const r of regles(readFileSync(fichier, 'utf8'))) {
        const { 'user-select': nu, '-webkit-user-select': prefixe } = r.declarations
        if (nu !== prefixe) fautes.push(`${fichier.replace(/^.*\/(apps|packages)\//, '$1/')} : ${r.selecteur} (${prefixe ?? '—'} / ${nu ?? '—'})`)
      }
    }
    expect(fautes).toEqual([])
  })
})

describe('l’anneau de focus', () => {
  // La règle d'app.css, `:focus` ôté : elle dit quels éléments, une fois le focus pris, ne dessinent pas d'anneau.
  const regle = APP.find((r) => r.selecteur.startsWith(':where(:focus:not(') && r.declarations.outline === 'none')
  const sansAnneau = (html: string) => elementDe(html).matches(regle!.selecteur.replace(':focus', ''))

  it('ne cerne pas un conteneur qui reçoit le focus par programme : dialogue, carte, menu, liste, toile, titre', () => {
    expect(regle).toBeDefined()
    for (const html of [
      '<dialog class="notak-dialogue-hote" tabindex="-1"></dialog>',
      '<section class="app-carte" tabindex="-1"></section>',
      '<div role="menu" tabindex="-1"></div>',
      '<div role="listbox" tabindex="0"></div>',
      '<div class="notak-toile" tabindex="0"></div>',
      '<div class="notak-arbre-fond" role="dialog" tabindex="-1"></div>',
      '<h2 tabindex="-1">Ouvrir ces fichiers ?</h2>',
    ])
      expect(sansAnneau(html), html).toBe(true)
  })

  it('le garde aux commandes, que le clavier atteint : lien, bouton, champ, ligne de menu, option, onglet', () => {
    for (const html of [
      '<a href="/aide">Aide</a>',
      '<button>Partager</button>',
      '<input>',
      '<textarea></textarea>',
      '<select></select>',
      '<div contenteditable="true"></div>',
      '<div role="menuitem" tabindex="-1">Copier</div>',
      '<div role="option" tabindex="-1">Toile</div>',
      '<div role="tab" tabindex="0">Général</div>',
      '<span role="checkbox" tabindex="0"></span>',
    ])
      expect(sansAnneau(html), html).toBe(false)
  })

  it('ne cerne pas le dialogue commun, même sans la feuille de l’app', () => {
    const dialogue = regles(readFileSync(join(PAQUET, 'communs/dialogue.css'), 'utf8')).find((r) => r.selecteur === '.notak-dialogue-hote:focus')
    expect(dialogue?.declarations.outline).toBe('none')
  })
})

describe('les barres de défilement', () => {
  const brut = readFileSync(join(ici, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('sont fines partout, et leur pouce ne paraît qu’au survol de ce qui défile, à la souris seulement', () => {
    const toutes = APP.find((r) => r.selecteur === ':where(*)' && 'scrollbar-width' in r.declarations)
    const survol = APP.find((r) => r.selecteur === ':where(:hover)' && 'scrollbar-color' in r.declarations)
    expect(toutes?.declarations).toMatchObject({ 'scrollbar-width': 'thin', 'scrollbar-color': 'transparent transparent' })
    // La couleur du texte de ce qui défile, à peine : lisible en clair comme en sombre.
    expect(survol?.declarations['scrollbar-color']).toMatch(/^color-mix\(in srgb, currentColor \d+%, transparent\) transparent$/)
    // Au doigt, les barres du système, qui ne paraissent qu'en défilant, restent : la règle ne vaut qu'avec un survol.
    expect(brut).toMatch(/@media \(hover: hover\) \{\s*@supports \(scrollbar-color: red red\) \{\s*:where\(\*\)/)
  })

  it('aucune feuille ne pose de pouce toujours visible ni ne redit « fin » : la règle commune vaut partout, vieux WebKit compris', () => {
    const fautes: string[] = []
    for (const fichier of [...feuilles(ici), ...feuilles(PAQUET)]) {
      for (const r of regles(readFileSync(fichier, 'utf8'))) {
        if (r.selecteur.startsWith(':where(')) continue
        const largeur = r.declarations['scrollbar-width']
        if ('scrollbar-color' in r.declarations || (largeur && largeur !== 'none')) fautes.push(`${fichier.replace(/^.*\/(apps|packages)\//, '$1/')} : ${r.selecteur}`)
      }
    }
    expect(fautes).toEqual([])
  })
})
