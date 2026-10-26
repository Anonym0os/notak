// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Calendrier } from './Calendrier'
import { ChoixHeure } from './ChoixHeure'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})
function monter(noeud: ReactElement) {
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const racine = createRoot(hote)
  racines.push(racine)
  act(() => racine.render(noeud))
  return hote
}
const clic = (e: Element) => act(() => void e.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const touche = (e: Element, key: string) => act(() => void e.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
const jour = (h: HTMLElement, iso: string) => h.querySelector<HTMLButtonElement>(`[data-jour="${iso}"]`)!

describe('le calendrier', () => {
  it('montre le mois du jour choisi, six semaines, les jours voisins masqués', () => {
    const h = monter(<Calendrier valeur="2026-10-14" aujourdhui="2026-10-26" choisir={() => {}} />)
    expect(h.querySelector('.notak-cal-mois')!.textContent).toBe('octobre 2026')
    expect(h.querySelectorAll('.notak-cal-jour')).toHaveLength(31)
    expect(h.querySelectorAll('.notak-cal-grille > *')).toHaveLength(7 + 42)
    expect(jour(h, '2026-10-14').getAttribute('aria-pressed')).toBe('true')
    expect(jour(h, '2026-10-26').hasAttribute('data-aujourdhui')).toBe(true)
  })

  it('un clic choisit ; les flèches changent de mois', () => {
    const choisir = vi.fn()
    const h = monter(<Calendrier valeur={null} aujourdhui="2026-10-26" choisir={choisir} />)
    clic(jour(h, '2026-10-03'))
    expect(choisir).toHaveBeenLastCalledWith('2026-10-03')
    clic(h.querySelector('[aria-label="Mois suivant"]')!)
    expect(h.querySelector('.notak-cal-mois')!.textContent).toBe('novembre 2026')
    clic(h.querySelector('[aria-label="Mois précédent"]')!)
    clic(h.querySelector('[aria-label="Mois précédent"]')!)
    expect(h.querySelector('.notak-cal-mois')!.textContent).toBe('septembre 2026')
  })

  it('effacable : le jour déjà choisi s’efface ; min : les jours d’avant se grisent, sauf le choisi', () => {
    const choisir = vi.fn()
    const h = monter(<Calendrier valeur="2026-10-10" aujourdhui="2026-10-26" min="2026-10-26" effacable choisir={choisir} />)
    expect(jour(h, '2026-10-12').disabled).toBe(true)
    expect(jour(h, '2026-10-10').disabled).toBe(false)
    expect(jour(h, '2026-10-26').disabled).toBe(false)
    clic(jour(h, '2026-10-10'))
    expect(choisir).toHaveBeenLastCalledWith(null)
    clic(jour(h, '2026-10-12'))
    expect(choisir).toHaveBeenCalledTimes(1)
  })

  it('au clavier : les flèches vont de jour en jour (et de mois en mois), Entrée choisit', () => {
    const choisir = vi.fn()
    const h = monter(<Calendrier valeur="2026-10-30" aujourdhui="2026-10-26" choisir={choisir} autoFocus />)
    expect(document.activeElement).toBe(jour(h, '2026-10-30'))
    touche(document.activeElement!, 'ArrowRight')
    touche(document.activeElement!, 'ArrowRight')
    expect(h.querySelector('.notak-cal-mois')!.textContent).toBe('novembre 2026')
    expect(document.activeElement).toBe(jour(h, '2026-11-01'))
    touche(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(jour(h, '2026-11-08'))
    touche(document.activeElement!, 'ArrowLeft')
    touche(document.activeElement!, 'ArrowUp')
    expect(document.activeElement).toBe(jour(h, '2026-10-31'))
    touche(document.activeElement!, 'Enter')
    expect(choisir).toHaveBeenLastCalledWith('2026-10-31')
    touche(document.activeElement!, 'PageDown')
    expect(document.activeElement).toBe(jour(h, '2026-11-30'))
  })

  it('Entrée et les flèches ne remontent pas, Échap oui (la fenêtre qui porte le calendrier le prend)', () => {
    const surTouche = vi.fn()
    const h = monter(
      <div onKeyDown={(e) => surTouche(e.key)}>
        <Calendrier valeur="2026-10-14" aujourdhui="2026-10-26" choisir={() => {}} autoFocus />
      </div>,
    )
    touche(jour(h, '2026-10-14'), 'ArrowRight')
    touche(document.activeElement!, 'Enter')
    touche(document.activeElement!, 'Escape')
    expect(surTouche.mock.calls).toEqual([['Escape']])
  })

  it('Entrée sur le jour déjà choisi confirme, quand on le demande', () => {
    const confirmer = vi.fn()
    const choisir = vi.fn()
    const h = monter(<Calendrier valeur="2026-10-14" aujourdhui="2026-10-26" choisir={choisir} confirmer={confirmer} />)
    touche(jour(h, '2026-10-14'), 'Enter')
    expect(confirmer).toHaveBeenCalledTimes(1)
    expect(choisir).not.toHaveBeenCalled()
    touche(jour(h, '2026-10-15'), 'Enter')
    expect(choisir).toHaveBeenLastCalledWith('2026-10-15')
  })

  it('porte ce qu’on pose dessous', () => {
    const h = monter(
      <Calendrier valeur={null} choisir={() => {}}>
        <ChoixHeure valeur={null} changer={() => {}} />
      </Calendrier>,
    )
    expect(h.querySelector('.notak-cal > .notak-heure-ajout')).not.toBeNull()
  })
})

describe('le choix d’heure', () => {
  it('sans heure : un bouton qui en propose une', () => {
    const changer = vi.fn()
    const h = monter(<ChoixHeure valeur={null} changer={changer} />)
    clic(h.querySelector('.notak-heure-ajout')!)
    expect(changer).toHaveBeenLastCalledWith('17:00')
  })

  it('avec une heure : deux champs, ↑ ↓ changent d’un pas qui reboucle, et on peut la retirer', () => {
    const changer = vi.fn()
    const h = monter(<ChoixHeure valeur="23:58" changer={changer} />)
    const [heures, minutes] = [...h.querySelectorAll<HTMLInputElement>('input')]
    expect([heures!.value, minutes!.value]).toEqual(['23', '58'])
    touche(heures!, 'ArrowUp')
    expect(changer).toHaveBeenLastCalledWith('00:58')
    touche(minutes!, 'ArrowUp')
    expect(changer).toHaveBeenLastCalledWith('23:03')
    touche(minutes!, 'ArrowDown')
    expect(changer).toHaveBeenLastCalledWith('23:53')
    clic(h.querySelector('.notak-heure-retirer')!)
    expect(changer).toHaveBeenLastCalledWith(null)
  })

  it('taper des chiffres règle l’heure, bornée à 23 et 59', () => {
    const changer = vi.fn()
    const h = monter(<ChoixHeure valeur="09:30" changer={changer} />)
    const [heures, minutes] = [...h.querySelectorAll<HTMLInputElement>('input')]
    const saisir = (c: HTMLInputElement, v: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(c, v)
        c.dispatchEvent(new Event('input', { bubbles: true }))
      })
    saisir(heures!, '17')
    expect(changer).toHaveBeenLastCalledWith('17:30')
    saisir(minutes!, '99')
    expect(changer).toHaveBeenLastCalledWith('09:59')
  })
})
