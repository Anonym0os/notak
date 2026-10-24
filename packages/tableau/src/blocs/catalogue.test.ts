import { describe, expect, it } from 'vitest'
import { definirLangue } from '../langue'
import { BLOCS, CATALOGUE, SECTIONS_SLASH, TRANSFORMATIONS, chercher, couleurDeAttribut, couleurEnAttribut, declencheurSlash, fermeParEspaces, score, tropLoin } from './catalogue'

definirLangue('fr')
const ids = (requete: string, entrees = CATALOGUE) => chercher(entrees, requete).map((e) => e.id)

describe('NOTION.md § 2.1 : ce qui ouvre le menu « / »', () => {
  it('`/` en tête de bloc ou derrière un séparateur, pas dans un mot', () => {
    expect(declencheurSlash('/')).toEqual({ requete: '', longueur: 1 })
    expect(declencheurSlash('voir /tit')).toEqual({ requete: 'tit', longueur: 4 })
    expect(declencheurSlash('voir /tit')).toEqual({ requete: 'tit', longueur: 4 })
    expect(declencheurSlash('et/ou')).toBeNull()
    expect(declencheurSlash('https://exemple.fr')).toBeNull()
    expect(declencheurSlash('a\n/x')).toBeNull()
    expect(declencheurSlash('a￼/x')).toBeNull()
  })

  it('le `/` pleine chasse ouvre aussi le menu', () => {
    expect(declencheurSlash('／tit')).toEqual({ requete: 'tit', longueur: 4 })
  })

  it('la requête garde ses espaces et n’a pas de longueur maximale', () => {
    expect(declencheurSlash('/titre dé')?.requete).toBe('titre dé')
    expect(declencheurSlash(`/${'a'.repeat(60)}`)?.requete).toHaveLength(60)
    expect(declencheurSlash('/ ')).toEqual({ requete: ' ', longueur: 2 })
  })

  it('un deuxième `/` collé à un mot n’en rouvre pas un', () => {
    expect(declencheurSlash('/ti/tre')).toBeNull()
    expect(declencheurSlash('/ti /tre')?.requete).toBe('tre')
  })
})

describe('NOTION.md § 2.4 : ce qui ferme le menu « / »', () => {
  it('à la quatrième lettre sans résultat, pas avant', () => {
    expect(tropLoin('titrz', 4)).toBe(false)
    expect(tropLoin('titrzzz', 4)).toBe(false)
    expect(tropLoin('titrzzzz', 4)).toBe(true)
  })

  it('une espace seule ferme, sauf si le bloc est exactement `/` et une espace ; deux espaces à la fin ferment', () => {
    expect(fermeParEspaces(' ', '/ ')).toBe(false)
    expect(fermeParEspaces(' ', 'a / ')).toBe(true)
    expect(fermeParEspaces('titre ', '/titre ')).toBe(false)
    expect(fermeParEspaces('titre  ', '/titre  ')).toBe(true)
    expect(fermeParEspaces('a b', '/a b')).toBe(false)
  })
})

describe('NOTION.md § 2.3 : le score du filtre', () => {
  it('suit des paliers : préfixe, début de mot, sous-chaîne, sans accents, mots dans l’ordre', () => {
    expect(score('titre un', 'titre un')).toBe(1_000_000)
    expect(score('titre un', 'tit')).toBe(100_000)
    expect(score('un titre', 'tit')).toBe(10_000)
    expect(score('sous-titre', 'tit')).toBe(1_000)
    expect(score('déplier', 'depl')).toBe(950)
    expect(score('liste à puces rapide', 'liste rapide')).toBeGreaterThan(800)
    expect(score('liste à puces rapide', 'liste rapide')).toBeLessThan(900)
  })

  it('une correspondance approchée ne passe le seuil que par des caractères contigus', () => {
    // Quatre caractères d'affilée valent 26 (1 + 3 + 7 + 15), des paires isolées 4 chacune.
    expect(score('xtitrex', 'titrx')).toBeGreaterThanOrEqual(25)
    expect(score('t i t r e', 'titre')).toBe(0)
    expect(score('abc', 'xyz')).toBe(0)
  })

  it('les lettres accentuées se décomposent : « de » trouve « dé »', () => {
    expect(score('déplier', 'de')).toBeGreaterThanOrEqual(25)
  })
})

