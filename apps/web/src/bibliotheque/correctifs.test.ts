import { describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import { avecCorrectifs, corriger } from './correctifs'
import { cleDe } from './selection'

const entree = (tableau: string, element: string | null, titre = tableau): EntreeBibliotheque => ({
  tableau,
  element,
  dans: 'accueil',
  genre: element ? 'document' : 'toile',
  titre,
  resume: { genre: 'toile', element: '', titre, boites: [] },
  ou: 'Accueil',
  vu: null,
  favori: false,
  partage: false,
})

const cles = (l: EntreeBibliotheque[]) => l.map(cleDe)

describe('les correctifs', () => {
  const liste = [entree('projets', null), entree('accueil', 'doc', 'Budget')]

  it('retirent, ajoutent et changent, sans rien refaire sur une liste qui y est déjà', () => {
    const sans = corriger(liste, { type: 'retirer', cles: ['accueil/doc'] })
    expect(cles(sans)).toEqual(['projets/'])
    expect(corriger(sans, { type: 'retirer', cles: ['accueil/doc'] })).toEqual(sans)
    const avec = corriger(liste, { type: 'ajouter', entrees: [entree('copie', null)] })
    expect(cles(corriger(avec, { type: 'ajouter', entrees: [entree('copie', null)] }))).toEqual(['projets/', 'accueil/doc', 'copie/'])
    expect(corriger(liste, { type: 'changer', cle: 'projets/', champs: { titre: 'Chantiers' } })[0]!.titre).toBe('Chantiers')
  })

  it('un ajout que le serveur connaît déjà, sans l’avoir vu ouvert, garde l’ouverture la plus récente', () => {
    const importe = { ...entree('accueil', 'doc', 'Budget'), vu: 1000 }
    expect(corriger(liste, { type: 'ajouter', entrees: [importe] })[1]!.vu).toBe(1000)
    expect(corriger([{ ...importe, vu: 2000 }], { type: 'ajouter', entrees: [importe] })[0]!.vu).toBe(2000)
  })

  it('remplacent une entrée déplacée, qu’elle ait changé de clé ou seulement de dossier', () => {
    const par = { ...entree('projets', 'doc2', 'Budget'), dans: 'projets', ou: 'Projets' }
    const apres = corriger(liste, { type: 'remplacer', de: 'accueil/doc', par })
    expect(cles(apres)).toEqual(['projets/', 'projets/doc2'])
    // Le serveur a déjà suivi : l'ancienne clé n'y est plus, la nouvelle si.
    expect(corriger(apres, { type: 'remplacer', de: 'accueil/doc', par })).toEqual(apres)
    // Les deux à la fois (le serveur a vu l'arrivée, pas encore le départ) : une seule reste.
    expect(cles(corriger([...liste, par], { type: 'remplacer', de: 'accueil/doc', par }))).toEqual(['projets/', 'projets/doc2'])
    const toile = corriger(liste, { type: 'remplacer', de: 'projets/', par: { ...liste[0]!, dans: 'ailleurs', ou: 'Ailleurs' } })
    expect(toile[0]).toMatchObject({ dans: 'ailleurs', ou: 'Ailleurs' })
  })

  it('se posent dans l’ordre', () => {
    const r = avecCorrectifs(liste, [
      { correctif: { type: 'changer', cle: 'accueil/doc', champs: { titre: 'Notes' } } },
      { correctif: { type: 'retirer', cles: ['projets/'] } },
    ])
    expect(r.map((e) => e.titre)).toEqual(['Notes'])
  })
})
