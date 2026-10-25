// @vitest-environment jsdom
import { act, useState } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FenetreReglages, type Reglages } from '../reglages'
import { useHabillages } from './appliquer'
import type { OffreHabillages } from './bibliotheque'
import { lireHabillage } from './format'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  localStorage.clear()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const depart: Reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true, grille: 10, barre: 'gauche' }
const nuit = { notak: 'habillage', version: 1, id: 'nuit', nom: 'Nuit', couleurs: { clair: { fond: '#101820' } }, rayons: { panneau: 16 } }

function Banc({ offre }: { offre?: OffreHabillages }) {
  const [reglages, setReglages] = useState(depart)
  const habillages = useHabillages(offre, reglages.habillage, reglages.theme)
  return <FenetreReglages reglages={reglages} changer={(r) => setReglages((v) => ({ ...v, ...r }))} fermer={() => {}} habillages={habillages} />
}

const monter = (offre?: OffreHabillages) => act(() => racine.render(<Banc {...(offre ? { offre } : {})} />))
const choix = () => [...hote.querySelectorAll('[aria-label="Thème"] [role="radio"]')].map((b) => `${b.textContent}${b.getAttribute('aria-checked') === 'true' ? ' ✓' : ''}`)

async function importer(contenu: string) {
  const champ = hote.querySelector<HTMLInputElement>('input[type="file"]')!
  // Le `File` de jsdom ne sait pas `text()` : on prête ce que le champ en lit.
  Object.defineProperty(champ, 'files', { value: [{ name: 'theme.json', text: async () => contenu }], configurable: true })
  await act(async () => {
    champ.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('le choix du thème', () => {
  it('importe un thème, le choisit et le pose sur la page', async () => {
    monter()
    expect(choix()).toEqual(['Notak ✓'])
    await importer(JSON.stringify(nuit))
    expect(choix()).toEqual(['Notak', 'Nuit ✓'])
    expect(document.documentElement.dataset.habillage).toBe('nuit')
    expect(document.head.querySelector('style[data-notak-habillage]')?.textContent).toContain('--notak-rayon-panneau: 16px;')
    expect(localStorage.getItem('notak:habillages')).toContain('"id":"nuit"')
  })

  it('dit pourquoi un fichier est refusé, sans rien changer', async () => {
    monter()
    await importer(JSON.stringify({ ...nuit, couleurs: { clair: { fond: '#fff;}*{display:none' } } }))
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe('Valeur refusée dans le thème : couleurs.clair.fond.')
    expect(choix()).toEqual(['Notak ✓'])
    expect(document.documentElement.dataset.habillage).toBeUndefined()
  })

  it('retire un thème importé et revient à Notak', async () => {
    monter()
    await importer(JSON.stringify(nuit))
    const retirer = [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Retirer « Nuit »')!
    act(() => retirer.click())
    expect(choix()).toEqual(['Notak ✓'])
    expect(document.documentElement.dataset.habillage).toBeUndefined()
    expect(document.head.querySelector('style[data-notak-habillage]')).toBeNull()
  })

  it('un thème imposé par le serveur ne se change pas', () => {
    monter({ fournis: [lireHabillage({ ...nuit, id: 'silak', nom: 'Silak' })], impose: 'silak' })
    expect(choix()).toEqual(['Notak', 'Silak ✓'])
    expect([...hote.querySelectorAll<HTMLButtonElement>('[aria-label="Thème"] button')].every((b) => b.disabled)).toBe(true)
    expect(hote.textContent).toContain('Ce serveur impose le thème « Silak ».')
    expect(hote.querySelector('input[type="file"]')).toBeNull()
  })
})
