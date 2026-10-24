// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { LANGAGES } from './code'
import { colorerCode, jetons, LANGAGES_COLORES, type Genre } from './coloration'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'

/** Les passages colorés d'un texte, sous la forme « texte:genre ». */
const lire = (code: string, langage: string | null) => jetons(code, langage).map((j) => `${code.slice(j.de, j.a)}:${j.genre}`)
const genreDe = (code: string, langage: string, mot: string): Genre | undefined => {
  const i = code.indexOf(mot)
  return jetons(code, langage).find((j) => j.de === i && j.a === i + mot.length)?.genre
}

describe('NOTION.md § 2 : jetons, les langages à accolades', () => {
  it('JavaScript : mots-clés, chaîne avec échappement, commentaire, nombre, fonction, type', () => {
    const code = 'const s = "a\\"b" // fin\nlet n = 42; foo(n); new Map()'
    expect(lire(code, 'javascript')).toEqual([
      'const:motCle',
      '=:operateur',
      '"a\\"b":chaine',
      '// fin:commentaire',
      'let:motCle',
      '=:operateur',
      '42:nombre',
      'foo:fonction',
      'new:motCle',
      'Map:fonction',
    ])
    expect(genreDe('class Pile extends Base {}', 'js', 'Pile')).toBe('type')
  })

  it('un commentaire de bloc non fermé court jusqu’à la fin du texte', () => {
    const code = 'a = 1 /* jamais fermé\nsuite'
    const j = jetons(code, 'javascript')
    expect(j[j.length - 1]).toEqual({ de: code.indexOf('/*'), a: code.length, genre: 'commentaire' })
  })

  it('un gabarit : le texte est chaîne, ${…} est du code', () => {
    const code = 'x = `a ${1 + b} c`'
    expect(lire(code, 'javascript')).toEqual(['=:operateur', '`a ${:chaine', '1:nombre', '+:operateur', '} c`:chaine'])
  })

  it('une clé d’objet est une propriété, un mot après un point n’est pas un mot-clé', () => {
    expect(genreDe('x = { class: 1 }', 'javascript', 'class')).toBe('motCle')
    expect(genreDe('x = { cle: 1 }', 'javascript', 'cle')).toBe('propriete')
    expect(genreDe('a.default', 'javascript', 'default')).toBeUndefined()
    expect(genreDe('a.map(f)', 'javascript', 'map')).toBe('fonction')
  })

  it('TypeScript : interface et types de base', () => {
    const code = 'interface A { n: number }'
    expect(lire(code, 'typescript')).toEqual(['interface:motCle', 'A:type', 'n:propriete', 'number:type'])
    expect(genreDe('x: string', 'ts', 'string')).toBe('type')
  })

  it('Rust : durée de vie et macro ; C : directive', () => {
    expect(genreDe("fn f<'a>(x: &'a str) { println!(\"hi\"); }", 'rust', "'a")).toBe('type')
    expect(genreDe('println!("x")', 'rust', 'println')).toBe('fonction')
    expect(lire('#include <stdio.h>\nint x = 0;', 'c')).toEqual(['#include:motCle', '<stdio.h>:chaine', 'int:type', '=:operateur', '0:nombre'])
  })
})

