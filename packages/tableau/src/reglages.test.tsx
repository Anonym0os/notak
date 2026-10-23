// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FenetreReglages, PHOTO_MAX, type ServiceCompte, refusDePhoto } from './reglages'

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

const reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true } as const
const monter = (compte?: ServiceCompte) =>
  act(() => racine.render(<FenetreReglages reglages={reglages} changer={() => {}} fermer={() => {}} {...(compte ? { compte } : {})} />))

function service(extra: Partial<ServiceCompte> = {}) {
  const appels: string[] = []
  const s: ServiceCompte = {
    nom: 'Ana',
    email: 'ana@exemple.fr',
    couleur: '#2f9e44',
    photo: null,
    changerCouleur: async (c) => void appels.push(`couleur:${c}`),
    changerPhoto: async (f) => void appels.push(`photo:${f ? f.name : 'aucune'}`),
    ...extra,
  }
  return { s, appels }
}

describe('refus d’une photo', () => {
  it('accepte une image raisonnable, refuse un autre type ou un poids excessif', () => {
    expect(refusDePhoto({ type: 'image/png', size: 1000 })).toBeNull()
    expect(refusDePhoto({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPEG/)
    expect(refusDePhoto({ type: 'application/pdf', size: 1000 })).not.toBeNull()
    expect(refusDePhoto({ type: 'image/jpeg', size: PHOTO_MAX + 1 })).toMatch(/5 Mo/)
  })
})

describe('section Compte des réglages', () => {
  it('n’existe que si l’application prête le service', () => {
    monter()
    expect(hote.querySelector('[aria-label="Compte"]')).toBeNull()
    monter(service().s)
    expect(hote.querySelector('[aria-label="Compte"]')).not.toBeNull()
    expect(hote.textContent).toContain('ana@exemple.fr')
  })

  it('montre l’initiale sans photo, la photo avec, et propose de la retirer', () => {
    monter(service().s)
    expect(hote.querySelector('.notak-reglages-avatar img')).toBeNull()
    expect(hote.querySelector('.notak-reglages-avatar')?.textContent).toBe('A')
    expect(hote.textContent).toContain('Choisir une photo')
    monter(service({ photo: '/api/fichiers/x?l=400' }).s)
    expect(hote.querySelector('.notak-reglages-avatar img')?.getAttribute('src')).toBe('/api/fichiers/x?l=400')
    expect(hote.textContent).toContain('Retirer la photo')
  })

  it('une couleur choisie est transmise, la couleur actuelle est cochée', async () => {
    const { s, appels } = service()
    monter(s)
    const radios = [...hote.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="Couleur du compte"] [role="radio"]')]
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.getAttribute('aria-label'))).toEqual(['#2f9e44'])
    await act(async () => radios[4]!.click())
    expect(appels).toEqual(['couleur:#1971c2'])
  })

  it('retirer la photo la transmet comme « aucune »', async () => {
    const { s, appels } = service({ photo: '/p' })
    monter(s)
    const retirer = [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Retirer la photo')!
    await act(async () => retirer.click())
    expect(appels).toEqual(['photo:aucune'])
  })

  it('dit pourquoi un changement a échoué', async () => {
    const echec = vi.fn().mockRejectedValue(new Error('Serveur injoignable'))
    monter(service({ changerCouleur: echec }).s)
    const premiere = hote.querySelector<HTMLButtonElement>('[role="radio"]')!
    await act(async () => premiere.click())
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe('Serveur injoignable')
  })

  it('une photo refusée n’est pas envoyée', async () => {
    const { s, appels } = service()
    monter(s)
    const champ = hote.querySelector<HTMLInputElement>('input[type="file"]')!
    const pdf = new File(['x'], 'cv.pdf', { type: 'application/pdf' })
    Object.defineProperty(champ, 'files', { value: [pdf], configurable: true })
    await act(async () => champ.dispatchEvent(new Event('change', { bubbles: true })))
    expect(appels).toEqual([])
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/PNG/)
  })

  it('une bonne photo est transmise', async () => {
    const { s, appels } = service()
    monter(s)
    const champ = hote.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(champ, 'files', { value: [new File(['x'], 'moi.png', { type: 'image/png' })], configurable: true })
    await act(async () => champ.dispatchEvent(new Event('change', { bubbles: true })))
    expect(appels).toEqual(['photo:moi.png'])
  })
})

describe('langue des réglages', () => {
  it('propose automatique, français et anglais, et passe l’interface en anglais', async () => {
    const { definirLangue } = await import('./langue')
    const choisis: unknown[] = []
    act(() => racine.render(<FenetreReglages reglages={reglages} changer={(r) => choisis.push(r)} fermer={() => {}} />))
    const boutons = [...hote.querySelectorAll<HTMLElement>('[role="radio"]')].map((b) => b.textContent)
    expect(boutons).toEqual(expect.arrayContaining(['Automatique (navigateur)', 'Français', 'English']))
    ;[...hote.querySelectorAll<HTMLElement>('[role="radio"]')].find((b) => b.textContent === 'English')?.click()
    expect(choisis).toEqual([{ langue: 'en' }])
    try {
      definirLangue('en')
      act(() => racine.render(<FenetreReglages reglages={{ ...reglages, langue: 'en' }} changer={() => {}} fermer={() => {}} />))
      expect(hote.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Settings')
      expect(hote.textContent).toContain('Interface size')
    } finally {
      definirLangue('fr')
    }
  })
})
