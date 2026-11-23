import { definirLangue } from '@notak/tableau'
import { beforeEach, describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import '../langue'
import { DELAI_VIDES, videsAJeter } from './vides'

/** Un identifiant de Notak né à cet instant (`nouvelId`) : dix signes de date, seize de hasard. */
const neA = (ms: number, suite = 'AAAAAAAAAAAAAAAA') => {
  let date = ''
  for (let t = ms, i = 0; i < 10; i++, t = Math.floor(t / 32)) date = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[t % 32] + date
  return date + suite
}

const MAINTENANT = Date.UTC(2026, 10, 23, 12)
const HEURE = 3_600_000
const ancien = MAINTENANT - HEURE

const toile = (e: Partial<EntreeBibliotheque> = {}): EntreeBibliotheque => ({
  tableau: neA(ancien),
  element: null,
  genre: 'toile',
  titre: 'Nouvelle toile',
  resume: { genre: 'toile', element: '', titre: 'Nouvelle toile', boites: [] },
  ou: 'Mon espace',
  dans: 'racine',
  vu: null,
  favori: false,
  partage: false,
  vierge: true,
  ...e,
})
const page = (e: Partial<EntreeBibliotheque> = {}, lignes: string[] = []): EntreeBibliotheque =>
  toile({ tableau: 'racine', element: neA(ancien, 'PAGEPAGEPAGEPAGE'), genre: 'document', titre: '', resume: { genre: 'document', element: 'p', titre: '', lignes }, ...e })
const carte = (titre = 'Sujet central', branches: string[] = []): EntreeBibliotheque =>
  toile({ tableau: 'racine', element: neA(ancien, 'CARTECARTECARTEC'), genre: 'arbre', titre, resume: { genre: 'arbre', element: 'c', titre, branches } })

const jetees = (l: EntreeBibliotheque[]) => videsAJeter(l, MAINTENANT).map((e) => e.titre || e.element)

describe('ce qui part de soi-même à la corbeille', () => {
  beforeEach(() => definirLangue('fr'))

  it('une toile, un dossier, une page, une carte mentale : vides, sous leur nom d’origine, sans histoire', () => {
    const dossier = toile({ tableau: neA(ancien, 'DQSSERDQSSERDQSS'), titre: 'Nouveau dossier', resume: { genre: 'toile', element: '', titre: 'Nouveau dossier', boites: [], dossier: true } })
    const sansTitre = page()
    expect(jetees([toile(), dossier, sansTitre, carte()])).toEqual(['Nouvelle toile', 'Nouveau dossier', sansTitre.element, 'Sujet central'])
    // Le nom d'origine reçu en anglais vaut aussi.
    expect(jetees([toile({ titre: 'New canvas' }), carte('Central topic')])).toEqual(['New canvas', 'Central topic'])
  })

  it('ce qui porte un nom, ou quelque chose, reste', () => {
    expect(jetees([toile({ titre: 'Voyage' }), page({ titre: 'Compte rendu' }), carte('Idées')])).toEqual([])
    expect(jetees([page({}, ['Une ligne']), carte('Sujet central', ['Une branche'])])).toEqual([])
    const vide = toile()
    // Une note posée dessus (son plan), ou ce qui attend dans ses non triés.
    expect(jetees([toile({ resume: { genre: 'toile', element: '', titre: 'Nouvelle toile', boites: [[0, 0, 10, 4, 'jaune', 'note', 1]] } })])).toEqual([])
    expect(jetees([toile({ resume: { genre: 'toile', element: '', titre: 'Nouvelle toile', boites: [], nonTries: 2 } })])).toEqual([])
    // Une page qu'elle range : elle n'est pas vide.
    expect(jetees([vide, page({ tableau: vide.tableau, titre: 'Dedans', dans: vide.tableau })])).toEqual([])
  })

  it('ce qui a une histoire reste : vidé après avoir porté quelque chose, le serveur ne le dit pas vierge', () => {
    expect(jetees([toile({ vierge: false }), toile({ vierge: undefined }), page({ vierge: false })])).toEqual([])
  })

  it('ni ce qui vient d’être créé ou touché (une création peut être en cours), ni ce dont on ignore l’âge', () => {
    const recente = toile({ tableau: neA(MAINTENANT - DELAI_VIDES + 60_000) })
    const ouverte = toile({ vu: MAINTENANT - 60_000 })
    const sansAge = toile({ tableau: 'vieux-identifiant' })
    expect(jetees([recente, ouverte, sansAge])).toEqual([])
    expect(jetees([toile({ tableau: neA(MAINTENANT - DELAI_VIDES - 60_000), vu: MAINTENANT - DELAI_VIDES - 1 })])).toEqual(['Nouvelle toile'])
  })

  it('ni ce qu’on nous partage, ni un favori, ni le dossier qu’un outil a généré', () => {
    expect(jetees([toile({ partage: true }), toile({ favori: true }), toile({ outil: 'Comptoir' }), toile({ fiche: { nom: 'Comptoir' } })])).toEqual([])
  })
})
