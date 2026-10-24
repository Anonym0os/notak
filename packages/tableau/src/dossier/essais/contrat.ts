import { describe, expect, it } from 'vitest'
import type { Dossier } from '../dossier'

/**
 * Ce que toute réalisation de `Dossier` doit tenir (la mémoire des essais, le système de fichiers de l'application,
 * l'accès aux fichiers du navigateur). À appeler depuis un fichier d'essais : `verifierContrat('nom', fabrique)`.
 * `fabrique` rend un dossier vide à chaque appel.
 */
export function verifierContrat(nom: string, fabrique: () => Promise<Dossier>) {
  const octets = (...o: number[]) => new Uint8Array(o)

  describe(`contrat du dossier : ${nom}`, () => {
    it('relit ce qu’il a écrit, et dit « absent » pour le reste', async () => {
      const d = await fabrique()
      await d.ecrireAtomique('a/b/c.nmj', octets(1, 2, 3))
      expect(await d.lire('a/b/c.nmj')).toEqual(octets(1, 2, 3))
      expect(await d.lire('a/b/rien.nmj')).toBe('absent')
    })

    it('liste fichiers et sous-dossiers, avec leur taille ; un dossier inconnu est vide', async () => {
      const d = await fabrique()
      await d.ecrireAtomique('appareils/x/maj-1.nmj', octets(1, 2))
      await d.ecrireAtomique('appareils/x/appareil.json', octets(1))
      await d.ecrireAtomique('appareils/y/vu.json', octets(1))
      const racine = await d.lister('appareils')
      expect(racine.map((e) => [e.nom, e.genre]).sort()).toEqual([
        ['x', 'dossier'],
        ['y', 'dossier'],
      ])
      const x = await d.lister('appareils/x')
      expect(x.find((e) => e.nom === 'maj-1.nmj')).toMatchObject({ genre: 'fichier', taille: 2 })
      expect(await d.lister('nulle/part')).toEqual([])
    })

    it('réécrire remplace en entier, et ne laisse pas de fichier temporaire', async () => {
      const d = await fabrique()
      await d.ecrireAtomique('f.json', octets(1, 2, 3, 4))
      await d.ecrireAtomique('f.json', octets(9))
      expect(await d.lire('f.json')).toEqual(octets(9))
      expect((await d.lister('')).map((e) => e.nom)).toEqual(['f.json'])
    })

    it('supprime, et supprimer ce qui n’existe pas ne fait rien', async () => {
      const d = await fabrique()
      await d.ecrireAtomique('f.nmj', octets(1))
      await d.supprimer('f.nmj')
      await d.supprimer('f.nmj')
      expect(await d.lire('f.nmj')).toBe('absent')
    })

    it('garde les noms tels quels : accents, espaces, parenthèses des copies de conflit', async () => {
      const d = await fabrique()
      const nom = 'appareils/x/maj-1 (copie en conflit de Léa).nmj'
      await d.ecrireAtomique(nom, octets(7))
      expect(await d.lire(nom)).toEqual(octets(7))
      expect((await d.lister('appareils/x')).map((e) => e.nom)).toContain('maj-1 (copie en conflit de Léa).nmj')
    })

    it('rend des octets qu’on peut garder : les modifier ne change pas le fichier', async () => {
      const d = await fabrique()
      await d.ecrireAtomique('f.nmj', octets(1, 2))
      const lu = (await d.lire('f.nmj')) as Uint8Array
      lu[0] = 99
      expect(await d.lire('f.nmj')).toEqual(octets(1, 2))
    })
  })
}
