import { describe, expect, it } from 'vitest'
import { CATALOGUE } from './catalogue'
import { avecIcone, ICONES_TABLEAU, pastilleDe } from './icones'
import { chercherIcones } from './rechercheIcones'

describe('le catalogue d’icônes', () => {
  it('est bien plus fourni que la petite bibliothèque, sans nom en double', () => {
    expect(Object.keys(CATALOGUE).length).toBeGreaterThanOrEqual(150)
    for (const nom of Object.keys(CATALOGUE)) expect(nom in ICONES_TABLEAU).toBe(false)
  })
  it('une icône du catalogue se garde et se dessine', () => {
    expect(avecIcone({ type: 'tableau', cible: 'T' }, 'montagne')).toEqual({ type: 'tableau', cible: 'T', icone: 'montagne' })
    expect(pastilleDe({ icone: 'montagne' })).toMatchObject({ genre: 'catalogue', libelle: 'Montagne' })
  })
})

describe('chercher une icône', () => {
  it('sans requête, tout est là, la petite bibliothèque d’abord', () => {
    const toutes = chercherIcones('')
    expect(toutes).toHaveLength(Object.keys(ICONES_TABLEAU).length + Object.keys(CATALOGUE).length)
    expect(toutes[0]!.nom).toBe(Object.keys(ICONES_TABLEAU)[0])
  })
  it('trouve par un mot, accents et majuscules ignorés, en français comme en anglais', () => {
    expect(chercherIcones('RANDONNÉE').map((x) => x.nom)).toContain('montagne')
    expect(chercherIcones('hiking').map((x) => x.nom)).toContain('montagne')
  })
  it('un début de mot suffit, un mot entier passe devant', () => {
    const noms = chercherIcones('vac').map((x) => x.nom)
    expect(noms).toContain('voyage')
    expect(chercherIcones('plage')[0]!.nom).toBe('plage')
  })
  it('tous les mots tapés comptent', () => {
    const noms = chercherIcones('sac voyage').map((x) => x.nom)
    expect(noms).toContain('sac-a-dos')
    expect(noms).not.toContain('maison')
  })
  it('rien ne correspond : liste vide', () => {
    expect(chercherIcones('zzzzqx')).toEqual([])
  })
})
