import { describe, expect, test } from 'vitest'
import { docDepuisTexte } from '../../coeur/tableau'
import { compterMots, doitEtreTitre, documentCree, documentVide, extrait, mesure, nouveauDocument, premiersBlocs, resume } from './texte'

describe('le document', () => {
  test('un document neuf est vide', () => {
    const d = nouveauDocument(0, 0).contenu
    expect(documentVide(d)).toBe(true)
    expect(compterMots(d.texte)).toBe(0)
  })

  test('les mots se comptent sur tous les blocs', () => {
    expect(compterMots(docDepuisTexte('un deux\n\ntrois  quatre\ncinq'))).toBe(5)
  })

  test('la mesure donne le temps de lecture au-delà de 200 mots', () => {
    expect(mesure(docDepuisTexte('bonjour'))).toBe('1 mot')
    expect(mesure(docDepuisTexte('un deux trois'))).toBe('3 mots')
    expect(mesure(docDepuisTexte(Array(450).fill('mot').join(' ')))).toBe('450 mots · 3 min de lecture')
  })

  test('l’extrait se coupe au mot et prend « … »', () => {
    const doc = docDepuisTexte('Le premier paragraphe est assez long\nle second continue encore')
    expect(extrait(doc, 200)).toBe('Le premier paragraphe est assez long le second continue encore')
    expect(extrait(doc, 25)).toBe('Le premier paragraphe…')
  })

  test('la carte ne dessine que les premiers blocs', () => {
    const doc = docDepuisTexte(Array.from({ length: 30 }, (_, i) => `ligne ${i}`).join('\n'))
    expect(premiersBlocs(doc, 12).content).toHaveLength(12)
    expect(premiersBlocs(doc, 50)).toBe(doc)
  })

  test('le résumé prend le titre, sinon le début du texte', () => {
    expect(resume({ type: 'document', titre: ' Plan ', texte: docDepuisTexte('x') })).toBe('Plan')
    expect(resume({ type: 'document', titre: '', texte: docDepuisTexte('Notes de réunion') })).toBe('Notes de réunion')
    expect(resume(nouveauDocument(0, 0).contenu)).toBe('Document vide')
  })
})

describe('la création par l’outil', () => {
  test('le document posé porte « Nouveau document » et son titre s’édite une seule fois sur la carte', () => {
    const e = documentCree(0, 0)
    expect(e.contenu.titre).toBe('Nouveau document')
    expect(e.largeur).toBe(10)
    expect(doitEtreTitre(e.id)).toBe(true)
    expect(doitEtreTitre(e.id)).toBe(false)
  })

  test('un document venu d’ailleurs (suivant, copie) n’édite pas son titre', () => {
    expect(doitEtreTitre(nouveauDocument(0, 0).id)).toBe(false)
  })
})