describe('NOTION.md § 2.3 : chercher dans le catalogue', () => {
  it('sans requête : toutes les entrées, dans l’ordre', () => {
    const tout = ids('')
    expect(tout[0]).toBe('texte')
    expect(tout).toHaveLength(CATALOGUE.length)
  })

  it('le nom de la section se cherche : « base » trouve les blocs de base', () => {
    const trouves = chercher(CATALOGUE, 'base').slice(0, 10)
    expect(trouves.every((e) => e.section === 'base')).toBe(true)
  })

  it('les mots-clés français et anglais, le nom, le raccourci markdown', () => {
    expect(ids('titre 1')[0]).toBe('titre1')
    expect(ids('heading 1')[0]).toBe('titre1')
    expect(ids('callout')[0]).toBe('encadre')
    expect(ids('accordéon')[0]).toBe('deroulant')
    expect(ids('checkbox')[0]).toBe('tache')
    expect(ids('h2')[0]).toBe('titre2')
    expect(ids('col3')[0]).toBe('colonnes3')
    expect(ids('#')[0]).toBe('titre1')
    expect(ids('---')[0]).toBe('separateur')
    expect(ids('```')[0]).toBe('code')
  })

  it('une recherche donne l’insertion, puis la transformation du même type', () => {
    expect(ids('encadr').slice(0, 2)).toEqual(['encadre', 'vers-encadre'])
    expect(ids('titre 1').slice(0, 2)).toEqual(['titre1', 'vers-titre1'])
  })

  it('les couleurs et les actions se cherchent, texte et fond ensemble', () => {
    expect(ids('rouge').slice(0, 2)).toEqual(['couleur-rouge', 'couleur-rouge-fond'])
    expect(ids('fond bleu')[0]).toBe('couleur-bleu-fond')
    expect(ids('fondbleu')[0]).toBe('couleur-bleu-fond')
    expect(ids('marron')[0]).toBe('couleur-brun')
    expect(ids('dupli')[0]).toBe('slash-dupliquer')
  })

  it('« Transformer en » ne propose que des blocs de texte, dans l’ordre de Notion', () => {
    expect(TRANSFORMATIONS.every((e) => e.effet.genre === 'vers')).toBe(true)
    expect(TRANSFORMATIONS.map((e) => (e.effet.genre === 'vers' ? e.effet.vers : ''))).toEqual([
      'texte',
      'titre1',
      'titre2',
      'titre3',
      'puce',
      'numero',
      'tache',
      'deroulant',
      'code',
      'citation',
      'encadre',
      'titreDeroulant1',
      'titreDeroulant2',
      'titreDeroulant3',
    ])
    expect(ids('sep', TRANSFORMATIONS)).toEqual([])
  })
})

describe('NOTION.md § 2.2 : l’ordre des sections', () => {
  it('les blocs de base, le média (le code y est), les blocs avancés, puis transformer, actions et couleurs', () => {
    expect(SECTIONS_SLASH).toEqual(['base', 'media', 'avances', 'transformer', 'actions', 'couleurTexte', 'couleurFond'])
    const dans = (s: string) => BLOCS.filter((e) => e.section === s).map((e) => e.id)
    expect(dans('base')).toEqual(['texte', 'titre1', 'titre2', 'titre3', 'puce', 'numero', 'tache', 'deroulant', 'encadre', 'citation', 'tableau', 'separateur'])
    expect(dans('media')).toEqual(['image', 'code'])
    expect(dans('avances')).toEqual(['titreDeroulant1', 'titreDeroulant2', 'titreDeroulant3', 'colonnes2', 'colonnes3', 'colonnes4', 'colonnes5'])
    // Les sections se suivent dans le catalogue dans l'ordre d'affichage.
    const rangs = CATALOGUE.map((e) => SECTIONS_SLASH.indexOf(e.section))
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b))
  })

  it('le raccourci montré à droite est l’exemple markdown', () => {
    const md = (id: string) => CATALOGUE.find((e) => e.id === id)?.markdown
    expect(md('titre1')).toBe('#')
    expect(md('puce')).toBe('-')
    expect(md('numero')).toBe('1.')
    expect(md('tache')).toBe('[]')
    expect(md('deroulant')).toBe('>')
    expect(md('separateur')).toBe('---')
    expect(md('encadre')).toBeUndefined()
  })

  it('les noms des couleurs se lisent « Texte bleu », « Fond bleu »', () => {
    const nom = (id: string) => CATALOGUE.find((e) => e.id === id)?.libelle
    expect(nom('couleur-bleu')).toBe('Texte bleu')
    expect(nom('couleur-bleu-fond')).toBe('Fond bleu')
    expect(nom('couleur-defaut')).toBe('Texte par défaut')
    expect(nom('couleur-brun-fond')).toBe('Fond marron')
  })
})

describe('NOTION.md § 1 : les couleurs', () => {
  it('s’écrivent en attribut et se relisent', () => {
    expect(couleurEnAttribut({ nom: 'rouge', fond: false })).toBe('rouge')
    expect(couleurEnAttribut({ nom: 'rouge', fond: true })).toBe('rouge-fond')
    expect(couleurEnAttribut({ nom: 'defaut', fond: true })).toBeNull()
    expect(couleurDeAttribut('vert-fond')).toEqual({ nom: 'vert', fond: true })
    expect(couleurDeAttribut('fuchsia')).toBeNull()
  })
})
