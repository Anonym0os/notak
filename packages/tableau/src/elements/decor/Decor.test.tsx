// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import { type Element, annoter, nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import '../note'
import './index'
import { Decor, Pastille } from './Decor'
import { PanneauEtiquettes } from './Etiquettes'
import { OutilReactions } from './Outils'
import { SelecteurEmojis } from './SelecteurEmojis'
import { basculerFiltre, useFiltre, viderFiltre } from './etat'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  viderFiltre()
})

function monde(plus: Partial<Element> = {}, lectureSeule = false) {
  const note: Element = { ...nouvelleNote(0, 0, 'Une idée'), ...plus }
  const magasin = creerMagasin({ titre: '', etiquettes: [{ id: 'e1', nom: 'Urgent', couleur: 'rouge' }], elements: [note] })
  const contexte = {
    magasin,
    services: { lectureSeule, presence: { moi: () => ({ id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }), autres: () => [], ecouter: () => () => {}, signaler() {} } },
  } as unknown as ContexteToile
  const element = () => magasin.lire().elements[0]!
  return { magasin, contexte, element }
}

const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.includes(texte) || b.getAttribute('aria-label')?.includes(texte))!

describe('la bande sous une carte', () => {
  it('ne dessine rien sans étiquette, échéance ni réaction', () => {
    const { contexte, element } = monde()
    act(() => racine.render(<Decor element={element()} contexte={contexte} mode="toile" />))
    expect(hote.querySelector('.notak-decor')).toBeNull()
  })

  it('montre l’étiquette, l’échéance, la personne et le compte des réactions', () => {
    const { contexte, element } = monde({
      etiquettes: ['e1'],
      echeance: '2020-01-02',
      assigne: { id: 'bob', nom: 'Bob Martin' },
      reactions: { '👍': ['ana', 'bob'], '🎉': ['bob'] },
    })
    act(() => racine.render(<Decor element={element()} contexte={contexte} mode="toile" />))
    expect(hote.querySelector('.notak-etiquette')?.textContent).toBe('Urgent')
    expect(hote.querySelector('.notak-echeance')?.getAttribute('data-etat')).toBe('passee')
    expect(hote.querySelector('.notak-assigne')?.textContent).toBe('BM')
    const r = [...hote.querySelectorAll('.notak-reaction')]
    expect(r.map((x) => x.textContent?.trim())).toEqual(['👍2', '🎉1'])
    expect(r.map((x) => x.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
  })

  it('un clic sur son émoji retire sa réaction, sur celui d’un autre l’ajoute', () => {
    const { contexte, element, magasin } = monde({ reactions: { '👍': ['ana', 'bob'], '🎉': ['bob'] } })
    const rendre = () => act(() => racine.render(<Decor element={element()} contexte={contexte} mode="liste" />))
    rendre()
    act(() => bouton('👍').click())
    expect(element().reactions).toEqual({ '👍': ['bob'], '🎉': ['bob'] })
    rendre()
    act(() => bouton('🎉').click())
    expect(element().reactions?.['🎉']).toEqual(['bob', 'ana'])
    magasin.annuler()
    expect(element().reactions?.['🎉']).toEqual(['bob'])
  })

  it('en lecture seule, les réactions se lisent mais ne se changent pas', () => {
    const { contexte, element } = monde({ reactions: { '👍': ['bob'] } }, true)
    act(() => racine.render(<Decor element={element()} contexte={contexte} mode="toile" />))
    expect(bouton('👍').getAttribute('aria-disabled')).toBe('true')
    act(() => bouton('👍').click())
    expect(element().reactions).toEqual({ '👍': ['bob'] })
  })

  it('le fil accroché s’ouvre, reçoit un message signé et dissout un fil vidé', () => {
    const { contexte, element } = monde({ commentaire: { type: 'commentaire', messages: [{ id: 'm1', auteur: { id: 'bob', nom: 'Bob' }, date: Date.now(), texte: 'Bonjour' }] } })
    const rendre = () => act(() => racine.render(<Decor element={element()} contexte={contexte} mode="toile" />))
    rendre()
    expect(bouton('1').querySelector('svg.notak-ico')).not.toBeNull()
    act(() => bouton('1').click())
    expect(hote.querySelector('.notak-fil-attache')).not.toBeNull()
    expect(hote.textContent).toContain('Bonjour')
    const champ = hote.querySelector('textarea')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(champ, 'Merci')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => bouton('Envoyer').click())
    expect(element().commentaire?.messages.map((m) => [m.auteur.nom, m.texte])).toEqual([
      ['Bob', 'Bonjour'],
      ['Ana Dupont', 'Merci'],
    ])
  })
})

describe('l’icône', () => {
  it('replie l’élément en son glyphe et son résumé', () => {
    const { contexte, element } = monde({ affichage: 'icone' })
    act(() => racine.render(<Pastille element={element()} contexte={contexte} />))
    expect(hote.querySelector('.notak-icone-texte')?.textContent).toBe('Une idée')
  })
})

describe('le panneau des étiquettes', () => {
  it('crée une étiquette et la pose sur la sélection d’un seul pas', () => {
    const { contexte, element, magasin } = monde()
    act(() => racine.render(<PanneauEtiquettes elements={[element()]} contexte={contexte} />))
    const champ = hote.querySelector<HTMLInputElement>('input[aria-label="Nom de la nouvelle étiquette"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'À relire')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => bouton('Créer').click())
    expect(magasin.lire().etiquettes?.map((e) => e.nom)).toEqual(['Urgent', 'À relire'])
    expect(element().etiquettes).toEqual([magasin.lire().etiquettes![1]!.id])
    magasin.annuler()
    expect(magasin.lire().etiquettes).toHaveLength(1)
    expect(element().etiquettes).toBeUndefined()
  })

  it('pose puis retire une étiquette existante avec sa case', () => {
    const { contexte, element } = monde()
    const rendre = () => act(() => racine.render(<PanneauEtiquettes elements={[element()]} contexte={contexte} />))
    rendre()
    act(() => hote.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
    expect(element().etiquettes).toEqual(['e1'])
    rendre()
    act(() => hote.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
    expect(element().etiquettes).toBeUndefined()
  })

  it('supprimer une étiquette la retire des éléments, et l’annulation les lui rend', () => {
    const { contexte, element, magasin } = monde({ etiquettes: ['e1'] })
    act(() => racine.render(<PanneauEtiquettes elements={[]} contexte={contexte} />))
    act(() => bouton('Supprimer').click())
    expect(magasin.lire().etiquettes).toBeUndefined()
    expect(element().etiquettes).toBeUndefined()
    magasin.annuler()
    expect(magasin.lire().etiquettes).toHaveLength(1)
    expect(element().etiquettes).toEqual(['e1'])
  })

  it('le filtre s’allume et s’éteint', () => {
    const { contexte } = monde()
    let vu = new Set<string>()
    function Sonde() {
      vu = new Set(useFiltre())
      return null
    }
    act(() => racine.render(<><PanneauEtiquettes elements={[]} contexte={contexte} /><Sonde /></>))
    act(() => bouton('Filtrer par').click())
    expect([...vu]).toEqual(['e1'])
    act(() => bouton('Tout montrer').click())
    expect(vu.size).toBe(0)
    act(() => basculerFiltre('e1'))
    expect(vu.size).toBe(1)
  })

  it('en lecture seule, on ne crée ni ne supprime : on filtre', () => {
    const { contexte } = monde({}, true)
    act(() => racine.render(<PanneauEtiquettes elements={[]} contexte={contexte} />))
    expect(hote.querySelector('form')).toBeNull()
    expect(hote.querySelector('[aria-label^="Supprimer"]')).toBeNull()
    expect(bouton('Filtrer par')).toBeDefined()
  })
})

describe('l’outil Réagir', () => {
  it('pose l’émoji sur toute la sélection, puis le retire quand tous l’ont', () => {
    const { contexte, magasin } = monde()
    const b = nouvelleNote(40, 0, 'Autre')
    magasin.faire([{ type: 'creer', element: b }])
    const choisis = () => magasin.lire().elements
    const rendre = () => act(() => racine.render(<OutilReactions elements={choisis()} contexte={contexte} />))
    rendre()
    act(() => bouton('Réagir').click())
    act(() => bouton('Réagir avec 🔥').click())
    expect(choisis().map((e) => e.reactions)).toEqual([{ '🔥': ['ana'] }, { '🔥': ['ana'] }])
    // La fenêtre reste ouverte après le choix : le même clic le retire.
    rendre()
    act(() => bouton('Réagir avec 🔥').click())
    expect(choisis().every((e) => e.reactions === undefined)).toBe(true)
  })
  it('si l’un des éléments l’a déjà, on ne fait que le retirer de ceux qui l’ont', () => {
    const { contexte, magasin } = monde({ reactions: { '🔥': ['ana'] } })
    magasin.faire([{ type: 'creer', element: nouvelleNote(40, 0, 'Autre') }])
    const choisis = () => magasin.lire().elements
    act(() => racine.render(<OutilReactions elements={choisis()} contexte={contexte} />))
    act(() => bouton('Réagir').click())
    act(() => bouton('Réagir avec 🔥').click())
    expect(choisis().map((e) => e.reactions)).toEqual([undefined, undefined])
  })
})

describe('le sélecteur d’émojis', () => {
  const monter = () => {
    const choisis: string[] = []
    act(() => racine.render(<SelecteurEmojis choisir={(e) => choisis.push(e)} />))
    return choisis
  }
  const grille = () => [...hote.querySelectorAll<HTMLButtonElement>('.notak-emojis-grille button')].map((b) => b.textContent)

  it('ouvre sur les fréquents, avec des catégories et une recherche', () => {
    localStorage.clear()
    monter()
    expect(grille()).toEqual(['👍', '❤️', '😂', '🎉', '👀', '✅', '🙏', '🔥'])
    expect([...hote.querySelectorAll('[role="tab"]')].map((b) => b.getAttribute('data-categorie'))).toEqual([
      'frequents', 'visages', 'gestes', 'symboles', 'nature', 'nourriture', 'activites', 'objets',
    ])
    act(() => hote.querySelector<HTMLButtonElement>('[data-categorie="nourriture"]')!.click())
    expect(grille()).toContain('🍕')
    expect(grille().length).toBeGreaterThan(8)
  })

  it('cherche par mot, sans accent ni casse', () => {
    monter()
    const champ = hote.querySelector<HTMLInputElement>('input')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'FÊTE')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(grille()).toContain('🥳')
    expect(hote.querySelector('[role="tab"]')).toBeNull()
  })

  it('retient le dernier choisi en tête des fréquents', () => {
    localStorage.clear()
    const choisis = monter()
    act(() => hote.querySelector<HTMLButtonElement>('[data-categorie="nourriture"]')!.click())
    act(() => [...hote.querySelectorAll<HTMLButtonElement>('.notak-emojis-grille button')].find((b) => b.textContent === '🍕')!.click())
    expect(choisis).toEqual(['🍕'])
    act(() => hote.querySelector<HTMLButtonElement>('[data-categorie="frequents"]')!.click())
    expect(grille()[0]).toBe('🍕')
  })
})

it('annoter ne rend rien quand rien ne change', () => {
  expect(annoter(nouvelleNote(0, 0), { echeance: null })).toBeNull()
})
