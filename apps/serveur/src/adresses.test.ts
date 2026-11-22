import { describe, expect, it } from 'vitest'
import { adresseDe } from './adresses.ts'

describe('les adresses, comme « Copier le lien » de la bibliothèque', () => {
  const r = { origine: 'https://notak.test/', estDossier: (id: string) => id === 'dossier1', estAccueil: (id: string) => id === 'accueil1' }

  it('une toile, un dossier, l’accueil', () => {
    expect(adresseDe({ tableau: 'toile1' }, r)).toBe('https://notak.test/t/toile1')
    expect(adresseDe({ tableau: 'dossier1' }, r)).toBe('https://notak.test/?dossier=dossier1')
    expect(adresseDe({ tableau: 'accueil1' }, r)).toBe('https://notak.test/t/accueil1')
  })

  it('une page ou une carte mentale s’ouvre en grand, où qu’elle soit', () => {
    for (const type of ['page', 'document', 'carte_mentale', 'arbre']) {
      expect(adresseDe({ tableau: 'dossier1', element: 'e1', type }, r)).toBe('https://notak.test/t/dossier1/e/e1')
      expect(adresseDe({ tableau: 'toile1', element: 'e1', type }, r)).toBe('https://notak.test/t/toile1/e/e1')
    }
  })

  it('un autre élément se choisit dans la bibliothèque s’il est dans un dossier ou sur l’accueil, sinon sur sa toile', () => {
    expect(adresseDe({ tableau: 'dossier1', element: 'e1', type: 'lien' }, r)).toBe('https://notak.test/?dossier=dossier1&element=e1')
    expect(adresseDe({ tableau: 'accueil1', element: 'e1', type: 'lien' }, r)).toBe('https://notak.test/?dossier=accueil1&element=e1')
    expect(adresseDe({ tableau: 'toile1', element: 'e1', type: 'note' }, r)).toBe('https://notak.test/t/toile1/e/e1')
    expect(adresseDe({ tableau: 'toile1', element: 'e1' }, { ...r, origine: undefined })).toBe('/t/toile1/e/e1')
  })
})
