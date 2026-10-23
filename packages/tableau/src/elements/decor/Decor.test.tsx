// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import { type Element, annoter, nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import '../note'
import '../commentaire'
import './index'
import { Decor, Pastille } from './Decor'
import { PanneauEtiquettes } from './Etiquettes'
import { OutilEtiquettes, OutilReactions } from './Outils'
import { OutilsCommentaire } from '../commentaire/Commentaire'
import { nouveauCommentaire } from '../commentaire/fil'
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

describe('une pastille d’étiquette sur la carte', () => {
  const puce = () => hote.querySelector<HTMLElement>('.notak-etiquette')!
  const touche = (n: HTMLElement, key: string) => act(() => void n.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
  it('se choisit d’un clic, se retire avec Suppr', () => {
    const { contexte, element } = monde({ etiquettes: ['e1'] })
    act(() => racine.render(<Decor element={element()} contexte={contexte} mode="toile" />))
    act(() => puce().click())
    expect(puce().hasAttribute('data-choisie')).toBe(true)
    touche(puce(), 'Delete')
    expect(element().etiquettes).toBeUndefined()
  })
  it('Échap la lâche sans rien changer', () => {
    const { contexte, element } = monde({ etiquettes: ['e1'] })
    act(() => racine.render(<Decor element={element()} contexte={contexte} mode="toile" />))
    act(() => puce().click())
    touche(puce(), 'Escape')
    expect(puce().hasAttribute('data-choisie')).toBe(false)
    expect(element().etiquettes).toEqual(['e1'])
  })
  it('se renomme sur place avec Entrée, pour tout le tableau', () => {
    const { contexte, element, magasin } = monde({ etiquettes: ['e1'] })
    act(() => racine.render(<Decor element={element()} contexte={contexte} mode="toile" />))
    act(() => puce().click())
    touche(puce(), 'Enter')
    const champ = hote.querySelector<HTMLInputElement>('.notak-etiquette input')!
    expect(champ.value).toBe('Urgent')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'À faire')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    touche(champ, 'Enter')
    expect(magasin.lire().etiquettes?.[0]?.nom).toBe('À faire')
    expect(hote.querySelector('.notak-etiquette input')).toBeNull()
  })
  it('en lecture seule, elle n’est qu’un texte', () => {
    const { contexte, element } = monde({ etiquettes: ['e1'] }, true)
    act(() => racine.render(<Decor element={element()} contexte={contexte} mode="toile" />))
    expect(puce().getAttribute('role')).toBeNull()
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
  const ecrireDans = (texte: string) => {
    const champ = hote.querySelector<HTMLInputElement>('.notak-etiquettes-recherche')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, texte)
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const entree = () => act(() => hote.querySelector('.notak-etiquettes-recherche')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))

  it('crée une étiquette et la pose sur la sélection d’un seul pas', () => {
    const { contexte, element, magasin } = monde()
    act(() => racine.render(<PanneauEtiquettes elements={[element()]} contexte={contexte} />))
    ecrireDans('À relire')
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

  it('Entrée crée l’étiquette et la pose, puis pose celle qui existe déjà sans la doubler', () => {
    const { contexte, element, magasin } = monde()
    act(() => racine.render(<PanneauEtiquettes elements={[element()]} contexte={contexte} />))
    ecrireDans('Idée')
    entree()
    expect(magasin.lire().etiquettes?.map((e) => e.nom)).toEqual(['Urgent', 'Idée'])
    expect(element().etiquettes).toHaveLength(1)
    act(() => racine.render(<PanneauEtiquettes elements={[element()]} contexte={contexte} />))
    ecrireDans('urgent')
    entree()
    expect(magasin.lire().etiquettes).toHaveLength(2)
    expect(element().etiquettes).toHaveLength(2)
  })

  it('cherche dans la liste, et dit quand rien ne correspond', () => {
    const { contexte } = monde()
    act(() => racine.render(<PanneauEtiquettes elements={[]} contexte={contexte} />))
    expect(hote.querySelectorAll('.notak-etiquettes-ligne')).toHaveLength(1)
    expect(hote.textContent).toContain('Récemment créées')
    ecrireDans('zzz')
    expect(hote.querySelectorAll('.notak-etiquettes-ligne')).toHaveLength(0)
    expect(hote.querySelector('.notak-etiquettes-creer')?.textContent).toContain('Créer « zzz »')
  })

  it('supprimer une étiquette la retire des éléments, et l’annulation les lui rend', () => {
    const { contexte, element, magasin } = monde({ etiquettes: ['e1'] })
    act(() => racine.render(<PanneauEtiquettes elements={[]} contexte={contexte} />))
    act(() => bouton('Options de').click())
    act(() => [...hote.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find((b) => b.textContent === 'Supprimer')!.click())
    // Une confirmation d'abord : rien n'est supprimé avant elle.
    expect(magasin.lire().etiquettes).toHaveLength(1)
    act(() => [...hote.querySelectorAll<HTMLButtonElement>('.notak-etiquettes-confirmer button')].find((b) => b.textContent === 'Supprimer')!.click())
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
    act(() => bouton('Options de').click())
    act(() => bouton('Utilisée 0 fois').click())
    expect([...vu]).toEqual(['e1'])
    act(() => bouton('Tout montrer').click())
    expect(vu.size).toBe(0)
    act(() => basculerFiltre('e1'))
    expect(vu.size).toBe(1)
  })

  it('en lecture seule, on ne crée ni ne supprime : on filtre', () => {
    const { contexte } = monde({}, true)
    act(() => racine.render(<PanneauEtiquettes elements={[]} contexte={contexte} />))
    expect(hote.querySelector('.notak-etiquettes-recherche')).toBeNull()
    act(() => bouton('Options de').click())
    expect([...hote.querySelectorAll('[role=menuitem]')].map((b) => b.textContent)).toEqual(['Utilisée 0 fois'])
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
  const monter = (posees?: Set<string>) => {
    const choisis: string[] = []
    act(() => racine.render(<SelecteurEmojis choisir={(e) => choisis.push(e)} {...(posees ? { posees } : {})} />))
    return choisis
  }
  const boutons = () => [...hote.querySelectorAll<HTMLButtonElement>('.notak-emojis-grille button')]
  const grille = (section: string) => [...hote.querySelectorAll<HTMLButtonElement>(`[data-section="${section}"] .notak-emojis-grille button`)].map((b) => b.textContent)
  const ecrire = (texte: string) => {
    const champ = hote.querySelector<HTMLInputElement>('input.notak-emojis-recherche')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, texte)
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('ouvre sur les vingt-quatre fréquents, puis les neuf groupes d’Unicode', () => {
    localStorage.clear()
    monter()
    expect(grille('frequents')).toEqual(['👍', '👎', '😊', '😀', '🙂', '🤔', '😍', '😞'])
    expect([...hote.querySelectorAll('[role="tab"]')].map((b) => b.getAttribute('data-categorie'))).toEqual(['frequents', '0', '1', '2', '3', '4', '5', '6', '7', '8'])
    expect(grille('3')).toContain('🍕')
    expect(grille('8')).toContain('🇫🇷')
    expect(boutons().length).toBeGreaterThan(1800)
  })

  it('cherche par nom ou mot-clé, en français ou en anglais, sans accent ni casse', () => {
    monter()
    ecrire('FÊTE')
    expect(boutons().map((b) => b.textContent)).toContain('🥳')
    ecrire('pizza')
    expect(boutons().map((b) => b.textContent)).toContain('🍕')
    ecrire('zzzzqqq')
    expect(hote.querySelector('.notak-emojis-vide')?.textContent).toContain('😔')
  })

  it('compte chaque choix : le plus employé passe en tête des fréquents', () => {
    localStorage.clear()
    const choisis = monter()
    for (let i = 0; i < 5; i++) act(() => boutons().find((b) => b.textContent === '🍕' && b.closest('[data-section="3"]'))!.click())
    expect(choisis).toEqual(['🍕', '🍕', '🍕', '🍕', '🍕'])
    expect(grille('frequents')[0]).toBe('🍕')
  })

  it('applique la teinte de peau choisie aux émojis qui en ont, et la retient', () => {
    localStorage.clear()
    monter()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-emojis-teinte-lien')!.click())
    act(() => hote.querySelectorAll<HTMLButtonElement>('.notak-emojis-teintes button')[3]!.click())
    expect(grille('1')).toContain('👋🏽')
    expect(localStorage.getItem('notak:emojis-teinte')).toBe('3')
  })

  it('surligne les émojis que j’ai déjà posés', () => {
    monter(new Set(['🍕']))
    const pizza = boutons().find((b) => b.textContent === '🍕')!
    expect(pizza.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('un fil de commentaires choisi', () => {
  it('ne propose ni étiquettes ni réactions, et se colore d’une bande', () => {
    const { contexte, magasin } = monde()
    const fil = nouveauCommentaire(40, 0)
    magasin.faire([{ type: 'creer', element: fil }])
    const el = () => magasin.lire().elements.find((e) => e.id === fil.id)!
    act(() => racine.render(<OutilEtiquettes elements={[el()]} contexte={contexte} />))
    expect(hote.querySelector('button')).toBeNull()
    act(() => racine.render(<OutilReactions elements={[el()]} contexte={contexte} />))
    expect(hote.querySelector('button')).toBeNull()
    const rendre = () => act(() => racine.render(<OutilsCommentaire elements={[el()] as never} contexte={contexte} />))
    rendre()
    act(() => bouton('Couleur').click())
    act(() => bouton('Rouge').click())
    expect(el().contenu).toMatchObject({ couleur: 'rouge' })
    rendre()
    act(() => bouton('Couleur').click())
    act(() => bouton('Aucune').click())
    expect('couleur' in el().contenu).toBe(false)
  })
})

it('annoter ne rend rien quand rien ne change', () => {
  expect(annoter(nouvelleNote(0, 0), { echeance: null })).toBeNull()
})