describe('NOTION.md § 2 : jetons, les autres langages', () => {
  it('Python : # commentaire, chaîne triple, préfixe f, décorateur, valeurs', () => {
    const code = '@app.route\ndef f(x):  # note\n    return f"{x}" or None\n"""doc\nsuite"""'
    expect(lire(code, 'python')).toEqual(['@app.route:attribut', 'def:motCle', 'f:fonction', '# note:commentaire', 'return:motCle', 'f"{x}":chaine', 'or:motCle', 'None:nombre', '"""doc\nsuite""":chaine'])
    expect(genreDe('class Chat: pass', 'py', 'Chat')).toBe('type')
  })

  it('CSS : sélecteur, propriété, valeur, couleur, variable, règle en @', () => {
    const code = '@media (min-width: 600px) {\n  .a:hover > b { color: #fff; margin: -2px var(--x) !important; background: url("i.png") }\n}'
    const l = lire(code, 'css')
    expect(l).toContain('@media:motCle')
    expect(l).toContain('min-width:propriete')
    expect(l).toContain('600px:nombre')
    expect(l).toContain('.a:balise')
    expect(l).toContain(':hover:attribut')
    expect(l).toContain('b:balise')
    expect(l).toContain('color:propriete')
    expect(l).toContain('#fff:nombre')
    expect(l).toContain('-2px:nombre')
    expect(l).toContain('var:fonction')
    expect(l).toContain('--x:variable')
    expect(l).toContain('!important:motCle')
    expect(l).toContain('url:fonction')
    expect(l).toContain('"i.png":chaine')
    expect(lire('/* c */ a { }', 'css')[0]).toBe('/* c */:commentaire')
  })

  it('HTML : balises, attributs, valeurs, commentaire, script et style embarqués', () => {
    const code = '<!-- c --><a href="/x" disabled>t</a>\n<script>const a = 1</script><style>b { color: red }</style>'
    const l = lire(code, 'html')
    expect(l).toContain('<!-- c -->:commentaire')
    expect(l).toContain('<a:balise')
    expect(l).toContain('href:attribut')
    expect(l).toContain('"/x":chaine')
    expect(l).toContain('disabled:attribut')
    expect(l).toContain('</a:balise')
    expect(l).toContain('const:motCle')
    expect(l).toContain('1:nombre')
    expect(l).toContain('color:propriete')
  })

  it('JSON : clés, chaînes, nombres, valeurs ; YAML : clés, commentaire, liste', () => {
    expect(lire('{"a": [1, true], "b": "x", "c": null}', 'json')).toEqual(['"a":propriete', '1:nombre', 'true:nombre', '"b":propriete', '"x":chaine', '"c":propriete', 'null:nombre'])
    const yaml = '# conf\nport: 8080\nnom: "x"  # fin\nliste:\n  - a\n  - true'
    expect(lire(yaml, 'yaml')).toEqual(['# conf:commentaire', 'port:propriete', '8080:nombre', 'nom:propriete', '"x":chaine', '# fin:commentaire', 'liste:propriete', '-:operateur', '-:operateur', 'true:nombre'])
    expect(lire('url: http://a.b/c', 'yml')).toEqual(['url:propriete'])
  })

  it('SQL : mots-clés sans égard à la casse, chaîne, commentaire --, fonction, type', () => {
    const code = "Select count(*), 'a' From t -- fin\nwhere id = 3 AND x is NULL; create table u (id INT)"
    const l = lire(code, 'sql')
    expect(l).toContain('Select:motCle')
    expect(l).toContain('count:fonction')
    expect(l).toContain("'a':chaine")
    expect(l).toContain('From:motCle')
    expect(l).toContain('-- fin:commentaire')
    expect(l).toContain('where:motCle')
    expect(l).toContain('3:nombre')
    expect(l).toContain('AND:motCle')
    expect(l).toContain('NULL:nombre')
    expect(l).toContain('INT:type')
  })

  it('Bash : commande, option, variable, chaînes, # commentaire seulement après une espace', () => {
    const code = 'if [ -f "$x" ]; then\n  grep -rn \'a b\' ./d | wc -l # compte\nfi\necho a#b ${HOME} 3'
    const l = lire(code, 'bash')
    expect(l).toContain('if:motCle')
    expect(l).toContain('-f:attribut')
    expect(l).toContain('"$x":chaine')
    expect(l).toContain('then:motCle')
    expect(l).toContain('grep:fonction')
    expect(l).toContain('-rn:attribut')
    expect(l).toContain("'a b':chaine")
    expect(l).toContain('wc:fonction')
    expect(l).toContain('# compte:commentaire')
    expect(l).toContain('echo:fonction')
    expect(l.some((x) => x.endsWith(':commentaire') && x.includes('b'))).toBe(false)
    expect(l).toContain('${HOME}:variable')
    expect(l).toContain('3:nombre')
    expect(genreDe('FOO=bar make', 'sh', 'FOO')).toBe('variable')
  })

  it('Markdown : titre, liste, code en ligne, lien', () => {
    const l = lire('# Titre\n- a `b` [c](http://d)\n```\ncode\n```', 'markdown')
    expect(l).toEqual(['# Titre:motCle', '-:operateur', '`b`:chaine', '[c]:fonction', '(http://d):chaine', '```:commentaire', '```:commentaire'])
  })

  it('les alias et les noms hors menu', () => {
    for (const nom of ['js', 'ts', 'py', 'sh', 'zsh', 'yml', 'rb', 'rs', 'c++', 'cs', 'kt', 'md', 'tsx', 'xml']) {
      expect(jetons('# a\ndef x = 1 # a\n<a>', nom).length, nom).toBeGreaterThan(0)
    }
  })

  it('tous les langages du menu sont couverts, hormis le texte brut', () => {
    for (const [v] of LANGAGES) if (v !== null) expect(LANGAGES_COLORES, String(v)).toContain(v)
  })

  it('null et un langage inconnu ne donnent rien', () => {
    expect(jetons('const a = 1', null)).toEqual([])
    expect(jetons('const a = 1', 'klingon')).toEqual([])
    expect(jetons('', 'javascript')).toEqual([])
  })
})

