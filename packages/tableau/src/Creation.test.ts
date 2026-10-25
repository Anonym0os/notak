import { describe, expect, it } from 'vitest'
import { outilsDeBarre } from './Barres'
import './elements'
import { definition } from './elements/registre'

const libelles = (f: (o: ReturnType<typeof outilsDeBarre>[number]) => boolean) => outilsDeBarre().filter(f).map((o) => o.outil.libelle)

describe('la barre de création, dans l’ordre de Milanote', () => {
  it('les éléments visibles : Note, Lien, À faire, Ligne, Toile, Colonne, Commentaire, Table', () => {
    expect(libelles((o) => !o.outil.tiroir && o.outil.groupe !== 'action')).toEqual(['Note', 'Lien', 'À faire', 'Ligne', 'Toile', 'Colonne', 'Commentaire', 'Table'])
  })

  it('le tiroir : Croquis, Nuancier, Document, Audio, Carte, Vidéo, Titre, puis ce qui est propre à Notak', () => {
    const tiroir = libelles((o) => !!o.outil.tiroir)
    expect(tiroir.slice(0, 7)).toEqual(['Croquis', 'Nuancier', 'Document', 'Audio', 'Carte', 'Vidéo', 'Titre'])
    expect(tiroir.slice(7).length).toBeGreaterThan(0)
  })

  it('après le séparateur : Image, Fichier, Dessin', () => {
    expect(libelles((o) => o.outil.groupe === 'action')).toEqual(['Ajouter une image', 'Envoyer', 'Dessiner'])
  })
})

describe('ce que devient un élément qu’un outil vient de créer', () => {
  it('une ligne, une table et un document sont seulement choisis', () => {
    expect(definition('document')?.aLaCreation).toBe('choisir')
    expect(definition('ligne')?.aLaCreation).toBe('choisir')
    expect(definition('table')?.aLaCreation).toBe('choisir')
  })
  it('un croquis et un nuancier ne sont ni choisis ni édités', () => {
    expect(definition('croquis')?.aLaCreation).toBe('rien')
    expect(definition('nuancier')?.aLaCreation).toBe('rien')
  })
  it('une note, un texte, un lien, une colonne : édités (le défaut)', () => {
    for (const type of ['note', 'lien', 'colonne', 'commentaire', 'taches'] as const) expect(definition(type)?.aLaCreation, type).toBeUndefined()
  })
})
