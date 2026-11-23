// @vitest-environment jsdom
import { getSchema } from '@tiptap/react'
import { Node as NoeudPM } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import { EXTENSIONS_NOTE } from '../elements/note/extensions'
import { EXTENSIONS_TACHES } from '../elements/taches/extensions'
import { LARGEUR_ARBRE as LARGEUR_ARBRE_APP } from '../elements/arbre'
import { LARGEUR_TABLE_DEPART } from '../elements/table/grille'
import { lireElement } from '../coeur/valider'
import type { NoeudTexte } from '../coeur/tableau'
import { SCHEMA_BLOCS } from '../blocs/schema'
import { idsManquants, nouvelIdBloc } from '../blocs/ids'
import { LARGEUR_DOCUMENT, LARGEUR_DOCUMENT_CARTE } from '../elements/document/texte'
import { nouvelleLigne } from '../elements/ligne/creation'
import { LARGEUR_ARBRE, LARGEUR_PAGE, LARGEUR_PAGE_CARTE, LARGEUR_TABLE, construire } from './poser.ts'
import { blocsDePage, docDePage, idDeBloc } from './texte.ts'

// La porte des agents du serveur (apps/serveur/src/agents.ts, docs/AGENTS.md) vit hors de ce paquet ; l'essai est ici,
// près des éditeurs dont il emploie les schémas. Ce que pose la porte doit être exactement ce que l'app sait ouvrir : le
// texte des notes et des listes passe le schéma de leurs éditeurs, chaque élément passe la validation de la toile, et les
// tailles sont les siennes.

const noteSchema = getSchema(EXTENSIONS_NOTE)
const tachesSchema = getSchema(EXTENSIONS_TACHES)

/** Les attributs et les marques qu'un schéma ne connaît pas : ProseMirror les oublierait sans rien dire. */
function inconnus(schema: typeof SCHEMA_BLOCS, n: NoeudTexte): string[] {
  const type = schema.nodes[n.type]
  if (!type) return [`nœud ${n.type}`]
  return [
    ...Object.keys(n.attrs ?? {}).flatMap((k) => (k in (type as unknown as { attrs: Record<string, unknown> }).attrs ? [] : [`${n.type}.${k}`])),
    ...(n.marks ?? []).flatMap((m) => (schema.marks[m.type] ? [] : [`marque ${m.type}`])),
    ...(n.content ?? []).flatMap((x) => inconnus(schema, x)),
  ]
}

describe('ce que pose la porte, tel que l’app le lit', () => {
  it('une note, un titre : un document que l’éditeur des notes accepte', () => {
    for (const d of [
      { type: 'note' as const, texte: '# Titre\n## Sous-titre\nUn **gras**, un _italique_, un ~~barré~~, [un lien](https://a.fr) et `du code`.\n- un\n  - deux\n1. premier\n> citation\n---\n```\nbloc\n```' },
      { type: 'titre' as const, texte: 'Un **titre**' },
      { type: 'note' as const, texte: '' },
    ]) {
      const e = construire(d, Date.now()).element
      const n = NoeudPM.fromJSON(noteSchema, e.contenu.texte)
      expect(() => n.check()).not.toThrow()
    }
  })

  it('une liste de tâches : un document que l’éditeur des listes accepte', () => {
    for (const taches of [[{ texte: 'Devis', faite: true }, { texte: 'Maquette **vite**' }], []]) {
      const e = construire({ type: 'taches', titre: 'À faire', taches }, Date.now()).element
      expect(() => NoeudPM.fromJSON(tachesSchema, e.contenu.texte).check()).not.toThrow()
    }
  })

  it('une page : des blocs à plat que le moteur des pages accepte, chacun avec un id qu’il garde', () => {
    const md = '# Titre\n## Sous-titre\n### Encore\nUn **gras**, un _italique_, un ~~barré~~, [un lien](https://a.fr), `du code` et www.crm.exemple.fr.\n- un\n  - deux\n  Un texte sous la puce\n1. premier\n- [ ] à faire\n- [x] fait\n> citation\n> suite\n---\n```js\nbloc\n```'
    const doc = docDePage(md)
    const n = NoeudPM.fromJSON(SCHEMA_BLOCS, doc)
    expect(() => n.check()).not.toThrow()
    expect(inconnus(SCHEMA_BLOCS, doc)).toEqual([])
    // Le moteur garde les ids posés : il n'en redonne à aucun bloc.
    expect(idsManquants(n)).toEqual([])
    expect(idDeBloc()).toMatch(/^[0-9a-z]{10}$/)
    expect(nouvelIdBloc()).toMatch(/^[0-9a-z]{10}$/)
    expect(() => NoeudPM.fromJSON(SCHEMA_BLOCS, docDePage('')).check()).not.toThrow()
    expect(blocsDePage('Un paragraphe')[0]!.attrs!.id).toMatch(/^[0-9a-z]{10}$/)
  })

  it('chaque élément passe la validation de la toile', () => {
    const neufs = [
      construire({ type: 'note', texte: 'x', couleur: 'jaune' }, Date.now()),
      construire({ type: 'titre', texte: 'x' }, Date.now()),
      construire({ type: 'taches', taches: [{ texte: 'x' }] }, Date.now()),
      construire({ type: 'lien', url: 'https://exemple.fr' }, Date.now()),
      construire({ type: 'table', lignes: [['a', 'b', 'c', 'd']] }, Date.now()),
      construire({ type: 'colonne', titre: 'C', elements: [{ type: 'note', texte: 'y' }] }, Date.now()),
      construire({ type: 'carte_mentale', central: 'C', branches: [{ titre: 'b', enfants: [{ titre: 'c' }] }] }, Date.now()),
      construire({ type: 'page', titre: 'Wilfried Robert', texte: '# Rendez-vous\n- Devis', couleur: 'bleu' }, Date.now()),
      construire({ type: 'page', titre: 'En vue carte', texte: '', apercu: true }, Date.now()),
      construire({ type: 'colonne', titre: 'C', elements: [{ type: 'page', titre: 'Dans la colonne' }] }, Date.now()),
    ]
    for (const n of neufs) {
      for (const e of [n.element, ...n.enfants]) expect(lireElement({ ...e, plan: 'V' }, e.id), JSON.stringify(e)).not.toBeNull()
    }
  })

  it('une ligne : les défauts de l’outil Ligne', () => {
    const { element } = construire({ type: 'ligne', de: 'a', vers: 'b' }, Date.now())
    const app = nouvelleLigne({ element: 'a' }, { element: 'b' })
    expect(element.contenu).toEqual(app.contenu)
    expect({ x: element.x, y: element.y, largeur: element.largeur }).toEqual({ x: app.x, y: app.y, largeur: app.largeur })
    expect(lireElement({ ...element, plan: 'V' }, element.id)).not.toBeNull()
    expect(construire({ type: 'ligne', de: 'a', vers: 'b', fleche: false, libelle: 'mène à' }, Date.now()).element.contenu).toMatchObject({ pointeArrivee: 'rien', libelle: 'mène à' })
  })

  it('les tailles sont celles de l’app', () => {
    expect(LARGEUR_ARBRE).toBe(LARGEUR_ARBRE_APP)
    expect(LARGEUR_TABLE).toBe(LARGEUR_TABLE_DEPART)
    expect(LARGEUR_PAGE).toBe(LARGEUR_DOCUMENT)
    expect(LARGEUR_PAGE_CARTE).toBe(LARGEUR_DOCUMENT_CARTE)
  })
})