describe('NOTION.md § 2 : robustesse et vitesse', () => {
  const sale = ['"', "'", '`', '`${', '/*', '<', '<a "', '<script>', '<!--', '{', '}', '(((', ')))', '[[[', '\\', '$', '${', '#[', "'''", '"""', '@', ':', '\u0000', 'é', '😀', '<?php', '=begin', '$(']
  it('jamais d’exception, jetons ordonnés, sans chevauchement et dans le texte', () => {
    for (const langage of LANGAGES_COLORES) {
      for (const morceau of sale) {
        for (const code of [morceau, morceau.repeat(50), `a ${morceau} b\n${morceau}`, `${morceau}\n`]) {
          const j = jetons(code, langage)
          let fin = 0
          for (const x of j) {
            expect(x.de, `${langage} ${JSON.stringify(code)}`).toBeGreaterThanOrEqual(fin)
            expect(x.a).toBeGreaterThan(x.de)
            expect(x.a).toBeLessThanOrEqual(code.length)
            fin = x.a
          }
        }
      }
    }
  })

  it('un texte d’environ 200 Ko se colore en quelques centaines de ms, par langage', () => {
    const bloc: Record<string, string> = {
      javascript: 'const f = (a, b) => `${a}+${b}` // note\nlet s = "abc"; /* x */ if (a.b) { return 12 }\n',
      python: 'def f(x):  # note\n    return f"{x}" + """a\nb""" + str(1)\n',
      css: '.a:hover > b { color: #fff; margin: -2px var(--x) } /* c */\n@media (min-width: 600px) { c { d: e } }\n',
      html: '<div class="a" id=b><!-- c --><a href="x">t</a><script>let a = 1</script></div>\n',
      json: '{"a": [1, 2, true], "b": {"c": "d\\"e", "f": null}}\n',
      sql: "SELECT a, count(*) FROM t WHERE x = 'y' -- c\nGROUP BY a;\n",
      bash: 'if [ -f "$x" ]; then grep -rn \'a b\' ./d | wc -l # c\nfi\n',
      yaml: 'cle: valeur # c\nliste:\n  - "a"\n  - 12\n',
      markdown: '# Titre\n- a `b` [c](http://d)\n',
      rust: "fn f<'a>(x: &'a str) { println!(\"hi\"); } // c\n",
    }
    for (const [langage, motif] of Object.entries(bloc)) {
      const code = motif.repeat(Math.ceil(200_000 / motif.length))
      const t0 = performance.now()
      const j = jetons(code, langage)
      const ms = performance.now() - t0
      expect(j.length, langage).toBeGreaterThan(1000)
      expect(ms, `${langage} ${ms.toFixed(0)} ms`).toBeLessThan(900)
    }
  })

  it('les cas qui font se répéter les recherches restent linéaires', () => {
    const pathologiques: [string, string][] = [
      ['css', '(a;'.repeat(60_000)],
      ['css', 'a '.repeat(90_000)],
      ['markdown', '[a'.repeat(90_000)],
      ['html', '<a '.repeat(60_000)],
      ['rust', '#['.repeat(90_000)],
      ['javascript', '`${'.repeat(50_000)],
      ['bash', '$'.repeat(150_000)],
      ['sql', "'".repeat(150_000)],
    ]
    for (const [langage, code] of pathologiques) {
      const t0 = performance.now()
      jetons(code, langage)
      const ms = performance.now() - t0
      expect(ms, `${langage} ${ms.toFixed(0)} ms`).toBeLessThan(1500)
    }
  })

  it('un texte colossal n’est pas coloré', () => {
    expect(jetons('a '.repeat(300_000), 'javascript')).toEqual([])
  })
})

