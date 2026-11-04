// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { creerReseauLocal, definirLangue, ouvrirIndexLocal } from '@notak/tableau'
import { beforeEach, describe, expect, it } from 'vitest'
import { espaceIntact, espaceLocal, guideIntact, poserLeGuide, retirerLesGuidesIntacts } from './espace'

let n = 0
/** Un espace neuf, à lui seul (son préfixe), sans l'accueil que pose `espaceLocal`. */
async function neuf() {
  const prefixe = `guide${++n}:`
  const { index } = await ouvrirIndexLocal(prefixe)
  return { index, reseau: creerReseauLocal({ index, prefixe }) }
}
const note = (id: string) => ({ id, x: 0, y: 0, largeur: 10, contenu: { type: 'note', texte: { type: 'doc', content: [] } } })

describe('l’accueil et le guide de l’app', () => {
  beforeEach(() => definirLangue('fr'))

  it('un appareil neuf : l’accueil naît vide, à son nom, et l’espace est intact', async () => {
    const el = await espaceLocal()
    const accueil = await el.reseau.avec(el.index.racine(), (doc) => ({ titre: doc.getMap('meta').get('titre'), elements: doc.getMap('elements').size }))
    expect(accueil).toEqual({ titre: 'Accueil', elements: 0 })
    expect(await espaceIntact(el)).toBe(true)
  })

  it('le guide : une toile rangée dans l’accueil, faite du modèle des gestes ; resté tel quel, l’espace reste intact', async () => {
    const el = await neuf()
    const id = await poserLeGuide(el)
    expect(el.index.entree(id)).toMatchObject({ titre: 'Découvrir Notak', parent: el.index.racine() })
    expect(await el.reseau.avec(id, (doc) => doc.getMap('elements').size)).toBeGreaterThan(5)
    expect(await guideIntact(el, id)).toBe(true)
    expect(await espaceIntact(el)).toBe(true)
    // On y écrit : il compte.
    await el.reseau.avec(id, (doc) => doc.getMap('elements').set('neuve', note('neuve')))
    expect(await guideIntact(el, id)).toBe(false)
    expect(await espaceIntact(el)).toBe(false)
  })

  it('une autre toile, même vide, compte : seul un guide intact ne compte pas', async () => {
    const el = await neuf()
    el.index.declarer('autre', 'Autre', el.index.racine())
    expect(await espaceIntact(el)).toBe(false)
  })

  it('l’accueil qui s’en va emporte ses guides intacts, pas une toile où l’on a écrit', async () => {
    const el = await neuf()
    const racine = el.index.racine()
    const intact = await poserLeGuide(el)
    const touche = await poserLeGuide(el)
    await el.reseau.avec(touche, (doc) => doc.getMap('elements').set('neuve', note('neuve')))
    await retirerLesGuidesIntacts(el, racine)
    expect(el.index.entree(intact)).toBeUndefined()
    expect(el.index.entree(touche)).toBeDefined()
  })
})
