import { describe, expect, it } from 'vitest'
import { ouvrirBase } from './base.ts'
import { COULEURS, ErreurCompte, inscrire } from './comptes.ts'
import { role } from './droits.ts'

const neuf = () => ouvrirBase(':memory:')

describe('inscription', () => {
  it('crée le compte, son tableau d’accueil dont il est propriétaire, et une couleur de la palette', async () => {
    const base = neuf()
    const u = await inscrire(base, { email: '  Ana@Exemple.FR ', motDePasse: 'motdepasse', nom: ' Ana ' })
    expect(u.email).toBe('ana@exemple.fr')
    expect(u.nom).toBe('Ana')
    expect(COULEURS).toContain(u.couleur)
    expect(COULEURS).toHaveLength(8)
    expect(base.tableau(u.racine)?.titre).toBe('Accueil d’Ana')
    expect(role(base.acces(u.racine), u.id, u.racine)).toBe('proprietaire')
    expect(u.hash).not.toContain('motdepasse')
  })

  it('refuse une adresse déjà prise, même écrite autrement', async () => {
    const base = neuf()
    await inscrire(base, { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' })
    await expect(inscrire(base, { email: 'ANA@exemple.fr', motDePasse: 'motdepasse', nom: 'Autre' })).rejects.toMatchObject({ code: 'existe' })
  })

  it('refuse les entrées invalides', async () => {
    const base = neuf()
    const ok = { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' }
    for (const mauvais of [{ email: 'ana' }, { motDePasse: 'court' }, { nom: '  ' }]) {
      await expect(inscrire(base, { ...ok, ...mauvais })).rejects.toBeInstanceOf(ErreurCompte)
    }
  })

  it('active les invitations en attente pour cette adresse, et elles seules', async () => {
    const base = neuf()
    const ana = await inscrire(base, { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' })
    base.creerTableau({ id: 'tableau-un', titre: 'Un', proprietaire: ana.id, parent: null })
    base.definirAcces({ tableau: 'tableau-un', utilisateur: ana.id, role: 'proprietaire' })
    base.creerTableau({ id: 'tableau-deux', titre: 'Deux', proprietaire: ana.id, parent: null })
    base.definirAcces({ tableau: 'tableau-deux', utilisateur: ana.id, role: 'proprietaire' })
    base.definirInvitation({ tableau: 'tableau-un', email: 'bob@exemple.fr', role: 'edition' })
    base.definirInvitation({ tableau: 'tableau-deux', email: 'bob@exemple.fr', role: 'lecture' })
    base.definirInvitation({ tableau: 'tableau-un', email: 'cleo@exemple.fr', role: 'lecture' })

    const bob = await inscrire(base, { email: 'bob@exemple.fr', motDePasse: 'motdepasse', nom: 'Bob' })

    expect(role(base.acces('tableau-un'), bob.id, 'tableau-un')).toBe('edition')
    expect(role(base.acces('tableau-deux'), bob.id, 'tableau-deux')).toBe('lecture')
    expect(base.invitationsPour('bob@exemple.fr')).toEqual([])
    expect(base.invitationsPour('cleo@exemple.fr')).toHaveLength(1)
  })
})

describe('base', () => {
  it('annule une transaction qui échoue', () => {
    const base = neuf()
    expect(() =>
      base.transaction(() => {
        base.creerUtilisateur({ id: 'u', email: 'a@b.c', nom: 'A', hash: 'h', couleur: '#000', racine: 'r' })
        throw new Error('raté')
      }),
    ).toThrow('raté')
    expect(base.utilisateurParId('u')).toBeNull()
  })

  it('oublie les sessions échues', () => {
    const base = neuf()
    base.creerUtilisateur({ id: 'u', email: 'a@b.c', nom: 'A', hash: 'h', couleur: '#000', racine: 'r' })
    base.creerSession('e1', 'u', 1_000)
    expect(base.utilisateurDeSession('e1', 999)?.id).toBe('u')
    expect(base.utilisateurDeSession('e1', 1_001)).toBeNull()
  })
})