describe('NOTION.md § 2 : le rendu figé', () => {
  it('colorerCode enveloppe les jetons des pre[data-langage] code, une seule fois', () => {
    const racine = document.createElement('div')
    racine.innerHTML = '<pre data-langage="javascript"><code>const a = 1 // x</code></pre><pre><code>const b</code></pre>'
    colorerCode(racine)
    const code = racine.querySelector('code')!
    expect(code.textContent).toBe('const a = 1 // x')
    expect([...code.querySelectorAll('span')].map((s) => s.className)).toEqual(['notak-code-motCle', 'notak-code-operateur', 'notak-code-nombre', 'notak-code-commentaire'])
    expect(racine.querySelectorAll('pre')[1]!.querySelector('span')).toBeNull()
    const avant = racine.innerHTML
    colorerCode(racine)
    expect(racine.innerHTML).toBe(avant)
  })
})

describe('NOTION.md § 2 : la coloration dans l’éditeur', () => {
  let editeur: Editor | null = null
  afterEach(() => {
    editeur?.destroy()
    editeur = null
  })
  const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })
  const ouvrir = (blocs: NoeudTexte[]): Editor => {
    editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs } })
    const ids = poserIds(editeur.state)
    if (ids) editeur.view.dispatch(ids)
    return editeur
  }
  const classes = (ed: Editor, i = 0) => [...ed.view.dom.querySelectorAll('pre')[i]!.querySelectorAll('code span')].map((s) => s.className)
  /** La position du premier bloc de code. */
  const posCode = (ed: Editor) => {
    let pos = -1
    ed.state.doc.descendants((n, p) => {
      if (n.type.name === 'codeBlock' && pos < 0) pos = p
      return pos < 0
    })
    return pos
  }

  it('des span.notak-code-motCle apparaissent après la saisie, et disparaissent quand le langage passe à null', () => {
    const ed = ouvrir([b('codeBlock', '', { language: 'javascript' })])
    const pos = posCode(ed)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos + 1)))
    ed.view.dispatch(ed.state.tr.insertText('const a = "x"'))
    expect(ed.view.dom.querySelectorAll('pre code span.notak-code-motCle')).toHaveLength(1)
    expect(classes(ed)).toEqual(['notak-code-motCle', 'notak-code-operateur', 'notak-code-chaine'])

    ed.view.dispatch(ed.state.tr.insertText(' // fin', pos + 1 + ed.state.doc.child(0).content.size))
    expect(classes(ed).at(-1)).toBe('notak-code-commentaire')

    ed.view.dispatch(ed.state.tr.setNodeAttribute(pos, 'language', null))
    expect(ed.view.dom.querySelectorAll('pre code span[class^="notak-code-"]')).toHaveLength(0)

    ed.view.dispatch(ed.state.tr.setNodeAttribute(pos, 'language', 'python'))
    expect(ed.view.dom.querySelectorAll('pre code span.notak-code-commentaire')).toHaveLength(0)
    expect(classes(ed)).toContain('notak-code-chaine')
  })

  it('les décorations d’un bloc suivent son déplacement quand du texte s’insère avant lui', () => {
    const ed = ouvrir([b('codeBlock', 'let a', { language: 'javascript' }), b('paragraph', 'avant'), b('codeBlock', 'def f', { language: 'python' })])
    expect(classes(ed, 0)).toEqual(['notak-code-motCle'])
    expect(classes(ed, 1)).toEqual(['notak-code-motCle'])
    ed.view.dispatch(ed.state.tr.insert(0, ed.state.schema.nodes.paragraph!.create(null, ed.state.schema.text('haut'))))
    expect(classes(ed, 0)).toEqual(['notak-code-motCle'])
    expect(classes(ed, 1)).toEqual(['notak-code-motCle'])
    expect(ed.view.dom.querySelectorAll('pre')[1]!.querySelector('span')!.textContent).toBe('def')
  })
})
