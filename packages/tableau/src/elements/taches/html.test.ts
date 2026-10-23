// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import { htmlEnTaches } from './html'

/** Le plan d'une suite de tâches : un texte, suivi du tableau de ses sous-tâches. */
type Plan = (string | Plan)[]
function plan(taches: NoeudTexte[] | null): Plan | null {
  if (!taches) return null
  return taches.flatMap((t): Plan => {
    const texte = t.content![0]!.content?.[0]?.text ?? ''
    const sous = t.content![1]?.content
    return sous ? [texte, plan(sous)!] : [texte]
  })
}

describe('htmlEnTaches', () => {
  it('une puce devient une tâche, une sous-liste ses sous-tâches', () => {
    const html = '<ul><li>Acheter</li><li>Écrire<ul><li>le plan</li><li>le texte</li></ul></li><li>Envoyer</li></ul>'
    expect(plan(htmlEnTaches(html))).toEqual(['Acheter', 'Écrire', ['le plan', 'le texte'], 'Envoyer'])
  })

  it('traverse l’enveloppe de Google Docs et ses paragraphes dans les puces', () => {
    const html =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234">' +
      '<ul style="margin-top:0"><li dir="ltr" aria-level="1"><p dir="ltr"><span style="font-size:11pt">Premier</span></p></li>' +
      '<li dir="ltr" aria-level="1"><p dir="ltr"><span>Deuxième</span></p></li></ul></b>'
    expect(plan(htmlEnTaches(html))).toEqual(['Premier', 'Deuxième'])
  })

  it('une tâche par paragraphe, la mise en forme s’en va', () => {
    const html = '<h2>Titre</h2><p>un <strong>deux</strong> <a href="x">trois</a></p><div>quatre</div><p><br></p>'
    expect(plan(htmlEnTaches(html))).toEqual(['Titre', 'un deux trois', 'quatre'])
  })

  it('lit la case cochée d’une puce', () => {
    const taches = htmlEnTaches('<ul><li><input type="checkbox" checked> fait</li><li><input type="checkbox"> à faire</li></ul>')!
    expect(taches.map((t) => [t.content![0]!.content![0]!.text, t.attrs!.checked])).toEqual([[' fait'.trim(), true], ['à faire', false]])
  })

  it('une seule ligne se colle comme du texte, une seule puce devient une tâche', () => {
    expect(htmlEnTaches('<p>juste une phrase</p>')).toBeNull()
    expect(htmlEnTaches('juste une phrase <b>en gras</b>')).toBeNull()
    expect(plan(htmlEnTaches('<ul><li>seule</li></ul>'))).toEqual(['seule'])
  })

  it('un HTML vide ou sans texte ne donne rien', () => {
    expect(htmlEnTaches('')).toBeNull()
    expect(htmlEnTaches('<style>p{}</style><p> </p>')).toBeNull()
  })

  it('une puce vide qui porte des sous-puces reste une tâche', () => {
    expect(plan(htmlEnTaches('<ol><li><ul><li>a</li></ul></li><li>b</li></ol>'))).toEqual(['', ['a'], 'b'])
  })

  it('s’arrête au sixième niveau : les sous-tâches plus profondes remontent à côté', () => {
    let html = '<li>7</li>'
    for (let n = 6; n >= 1; n--) html = `<li>${n}<ul>${html}</ul></li>`
    const taches = htmlEnTaches(`<ul>${html}</ul>`)!
    expect(plan(taches)).toEqual(['1', ['2', ['3', ['4', ['5', ['6', '7']]]]]])
  })
})
