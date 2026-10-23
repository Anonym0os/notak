import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { CIBLE_FICHIER, CIBLE_TABLEAU, ErreurImport, blocs, cleDeRang, enLigne, lireExportMilanote, resoudre } from './milanote'

let n = 0
const id = () => `id${++n}`
const archive = (fichiers: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(fichiers).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])))

describe('le texte en ligne', () => {
  it('gras, italique, barré, code et lien deviennent des marques', () => {
    expect(enLigne('un **gras** et *penché* ~~fini~~ `code`')).toEqual([
      { type: 'text', text: 'un ' },
      { type: 'text', text: 'gras', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' et ' },
      { type: 'text', text: 'penché', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'fini', marks: [{ type: 'strike' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'code', marks: [{ type: 'code' }] },
    ])
    expect(enLigne('[le site](https://exemple.fr)')).toEqual([{ type: 'text', text: 'le site', marks: [{ type: 'link', attrs: { href: 'https://exemple.fr' } }] }])
  })

  it('les marques s’imbriquent ; un tiret bas dans un mot reste du texte', () => {
    expect(enLigne('**gras _et penché_**')[1]).toEqual({ type: 'text', text: 'et penché', marks: [{ type: 'bold' }, { type: 'italic' }] })
    expect(enLigne('snake_case_mot')).toEqual([{ type: 'text', text: 'snake_case_mot' }])
  })
})

describe('les blocs', () => {
  it('reconnaît titres, paragraphes, listes, citation, code et table', () => {
    const b = blocs(['# T', '', 'un', 'deux', '', '- a', '  - b', '- c', '', '> cité', '', '```js', 'x = 1', '```', '', '| A | B |', '|---|---|', '| 1 | 2 |'].join('\n'))
    expect(b.map((x) => x.genre)).toEqual(['titre', 'paragraphe', 'liste', 'citation', 'code', 'table'])
    expect(b[1]).toMatchObject({ lignes: ['un', 'deux'] })
    expect(b[2]).toMatchObject({ items: [{ niveau: 0, texte: 'a' }, { niveau: 1, texte: 'b' }, { niveau: 0, texte: 'c' }] })
    expect(b[4]).toMatchObject({ langue: 'js', texte: 'x = 1' })
    expect(b[5]).toMatchObject({ lignes: [['A', 'B'], ['1', '2']] })
  })

  it('une règle horizontale n’est pas un bloc', () => {
    expect(blocs('a\n\n---\n\nb').map((x) => x.genre)).toEqual(['paragraphe', 'paragraphe'])
  })
})

describe('les chemins', () => {
  it('se résolvent depuis le fichier qui les écrit', () => {
    expect(resoudre('Tableau/Tableau.md', 'img/a%20b.png')).toBe('Tableau/img/a b.png')
    expect(resoudre('Tableau/Sous/Sous.md', '../photo.jpg#x')).toBe('Tableau/photo.jpg')
    expect(resoudre('a.md', './b.md')).toBe('b.md')
  })
})

describe('lireExportMilanote', () => {
  it('un tableau simple : titre, colonnes, notes, tâches, lien, image, pièce jointe', () => {
    const md = [
      '# Voyage',
      '',
      'Une idée **forte**',
      '',
      '## À faire',
      '',
      '- [ ] billets',
      '- [x] visa',
      '',
      '## Liens',
      '',
      '[Le guide](https://exemple.fr/guide)',
      '',
      '![plage](media/plage.png)',
      '',
      '[programme](media/programme.pdf)',
    ].join('\n')
    const plan = lireExportMilanote(archive({ 'Voyage/Voyage.md': md, 'Voyage/media/plage.png': new Uint8Array([1, 2, 3]), 'Voyage/media/programme.pdf': new Uint8Array([4]), 'Voyage/media/inutile.png': new Uint8Array([9]) }), id)
    expect(plan.tableaux).toHaveLength(1)
    const t = plan.tableaux[0]!
    expect(t.titre).toBe('Voyage')
    const colonnes = t.elements.filter((e) => e.contenu.type === 'colonne')
    expect(colonnes.map((c) => (c.contenu as { titre: string }).titre)).toEqual(['À faire', 'Liens'])
    const libres = t.elements.filter((e) => !e.parent && e.contenu.type !== 'colonne')
    expect(libres).toMatchObject([{ contenu: { type: 'note' }, x: 5, y: 5 }])
    const dans = (c: number) => t.elements.filter((e) => e.parent === colonnes[c]!.id).sort((a, b) => (a.ordre! < b.ordre! ? -1 : 1))
    const taches = dans(0)[0]!.contenu as unknown as { type: string; texte: { content: { type: string; content: { attrs: { checked: boolean } }[] }[] } }
    expect(taches.type).toBe('taches')
    expect(taches.texte.content[0]).toMatchObject({ type: 'taskList' })
    expect(taches.texte.content[0]!.content.map((i) => i.attrs.checked)).toEqual([false, true])
    expect(dans(1).map((e) => e.contenu.type)).toEqual(['lien', 'image', 'fichier'])
    expect(dans(1)[0]!.contenu).toMatchObject({ url: 'https://exemple.fr/guide', titre: 'Le guide', statut: 'attente' })
    expect(dans(1)[1]!.contenu).toMatchObject({ fichier: `${CIBLE_FICHIER}Voyage/media/plage.png`, legende: 'plage', typeMime: 'image/png' })
    expect(dans(1)[2]!.contenu).toMatchObject({ nom: 'programme.pdf', titre: 'programme', typeMime: 'application/pdf', taille: 1 })
    // Seuls les fichiers cités partent.
    expect([...plan.fichiers.keys()].sort()).toEqual(['Voyage/media/plage.png', 'Voyage/media/programme.pdf'])
    expect(plan.avertissements).toEqual([])
  })

  it('des sous-tableaux : un lien vers un .md devient un renvoi, un fichier orphelin aussi', () => {
    const plan = lireExportMilanote(
      archive({
        'Projet.md': '# Projet\n\n[Détails](Projet/Détails.md)\n',
        'Projet/Détails.md': '# Détails\n\nTexte\n',
        'Autre.md': '# Autre\n\nseul\n',
      }),
      id,
    )
    expect(plan.tableaux.map((t) => t.titre)).toEqual(['Projet', 'Détails', 'Autre'])
    const renvois = plan.tableaux[0]!.elements.filter((e) => e.contenu.type === 'tableau').map((e) => (e.contenu as { cible: string }).cible)
    expect(renvois).toEqual([`${CIBLE_TABLEAU}Projet/Détails.md`, `${CIBLE_TABLEAU}Autre.md`])
    // Le renvoi de l'orphelin ne chevauche pas celui du premier.
    const [a, b] = plan.tableaux[0]!.elements.filter((e) => e.contenu.type === 'tableau')
    expect(b!.x).toBeGreaterThanOrEqual(a!.x + a!.largeur)
  })

  it('le titre vient du nom du fichier s’il n’a pas de titre ; une image absente reste une note et prévient', () => {
    const plan = lireExportMilanote(archive({ 'Idées.md': '![manquante](absent.png)\n' }), id)
    expect(plan.tableaux[0]!.titre).toBe('Idées')
    expect(plan.tableaux[0]!.elements.map((e) => e.contenu.type)).toEqual(['note'])
    expect(plan.avertissements[0]).toContain('absent.png')
  })

  it('ignore les restes du Finder', () => {
    const plan = lireExportMilanote(archive({ 'A.md': '# A\n\nx', '__MACOSX/._A.md': 'x', '.DS_Store': 'x' }), id)
    expect(plan.tableaux).toHaveLength(1)
  })

  it('refuse ce qui n’est pas une archive, ou une archive sans Markdown', () => {
    expect(() => lireExportMilanote(new Uint8Array([1, 2, 3]), id)).toThrow(ErreurImport)
    expect(() => lireExportMilanote(archive({ 'image.png': new Uint8Array([1]) }), id)).toThrow('Aucun fichier Markdown')
  })

  it('les clés de rang croissent sans fin', () => {
    const cles = Array.from({ length: 200 }, (_, i) => cleDeRang(i))
    expect([...cles].sort()).toEqual(cles)
    expect(cles.every((c) => !c.endsWith('0'))).toBe(true)
  })
})
