import { describe, expect, it } from 'vitest'
import type { Lien } from '../../coeur/tableau'
import { INVITES, adresseAffichee, avecAdresse, domaineDe, lireAdresse } from './adresse'

describe('lireAdresse', () => {
  it('garde une adresse complète', () => {
    expect(lireAdresse('https://exemple.fr/page?a=1')).toBe('https://exemple.fr/page?a=1')
    expect(lireAdresse('  http://exemple.fr  ')).toBe('http://exemple.fr')
  })
  it('ajoute https:// à un domaine seul', () => {
    expect(lireAdresse('exemple.fr/page')).toBe('https://exemple.fr/page')
    expect(lireAdresse('www.exemple.com')).toBe('https://www.exemple.com')
  })
  it('laisse le reste aux autres récepteurs', () => {
    expect(lireAdresse('bonjour tout le monde')).toBeNull()
    expect(lireAdresse('voir https://exemple.fr')).toBeNull()
    expect(lireAdresse('nom@exemple.fr')).toBeNull()
    expect(lireAdresse('https://moi@exemple.fr')).toBeNull()
    expect(lireAdresse('mailto:nom@exemple.fr')).toBeNull()
    expect(lireAdresse('javascript:alert(1)')).toBeNull()
    expect(lireAdresse('ftp://exemple.fr')).toBeNull()
    expect(lireAdresse('bonjour')).toBeNull()
    expect(lireAdresse('3.14')).toBeNull()
    expect(lireAdresse('')).toBeNull()
  })
  it('refuse plus de 300 caractères', () => {
    expect(lireAdresse(`https://exemple.fr/${'a'.repeat(300)}`)).toBeNull()
    expect(lireAdresse(`https://exemple.fr/${'a'.repeat(100)}`)).not.toBeNull()
  })
  it('donne le domaine sans www', () => {
    expect(domaineDe('https://www.exemple.fr/x')).toBe('exemple.fr')
  })
})

describe('avecAdresse', () => {
  it('refait l’aperçu mais garde le genre et les réglages', () => {
    const avant: Lien = {
      type: 'lien',
      url: 'https://a.test',
      statut: 'echec',
      echec: 'refuse',
      titre: 'Vieux titre',
      legende: 'Vieille légende',
      apercu: { titre: 'x' },
      genre: 'video',
      lectureAuto: true,
      sansInfos: true,
    }
    expect(avecAdresse(avant, 'https://b.test')).toEqual({
      type: 'lien',
      url: 'https://b.test',
      statut: 'attente',
      genre: 'video',
      lectureAuto: true,
      sansInfos: true,
    })
  })
})

describe('INVITES', () => {
  it('a une invite par genre', () => {
    expect(Object.keys(INVITES).sort()).toEqual(['audio', 'carte', 'lien', 'video'])
  })
})

describe('adresseAffichee', () => {
  it('montre l’adresse complète, sans le schéma ni la barre finale', () => {
    expect(adresseAffichee('https://www.exemple.fr/a/b?x=1')).toBe('www.exemple.fr/a/b?x=1')
    expect(adresseAffichee('http://exemple.fr/')).toBe('exemple.fr')
  })
})
