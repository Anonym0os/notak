// @vitest-environment jsdom
import { act, useRef } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bouton, BoutonIcone } from './Bouton'
import { Confirmation, Dialogue } from './Dialogue'
import { useFermeture } from './Popover'

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
})

const monter = (el: React.ReactElement) => act(() => racine.render(el))
const boite = () => hote.querySelector<HTMLDialogElement>('dialog')!
const touche = (cible: Element, key: string, extra: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
  act(() => void cible.dispatchEvent(e))
  return e
}

describe('le bouton commun', () => {
  it('est un bouton de 36 par défaut, 40 ou 30 selon la taille, avec sa variante', () => {
    monter(
      <>
        <Bouton>Un</Bouton>
        <Bouton taille="g" variante="principal">
          Deux
        </Bouton>
        <Bouton taille="p" variante="danger" disabled>
          Trois
        </Bouton>
      </>,
    )
    const [a, b, c] = [...hote.querySelectorAll('button')]
    expect([a!.type, a!.className]).toEqual(['button', 'notak-btn notak-btn-discret'])
    expect(b!.className).toBe('notak-btn notak-btn-g notak-btn-principal')
    expect(c!.className).toBe('notak-btn notak-btn-p notak-btn-danger')
    expect(c!.disabled).toBe(true)
  })

  it('le bouton à icône seule se dit par son aria-label', () => {
    monter(
      <>
        <BoutonIcone aria-label="Fermer" />
        <BoutonIcone aria-label="Gras" taille={30} aria-pressed />
        <BoutonIcone aria-label="Petit" taille={24} />
      </>,
    )
    expect([...hote.querySelectorAll('button')].map((b) => b.className)).toEqual(['notak-ic', 'notak-ic notak-ic-p', 'notak-ic notak-ic-pp'])
  })
})

