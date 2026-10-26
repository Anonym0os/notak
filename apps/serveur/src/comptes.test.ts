import { describe, expect, it } from 'vitest'
import { creerAuth } from './auth.ts'
import { type Base, DUREE_INVITATION_MS, ouvrirBase } from './base.ts'
import { COULEURS, activerInvitations } from './comptes.ts'
import { role } from './droits.ts'
import { lireEtat } from './contenu.ts'
import { ORIGINE_ESSAI, authEssai, poserUtilisateur } from './essai.ts'
import { nomDuDocument } from './synchro.ts'

const neuf = () => ouvrirBase(':memory:')

/** L'inscription telle que la fait Better Auth ; rend le compte vu par Notak. */
async function inscrire(base: Base, entree: { email: string; motDePasse: string; nom: string; langue?: 'fr' | 'en' }) {
  const r = await authEssai(base).api.signUpEmail({ body: { email: entree.email, password: entree.motDePasse, name: entree.nom, langue: entree.langue } as never })
  return base.utilisateurParId(r.user.id)!
}

describe('inscription', () => {
  it('crée le compte, son tableau d’accueil dont il est propriétaire, et une couleur de la palette', async () => {
    const base = neuf()
    const u = await inscrire(base, { email: 'Ana@Exemple.FR', motDePasse: 'motdepasse', nom: ' Ana ' })
    expect(u.email).toBe('ana@exemple.fr')
    expect(u.nom).toBe('Ana')
    expect(COULEURS).toContain(u.couleur)
    expect(COULEURS).toHaveLength(8)
    expect(base.tableau(u.racine)?.titre).toBe('Accueil d’Ana')
    expect(role(base.acces(u.racine), u.id, u.racine)).toBe('proprietaire')
    const compte = base.db.prepare("SELECT password FROM account WHERE userId = ? AND providerId = 'credential'").get(u.id) as { password: string }
    expect(compte.password).toMatch(/^\$argon2id\$/)
  })

  it('remplit l’accueil d’un compte neuf : un document avec son titre, des colonnes et des notes qui présentent les gestes', async () => {
    const base = neuf()
    const u = await inscrire(base, { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' })
    const etat = base.document(nomDuDocument(u.racine))
    expect(etat).not.toBeNull()
    const t = lireEtat(etat!)
    expect(t.titre).toBe('Accueil d’Ana')
    const colonnes = t.elements.filter((e) => e.contenu.type === 'colonne')
    expect(colonnes.length).toBeGreaterThanOrEqual(4)
    const enfants = t.elements.filter((e) => e.parent)
    expect(enfants.length).toBeGreaterThan(8)
    for (const e of enfants) expect(colonnes.map((c) => c.id)).toContain(e.parent)
    expect(t.elements.some((e) => e.contenu.type === 'taches')).toBe(true)
    // La recherche dans tous les tableaux trouve déjà l'accueil.
    expect(base.chercher('"raccourcis"', [u.racine], 5).length).toBeGreaterThan(0)
  })

  it('l’accueil d’un compte qui s’inscrit en anglais naît en anglais, de même forme', async () => {
    const base = neuf()
    const fr = await inscrire(base, { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' })
    const en = await inscrire(base, { email: 'bob@exemple.fr', motDePasse: 'motdepasse', nom: 'Bob', langue: 'en' })
    const [a, b] = [fr, en].map((u) => lireEtat(base.document(nomDuDocument(u.racine))!))
    expect(b!.titre).toBe('Bob’s home')
    expect(base.tableau(en.racine)?.titre).toBe('Bob’s home')
    expect(b!.elements).toHaveLength(a!.elements.length)
    expect(JSON.stringify(b!.elements)).toContain('Welcome to Notak')
    expect(JSON.stringify(a!.elements)).toContain('Bienvenue sur Notak')
  })

  it('deux comptes n’ont aucun identifiant d’élément en commun', async () => {
    const base = neuf()
    const a = await inscrire(base, { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' })
    const b = await inscrire(base, { email: 'bob@exemple.fr', motDePasse: 'motdepasse', nom: 'Bob' })
    const ids = (racine: string) => new Set(lireEtat(base.document(nomDuDocument(racine))!).elements.map((e) => e.id))
    const [ia, ib] = [ids(a.racine), ids(b.racine)]
    expect([...ia].filter((i) => ib.has(i))).toEqual([])
  })

  it('refuse une adresse déjà prise, même écrite autrement', async () => {
    const base = neuf()
    await inscrire(base, { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' })
    await expect(inscrire(base, { email: 'ANA@exemple.fr', motDePasse: 'motdepasse', nom: 'Autre' })).rejects.toMatchObject({ body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' } })
  })

  it('refuse les entrées invalides', async () => {
    const base = neuf()
    const ok = { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' }
    for (const mauvais of [{ email: 'ana' }, { motDePasse: 'court' }, { nom: '  ' }]) {
      await expect(inscrire(base, { ...ok, ...mauvais })).rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('active les invitations en attente pour cette adresse, et elles seules, une fois l’adresse vérifiée', async () => {
    const base = neuf()
    const ana = await inscrire(base, { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' })
    const maintenant = Date.now()
    const invitation = { cree: maintenant, par: ana.id, echeance: null }
    for (const t of ['tableau-un', 'tableau-deux', 'tableau-trois']) {
      base.creerTableau({ id: t, titre: t, proprietaire: ana.id, parent: null })
      base.definirAcces({ tableau: t, utilisateur: ana.id, role: 'proprietaire' })
    }
    base.definirInvitation({ ...invitation, tableau: 'tableau-un', email: 'bob@exemple.fr', role: 'edition', jeton: 'j1' })
    base.definirInvitation({ ...invitation, tableau: 'tableau-deux', email: 'bob@exemple.fr', role: 'lecture', echeance: maintenant + 3600_000, jeton: 'j2' })
    base.definirInvitation({ ...invitation, tableau: 'tableau-trois', email: 'bob@exemple.fr', role: 'lecture', cree: maintenant - DUREE_INVITATION_MS - 1, jeton: 'j3' })
    base.definirInvitation({ ...invitation, tableau: 'tableau-un', email: 'cleo@exemple.fr', role: 'lecture', jeton: 'j4' })

    // Inscrit par mot de passe, son adresse n'est pas prouvée : quelqu'un d'autre a pu la taper. Rien ne s'ouvre.
    const bob = await inscrire(base, { email: 'bob@exemple.fr', motDePasse: 'motdepasse', nom: 'Bob' })
    expect(role(base.acces('tableau-un'), bob.id, 'tableau-un')).toBeNull()
    expect(activerInvitations(base, bob, maintenant)).toEqual([])
    expect(base.invitationsPour('bob@exemple.fr')).toHaveLength(3)

    base.verifierEmail(bob.id)
    expect(activerInvitations(base, bob, maintenant).sort()).toEqual(['tableau-deux', 'tableau-un'])
    expect(role(base.acces('tableau-un'), bob.id, 'tableau-un')).toBe('edition')
    expect(role(base.acces('tableau-deux'), bob.id, 'tableau-deux')).toBe('lecture')
    // L'échéance de l'invitation devient celle de l'accès ; l'invitation trop vieille ne donne rien.
    expect(base.echeance('tableau-deux', `user:${bob.id}`)).toBe(maintenant + 3600_000)
    expect(role(base.acces('tableau-trois'), bob.id, 'tableau-trois')).toBeNull()
    expect(base.invitationsPour('bob@exemple.fr')).toEqual([])
    expect(base.invitationsPour('cleo@exemple.fr')).toHaveLength(1)
  })
})

describe('base', () => {
  it('annule une transaction qui échoue', () => {
    const base = neuf()
    expect(() =>
      base.transaction(() => {
        poserUtilisateur(base, { id: 'u', email: 'a@b.c', nom: 'A', couleur: '#000', racine: 'r' })
        throw new Error('raté')
      }),
    ).toThrow('raté')
    expect(base.utilisateurParId('u')).toBeNull()
  })

  it('une transaction dans une transaction s’y joint', () => {
    const base = neuf()
    base.transaction(() => base.transaction(() => poserUtilisateur(base, { id: 'u', email: 'a@b.c', nom: 'A', couleur: '#000', racine: 'r' })))
    expect(base.utilisateurParId('u')?.email).toBe('a@b.c')
  })
})

describe('session', () => {
  it('une session échue ne vaut plus rien', async () => {
    const base = neuf()
    let maintenant = Date.now()
    const auth = creerAuth({ base, secret: 'un-secret-d-essai-assez-long-pour-better-auth', origine: ORIGINE_ESSAI, cookieSecurise: false, courrier: { actif: false, envoyer: async () => {} } })
    const r = await auth.api.signUpEmail({ body: { email: 'ana@exemple.fr', password: 'motdepasse', name: 'Ana' }, returnHeaders: true })
    const cookie = r.headers.get('set-cookie')!.split(';')[0]!
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.email).toBe('ana@exemple.fr')
    base.db.prepare('UPDATE session SET expiresAt = ?').run(new Date(maintenant - 1000).toISOString())
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })
})