describe('le dialogue commun', () => {
  it('est modal, nommé par son titre, avec une croix et ses actions', () => {
    monter(
      <Dialogue titre="Déplacer" fermer={() => {}} actions={<Bouton>Annuler</Bouton>}>
        <p>Contenu</p>
      </Dialogue>,
    )
    const d = boite()
    expect(d.getAttribute('role')).toBe('dialog')
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(d.getAttribute('aria-labelledby')).toBe(d.querySelector('h2')!.id)
    expect(d.querySelector('h2')!.textContent).toBe('Déplacer')
    expect(d.querySelector('.notak-dialogue-tete .notak-ic')!.getAttribute('aria-label')).toBe('Fermer')
    expect(d.querySelector('.notak-dialogue-actions')!.textContent).toBe('Annuler')
    expect(d.open).toBe(true)
  })

  it('se ferme à la croix, à Échap et à un clic sur le voile, pas à un clic dans la boîte', () => {
    const fermer = vi.fn()
    monter(
      <Dialogue titre="Titre" fermer={fermer}>
        <p>Contenu</p>
      </Dialogue>,
    )
    act(() => void hote.querySelector<HTMLElement>('.notak-dialogue-texte, p')!.click())
    expect(fermer).not.toHaveBeenCalled()
    act(() => void boite().click())
    expect(fermer).toHaveBeenCalledTimes(1)
    act(() => hote.querySelector<HTMLButtonElement>('.notak-dialogue-tete .notak-ic')!.click())
    expect(fermer).toHaveBeenCalledTimes(2)
    const echap = touche(hote.querySelector('p')!, 'Escape')
    expect(echap.defaultPrevented).toBe(true)
    expect(fermer).toHaveBeenCalledTimes(3)
  })

  it('sans `fermer`, ni croix ni Échap ni voile : un tableau verrouillé ne se quitte pas', () => {
    monter(
      <Dialogue titre="Protégé">
        <input aria-label="Mot de passe" />
      </Dialogue>,
    )
    expect(hote.querySelector('.notak-dialogue-tete .notak-ic')).toBeNull()
    touche(hote.querySelector('input')!, 'Escape')
    act(() => void boite().click())
    expect(boite().isConnected).toBe(true)
  })

  it('Échap fait ce que `echap` dit, et `occupe` gèle tout', () => {
    const fermer = vi.fn()
    const echap = vi.fn()
    monter(
      <Dialogue etiquette="Réglages" fermer={fermer} echap={echap}>
        <input aria-label="Chercher" />
      </Dialogue>,
    )
    expect(boite().getAttribute('aria-label')).toBe('Réglages')
    touche(hote.querySelector('input')!, 'Escape')
    expect(echap).toHaveBeenCalledOnce()
    expect(fermer).not.toHaveBeenCalled()
    monter(
      <Dialogue titre="Export" fermer={fermer} occupe>
        <input aria-label="Chercher" />
      </Dialogue>,
    )
    touche(hote.querySelector('input')!, 'Escape')
    act(() => void boite().click())
    expect(fermer).not.toHaveBeenCalled()
    expect(hote.querySelector<HTMLButtonElement>('.notak-dialogue-tete .notak-ic')!.disabled).toBe(true)
  })

  it('le focus entre dans la boîte (un autoFocus d’abord, sinon le premier champ), tourne avec Tab et revient à l’ouvreur', () => {
    const ouvreur = document.createElement('button')
    document.body.append(ouvreur)
    ouvreur.focus()
    monter(
      <Dialogue titre="Titre" fermer={() => {}} actions={<Bouton>Valider</Bouton>}>
        <button type="button">Un</button>
        <input aria-label="Nom" />
      </Dialogue>,
    )
    expect(document.activeElement).toBe(hote.querySelector('input'))
    // jsdom ne met pas en page : rien n'a d'`offsetParent`, sauf l'élément qui a le focus.
    const valider = [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Valider')!
    valider.focus()
    expect(touche(valider, 'Tab').defaultPrevented).toBe(true)
    act(() => racine.render(<></>))
    expect(document.activeElement).toBe(ouvreur)
    ouvreur.remove()
  })

  it('un autoFocus du contenu prend le focus, même si le dialogue s’ouvre après', () => {
    monter(
      <Dialogue titre="Titre" fermer={() => {}}>
        <input aria-label="Premier" />
        <input aria-label="Deuxième" autoFocus />
      </Dialogue>,
    )
    expect(document.activeElement).toBe(hote.querySelector('input[aria-label="Deuxième"]'))
  })

  it('la confirmation : Annuler, la croix et Échap disent non, l’action dit oui', () => {
    const repondre = vi.fn()
    monter(<Confirmation titre="Effacer pour de bon ?" texte="Plus de retour." oui="Effacer" repondre={repondre} />)
    expect(boite().getAttribute('role')).toBe('alertdialog')
    const oui = [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Effacer')!
    expect(oui.className).toContain('notak-btn-danger')
    expect(document.activeElement).toBe(oui)
    act(() => oui.click())
    expect(repondre).toHaveBeenLastCalledWith(true)
    act(() => [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Annuler')!.click())
    expect(repondre).toHaveBeenLastCalledWith(false)
    touche(oui, 'Escape')
    expect(repondre).toHaveBeenLastCalledWith(false)
    expect(repondre).toHaveBeenCalledTimes(3)
  })
})

describe('la fermeture d’un popover', () => {
  function Fenetre({ fermer, ancre }: { fermer(): void; ancre?: HTMLElement }) {
    const ref = useRef<HTMLDivElement>(null)
    useFermeture({ racine: ref, ancre, fermer })
    return <div ref={ref} id="fenetre" />
  }

  it('un appui dehors ou Échap la ferme ; un appui dedans ou sur son bouton non', () => {
    const fermer = vi.fn()
    const bouton = document.createElement('button')
    document.body.append(bouton)
    monter(<Fenetre fermer={fermer} ancre={bouton} />)
    const appui = (c: Element) => act(() => void c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    appui(hote.querySelector('#fenetre')!)
    appui(bouton)
    expect(fermer).not.toHaveBeenCalled()
    appui(document.body)
    expect(fermer).toHaveBeenCalledTimes(1)
    expect(touche(document.body, 'Escape').defaultPrevented).toBe(true)
    expect(fermer).toHaveBeenCalledTimes(2)
    bouton.remove()
  })

  it('un dialogue ouvert par-dessus a ses propres appuis et son propre Échap', () => {
    const fermer = vi.fn()
    monter(
      <>
        <Fenetre fermer={fermer} />
        <Dialogue titre="Dessus" fermer={() => {}}>
          <input aria-label="Nom" />
        </Dialogue>
      </>,
    )
    act(() => void hote.querySelector('input')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    touche(hote.querySelector('input')!, 'Escape')
    expect(fermer).not.toHaveBeenCalled()
  })
})
