import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Hocuspocus } from '@hocuspocus/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { regrouper } from './activite.ts'
import { CHEMIN_SCHEMAS, texteDesSchemas } from '../../../scripts/schemas-agents.ts'
import { NOMS_OPERATIONS, OPERATIONS, validerArguments } from './agentsContrat.ts'
import { boitesDe, chevauche } from '../../../packages/tableau/src/agents/poser.ts'
import { docDepuisMarkdown, markdownDepuisDoc } from '../../../packages/tableau/src/agents/texte.ts'
import { type ElementLu, type TableauLu, lireEtat } from './contenu.ts'
import { type Compte, type Monde, ORIGINE_ESSAI, monde } from './essai.ts'
import { type SourceRattachement, signer, sourcesDe } from './rattachements.ts'
import { creerHocuspocus, nomDuDocument } from './synchro.ts'

const SECRET = 'un-secret-partage-de-plus-de-trente-deux-caracteres'
const SILAK: SourceRattachement = { source: 'silak', nom: 'Silak', dossier: 'Clients', origine: 'https://silak.exemple', secret: SECRET, agents: true, agent: 'Fram' }
const ETEINTE: SourceRattachement = { source: 'eteinte', nom: 'Éteinte', dossier: 'Dossiers', origine: 'https://eteinte.exemple', secret: SECRET }

type Reponse = { ok: boolean; code?: string; erreur?: string; resultat?: Record<string, any> }

describe('la porte des agents', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte
  let nombre = 0
  const agir = async (operation: string, args: unknown, o: { au_nom_de?: unknown; id?: string; source?: string; secret?: string; quand?: number } = {}) => {
    const corps = JSON.stringify({ id: o.id ?? `essai-${++nombre}-agent`, au_nom_de: o.au_nom_de ?? { sujet: 'silak-ana' }, operation, arguments: args })
    const r = await m.appelerBrut(`/api/outils/${o.source ?? 'silak'}/agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'notak-signature': signer(o.secret ?? SECRET, corps, o.quand ?? m.maintenant()) },
      body: corps,
    })
    return { statut: r.status, corps: (await r.json()) as Reponse }
  }
  /** Le résultat d'une opération qui doit réussir. */
  const fait = async (operation: string, args: unknown, o: Parameters<typeof agir>[2] = {}) => {
    const r = await agir(operation, args, o)
    expect(r.corps, JSON.stringify(r.corps)).toMatchObject({ ok: true })
    return r.corps.resultat!
  }
  const lu = (tableau: string): TableauLu => {
    const etat = m.base.document(nomDuDocument(tableau))
    return etat ? lireEtat(etat) : { titre: '', elements: [] }
  }
  const lier = (c: Compte, sujet: string) => {
    const quand = new Date().toISOString()
    m.base.db
      .prepare('INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`compte-${sujet}`, sujet, 'silak', c.utilisateur.id, quand, quand)
  }
  const tableau = async (c: Compte, id: string, titre: string) => {
    expect((await m.appeler('/api/tableaux', { compte: c, json: { id, titre } })).status).toBe(201)
    return id
  }

  beforeAll(async () => {
    m = monde({ rattachements: [SILAK, ETEINTE] })
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    lier(ana, 'silak-ana')
  })
  afterAll(() => m.fermer())

  describe('la route', () => {
    it('n’existe pas sans « agents » sur la source, ni pour une source inconnue', async () => {
      expect((await agir('trouver', {}, { source: 'eteinte' })).statut).toBe(404)
      expect((await agir('trouver', {}, { source: 'inconnue' })).statut).toBe(404)
    })

    it('refuse une signature fausse ou périmée, et un corps trop gros', async () => {
      expect(await agir('trouver', {}, { secret: `${SECRET}x` })).toMatchObject({ statut: 401, corps: { code: 'signature_invalide' } })
      expect(await agir('trouver', {}, { quand: m.maintenant() - 10 * 60_000 })).toMatchObject({ statut: 401 })
      const gros = JSON.stringify({ id: 'essai-gros-1', au_nom_de: { sujet: 'silak-ana' }, operation: 'trouver', arguments: { texte: 'x'.repeat(600 * 1024) } })
      const r = await m.appelerBrut('/api/outils/silak/agent', { method: 'POST', headers: { 'notak-signature': signer(SECRET, gros, m.maintenant()) }, body: gros })
      expect(r.status).toBe(413)
    })

    it('refuse une enveloppe ou des arguments de travers, en disant lequel', async () => {
      expect(await agir('effacer_tout', {})).toMatchObject({ statut: 400, corps: { code: 'corps_invalide' } })
      expect(await agir('trouver', {}, { id: 'court' })).toMatchObject({ statut: 400, corps: { code: 'corps_invalide' } })
      const r = await agir('ajouter_elements', { tableau: 'abcdefgh12', elements: [{ type: 'bulle' }] })
      expect(r).toMatchObject({ statut: 400, corps: { code: 'arguments_invalides' } })
      expect(r.corps.erreur).toContain('elements[0].type')
    })

    it('la source ne s’allume qu’avec un secret ; elle lit le nom de son agent et son fournisseur', () => {
      const dits: string[] = []
      const [a, b, c] = sourcesDe(
        JSON.stringify([
          {
            source: 'silak',
            nom: 'Silak',
            dossier: 'Clients',
            origine: 'https://silak.fr',
            secret: SECRET,
            agents: true,
            agent: 'Fram',
            fournisseur: 'silak-sso',
            agentAdresse: 'https://api.silak.fr/hooks/notak/fram',
          },
          { source: 'nu', nom: 'Nu', dossier: 'D', origine: 'https://nu.fr', agents: true },
          { source: 'clair', nom: 'Clair', dossier: 'D', origine: 'https://clair.fr', secret: SECRET, agents: true, agentAdresse: 'http://clair.fr/agent' },
        ]),
        (x) => void dits.push(x),
      )
      expect(a).toMatchObject({ agents: true, agent: 'Fram', fournisseur: 'silak-sso', agentAdresse: 'https://api.silak.fr/hooks/notak/fram' })
      expect(b!.agents).toBeUndefined()
      expect(dits.some((x) => x.includes('demande un secret'))).toBe(true)
      // Une adresse de relais en clair est oubliée, et dite ; la porte reste ouverte.
      expect(dits.some((x) => x.includes('agentAdresse doit être une adresse en https'))).toBe(true)
      expect(c).toMatchObject({ agents: true })
      expect(c!.agentAdresse).toBeUndefined()
    })
  })

  describe('la personne', () => {
    it('est celle que le SSO a liée à son sujet, sinon son courriel vérifié ; jamais un compte créé', async () => {
      expect((await fait('trouver', {})).personne).toEqual({ nom: 'Ana' })
      expect((await fait('trouver', {}, { au_nom_de: { courriel: bob.utilisateur.email } })).personne).toEqual({ nom: 'Bob' })
      const inconnu = await agir('trouver', {}, { au_nom_de: { sujet: 'personne', courriel: 'personne@exemple.fr' } })
      expect(inconnu).toMatchObject({ statut: 403, corps: { code: 'personne_inconnue' } })
      const comptes = m.base.db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get() as { n: number }
      expect(comptes.n).toBe(2)
    })

    it('un courriel que Notak n’a pas vérifié ne suffit pas', async () => {
      const cyril = await m.compte('Cyril', { verifie: false })
      expect(await agir('trouver', {}, { au_nom_de: { courriel: cyril.utilisateur.email } })).toMatchObject({ statut: 403, corps: { code: 'personne_inconnue' } })
    })

    it('a ses droits, ni plus ni moins : un tableau qu’elle ne lit pas n’existe pas, un tableau qu’elle lit seulement ne s’écrit pas', async () => {
      const prive = await tableau(bob, 'prive-bob-01', 'Carnet de Bob')
      expect(await agir('lire_tableau', { tableau: prive })).toMatchObject({ statut: 404, corps: { code: 'tableau_introuvable' } })
      expect(await agir('ajouter_elements', { tableau: prive, elements: [{ type: 'note', texte: 'coucou' }] })).toMatchObject({ statut: 404 })
      const partage = await tableau(bob, 'partage-bob-1', 'Projet commun')
      expect((await m.appeler(`/api/tableaux/${partage}/partage`, { compte: bob, json: { email: ana.utilisateur.email, role: 'lecture' } })).status).toBe(200)
      expect((await fait('lire_tableau', { tableau: partage })).tableau).toMatchObject({ titre: 'Projet commun', droits: 'lecture' })
      const refus = await agir('ajouter_elements', { tableau: partage, elements: [{ type: 'note', texte: 'coucou' }] })
      expect(refus).toMatchObject({ statut: 403, corps: { code: 'lecture_seule' } })
      expect(lu(partage).elements).toHaveLength(0)
    })
  })

  describe('les opérations', () => {
    let toile: string
    beforeAll(async () => {
      toile = await tableau(ana, 'toile-ana-01', 'Lancement')
    })

    it('trouver : les espaces, les récents, le texte, ce que range un tableau', async () => {
      const r = await fait('trouver', {})
      expect(r.espaces).toEqual([expect.objectContaining({ nom: expect.any(String), accueil: ana.utilisateur.racine, personnel: true })])
      expect(Array.isArray(r.recents)).toBe(true)
      expect((await fait('trouver', { texte: 'lancem' })).resultats).toEqual([expect.objectContaining({ tableau: toile, titre: 'Lancement' })])
      const sous = await fait('creer_tableau', { titre: 'Archives', dans: toile })
      expect((await fait('trouver', { dans: toile })).contenu).toEqual([expect.objectContaining({ tableau: sous.tableau.id, titre: 'Archives', genre: 'toile' })])
      expect((await fait('trouver', { fiche: 'societe:404' })).fiche).toEqual({ etat: 'absent' })
    })

    it('creer_tableau : dans le dossier d’une fiche, créé s’il manque et qu’on donne son titre', async () => {
      expect(await agir('creer_tableau', { titre: 'Devis', fiche: { cle: 'societe:7' } })).toMatchObject({ statut: 404, corps: { code: 'tableau_introuvable' } })
      const r = await fait('creer_tableau', { titre: 'Devis', fiche: { cle: 'societe:7', titre: 'Boulangerie Martin' } })
      expect(r.dans).toMatchObject({ titre: 'Boulangerie Martin' })
      expect(await fait('trouver', { fiche: 'societe:7' })).toMatchObject({ fiche: { etat: 'present', tableau: r.dans.id, titre: 'Boulangerie Martin' } })
      // Le dossier de la fiche est rangé dans celui de la source, comme depuis le bouton de Silak ; le tableau est dedans.
      expect(lu(r.dans.id).elements.some((e) => e.contenu.type === 'tableau' && e.contenu.cible === r.tableau.id)).toBe(true)
      const second = await fait('creer_tableau', { titre: 'Planning', fiche: { cle: 'societe:7', titre: 'Autre nom' } })
      expect(second.dans.id).toBe(r.dans.id)
    })

    it('ajouter_elements : chaque type, fait comme l’app, sans rien recouvrir', async () => {
      const r = await fait('ajouter_elements', {
        tableau: toile,
        elements: [
          { type: 'titre', texte: 'Plan' },
          { type: 'note', texte: '# Objectif\nOuvrir **en mars**, avec [le site](https://exemple.fr).\n\n- un salon\n- une affiche\n  - en A2', couleur: 'jaune' },
          { type: 'taches', titre: 'À faire', taches: [{ texte: 'Devis', faite: true }, { texte: 'Maquette' }] },
          { type: 'lien', url: 'https://exemple.fr/page', titre: 'La page' },
          { type: 'table', lignes: [['Poste', 'Coût'], ['Imprimeur', '300']] },
          { type: 'colonne', titre: 'Idées', elements: [{ type: 'note', texte: 'Un salon' }, { type: 'taches', taches: [{ texte: 'Appeler' }] }] },
          { type: 'carte_mentale', central: 'Lancement', branches: [{ titre: 'Communication', enfants: [{ titre: 'Affiches' }] }, { titre: 'Budget' }] },
        ],
      })
      expect(r.crees.map((c: { type: string }) => c.type)).toEqual(['titre', 'note', 'taches', 'lien', 'table', 'colonne', 'carte_mentale'])
      const t = lu(toile)
      const de = (id: string) => t.elements.find((e) => e.id === id)!
      const [titre, note, taches, lien, table, colonne, carte] = r.crees.map((c: { id: string }) => de(c.id)) as ElementLu[]
      expect(titre!.contenu).toEqual({ type: 'note', texte: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [{ type: 'text', text: 'Plan' }] }] }, couleur: 'transparent', variante: 'titre' })
      expect(note!.contenu).toMatchObject({ type: 'note', couleur: 'jaune' })
      expect((note!.contenu.texte as { content: { type: string }[] }).content.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bulletList'])
      expect(taches!.contenu).toMatchObject({ type: 'taches', titre: 'À faire' })
      expect(JSON.stringify(taches!.contenu.texte)).toContain('"checked":true')
      expect(lien!.contenu).toEqual({ type: 'lien', url: 'https://exemple.fr/page', statut: 'attente', titre: 'La page' })
      expect(table!.contenu).toMatchObject({ type: 'table', cellules: [['Poste', 'Coût'], ['Imprimeur', '300']], largeurs: [17, 17] })
      expect(t.elements.filter((e) => e.parent === colonne!.id)).toHaveLength(2)
      // La carte mentale : l'élément ne garde que son squelette, ses sujets vivent dans `arbres`, comme dans l'app.
      const doc = new Y.Doc()
      Y.applyUpdate(doc, m.base.document(nomDuDocument(toile))!)
      expect((doc.getMap<Record<string, unknown>>('elements').get(carte!.id)!.contenu as { sujets: object }).sujets).toEqual({})
      expect(Object.values(carte!.contenu.sujets as Record<string, { titre: string }>).map((s) => s.titre).sort()).toEqual(['Affiches', 'Budget', 'Communication', 'Lancement'])
      expect(r.crees[6].plan).toMatchObject({ titre: 'Lancement', enfants: [{ titre: 'Communication', enfants: [{ titre: 'Affiches' }] }, { titre: 'Budget' }] })
      // Rien ne se recouvre.
      const boites = boitesDe(t)
      for (const a of boites) for (const b of boites) if (a !== b) expect(chevauche(a, b), `${a.id} sur ${b.id}`).toBe(false)
    })

    it('ajouter_elements : près d’un élément, dans une colonne, ou à une place prise (décalée)', async () => {
      const t0 = lu(toile)
      const ref = t0.elements.find((e) => e.contenu.type === 'note' && e.contenu.couleur === 'jaune')!
      const pres = await fait('ajouter_elements', { tableau: toile, elements: [{ type: 'note', texte: 'à côté' }], place: { pres_de: ref.id, cote: 'dessous' } })
      expect(pres.crees[0].x).toBe(Math.round(ref.x))
      expect(pres.crees[0].y).toBeGreaterThan(ref.y)
      const colonne = t0.elements.find((e) => e.contenu.type === 'colonne')!
      const dedans = await fait('ajouter_elements', { tableau: toile, elements: [{ type: 'note', texte: 'au bout' }], place: { dans_colonne: colonne.id } })
      const t = lu(toile)
      const enfants = t.elements.filter((e) => e.parent === colonne.id).sort((a, b) => (a.ordre! < b.ordre! ? -1 : 1))
      expect(enfants.at(-1)!.id).toBe(dedans.crees[0].id)
      const prise = await fait('ajouter_elements', { tableau: toile, elements: [{ type: 'note', texte: 'ici ?' }], place: { x: Math.round(ref.x), y: Math.round(ref.y) } })
      const boites = boitesDe(lu(toile))
      const neuve = boites.find((b) => b.id === prise.crees[0].id)!
      for (const b of boites) if (b !== neuve) expect(chevauche(neuve, b)).toBe(false)
      expect(await agir('ajouter_elements', { tableau: toile, elements: [{ type: 'note', texte: 'x' }], place: { pres_de: 'nulle-part' } })).toMatchObject({
        statut: 404,
        corps: { code: 'element_introuvable' },
      })
    })

    it('lire_tableau : le texte en Markdown, les tâches, les colonnes, les tables, le plan des cartes, la structure', async () => {
      const r = await fait('lire_tableau', { tableau: toile })
      expect(r.tableau).toMatchObject({ id: toile, titre: 'Lancement', droits: 'proprietaire' })
      const par = (type: string) => r.elements.filter((e: { type: string }) => e.type === type)
      expect(par('note').find((e: { couleur?: string }) => e.couleur === 'jaune').texte).toBe(
        '# Objectif\nOuvrir **en mars**, avec [le site](https://exemple.fr).\n- un salon\n- une affiche\n  - en A2',
      )
      expect(par('taches')[0]).toMatchObject({ titre: 'À faire', taches: [{ texte: 'Devis', faite: true }, { texte: 'Maquette', faite: false }] })
      expect(par('table')[0].lignes).toEqual([['Poste', 'Coût'], ['Imprimeur', '300']])
      const colonne = par('colonne')[0]
      expect(colonne.elements).toHaveLength(3)
      expect(r.elements.find((e: { id: string }) => e.id === colonne.elements[0])).toMatchObject({ colonne: colonne.id, rang: 0, texte: 'Un salon' })
      expect(par('carte_mentale')[0].plan.enfants.map((b: { titre: string }) => b.titre)).toEqual(['Communication', 'Budget'])
      expect(r.structure.chevauchements).toEqual([])
      expect(r.structure.place_libre).toEqual({ x: expect.any(Number), y: expect.any(Number) })
      expect(r.structure.zones.length).toBeGreaterThan(0)
    })

    it('modifier_elements : texte, couleur, tâches, table, branches ; tout ou rien', async () => {
      const t = (await fait('lire_tableau', { tableau: toile })).elements as { id: string; type: string; plan?: any; couleur?: string }[]
      const note = t.find((e) => e.type === 'note' && e.couleur === 'jaune')!
      const taches = t.find((e) => e.type === 'taches')!
      const table = t.find((e) => e.type === 'table')!
      const carte = t.find((e) => e.type === 'carte_mentale')!
      const budget = carte.plan.enfants.find((b: { titre: string }) => b.titre === 'Budget')
      // Une erreur au dernier changement : rien des premiers.
      const rate = await agir('modifier_elements', { tableau: toile, modifications: [{ id: note.id, texte: 'perdu' }, { id: 'nulle-part', texte: 'x' }] })
      expect(rate).toMatchObject({ statut: 404, corps: { code: 'element_introuvable' } })
      expect(rate.corps.erreur).toContain('Relis le tableau')
      expect(JSON.stringify(lu(toile).elements.find((e) => e.id === note.id)!.contenu)).not.toContain('perdu')
      const r = await fait('modifier_elements', {
        tableau: toile,
        modifications: [
          { id: note.id, texte: 'Ouvrir en **avril**', couleur: 'vert' },
          { id: taches.id, cocher: [{ rang: 1, faite: true }] },
          { id: table.id, lignes: [['Poste', 'Coût'], ['Imprimeur', '350'], ['Salle', '200']] },
          { id: carte.id, branches: [{ action: 'renommer', sujet: budget.id, titre: 'Budget prévisionnel' }, { action: 'ajouter', sujet: budget.id, titre: 'Devis' }] },
        ],
      })
      expect(r.modifies).toEqual([note.id, taches.id, table.id, carte.id])
      expect(r.plans[carte.id].enfants[1]).toMatchObject({ titre: 'Budget prévisionnel', enfants: [{ titre: 'Devis' }] })
      // Ce que valait chaque champ changé, dans les mots de l'opération : de quoi défaire.
      expect(r.avant[note.id]).toEqual({ texte: expect.stringContaining('Ouvrir **en mars**'), couleur: 'jaune' })
      expect(r.avant[taches.id]).toEqual({ cocher: [{ rang: 1, faite: false }] })
      expect(r.avant[table.id]).toEqual({ lignes: [['Poste', 'Coût'], ['Imprimeur', '300']] })
      expect(r.plans_avant[carte.id].enfants[1]).toMatchObject({ titre: 'Budget', enfants: [] })
      const apres = (await fait('lire_tableau', { tableau: toile, elements: [note.id, taches.id, table.id] })).elements
      expect(apres.find((e: { id: string }) => e.id === note.id)).toMatchObject({ texte: 'Ouvrir en **avril**', couleur: 'vert' })
      expect(apres.find((e: { id: string }) => e.id === taches.id).taches.map((x: { faite: boolean }) => x.faite)).toEqual([true, true])
      expect(apres.find((e: { id: string }) => e.id === table.id).lignes).toHaveLength(3)
      expect(await agir('modifier_elements', { tableau: toile, modifications: [{ id: table.id, texte: 'non' }] })).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
    })

    it('jeter_elements puis remettre_elements : la corbeille du tableau, rien d’effacé', async () => {
      const note = lu(toile).elements.find((e) => e.contenu.type === 'note' && e.contenu.couleur === 'vert')!
      expect(await fait('jeter_elements', { tableau: toile, elements: [note.id] })).toEqual({ jetes: [note.id], deja: [] })
      expect(lu(toile).elements.find((e) => e.id === note.id)!.corbeille).toEqual(expect.any(Number))
      expect((await fait('lire_tableau', { tableau: toile })).elements.some((e: { id: string }) => e.id === note.id)).toBe(false)
      expect(await fait('jeter_elements', { tableau: toile, elements: [note.id] })).toEqual({ jetes: [], deja: [note.id] })
      expect(await fait('remettre_elements', { tableau: toile, elements: [note.id] })).toEqual({ remis: [note.id], deja: [] })
      expect(lu(toile).elements.find((e) => e.id === note.id)!.corbeille).toBeUndefined()
    })

    it('la même demande renvoyée ne refait rien ; le même identifiant pour une autre est refusé', async () => {
      const avant = lu(toile).elements.length
      const une = await agir('ajouter_elements', { tableau: toile, elements: [{ type: 'note', texte: 'une fois' }] }, { id: 'essai-idempotent-1' })
      const deux = await agir('ajouter_elements', { tableau: toile, elements: [{ type: 'note', texte: 'une fois' }] }, { id: 'essai-idempotent-1' })
      expect(deux.corps).toEqual(une.corps)
      expect(lu(toile).elements.length).toBe(avant + 1)
      expect(await agir('ajouter_elements', { tableau: toile, elements: [{ type: 'note', texte: 'autre' }] }, { id: 'essai-idempotent-1' })).toMatchObject({
        statut: 409,
        corps: { code: 'id_reutilise' },
      })
    })
  })

  it('scénario : un tableau neuf, une carte mentale pertinente, puis le tout rangé', async () => {
    const neuf = await fait('creer_tableau', { titre: 'Rentrée de la boulangerie' })
    const id = neuf.tableau.id as string
    expect(neuf.dans).toMatchObject({ id: ana.utilisateur.racine })
    expect(neuf.carte).toEqual(expect.any(String))
    expect(neuf.tableau.adresse).toBe(`${ORIGINE_ESSAI}/t/${id}`)
    const dossier = await fait('creer_tableau', { titre: 'Archives de la boulangerie', dossier: true })
    expect(dossier.tableau.adresse).toBe(`${ORIGINE_ESSAI}/?dossier=${dossier.tableau.id}`)
    // Sa carte est posée dans l'accueil.
    expect(lu(ana.utilisateur.racine).elements.some((e) => e.contenu.type === 'tableau' && e.contenu.cible === id)).toBe(true)
    const carte = await fait('ajouter_elements', {
      tableau: id,
      elements: [
        {
          type: 'carte_mentale',
          central: 'Rentrée',
          structure: 'logique-droite',
          branches: [
            { titre: 'Offre', enfants: [{ titre: 'Pain de saison' }, { titre: 'Goûters' }] },
            { titre: 'Communication', enfants: [{ titre: 'Vitrine' }, { titre: 'Réseaux' }] },
            { titre: 'Équipe', enfants: [{ titre: 'Horaires' }] },
          ],
        },
      ],
    })
    const notes = await fait('ajouter_elements', {
      tableau: id,
      elements: [
        { type: 'note', texte: 'Pain au levain' },
        { type: 'note', texte: 'Affiche A2' },
        { type: 'taches', titre: 'Équipe', taches: [{ texte: 'Planning' }] },
        { type: 'note', texte: 'Brioches du mercredi' },
      ],
      place: { disposition: 'grille' },
    })
    const [levain, affiche, equipe, brioches] = notes.crees.map((c: { id: string }) => c.id)
    const r = await fait('ranger', {
      tableau: id,
      groupes: [
        { titre: 'Offre', elements: [levain, brioches] },
        { titre: 'Communication', elements: [affiche], en_colonne: true },
        { titre: 'Équipe', elements: [equipe] },
      ],
    })
    expect(r.titres).toHaveLength(2)
    expect(r.colonnes).toHaveLength(1)
    const t = lu(id)
    // Rien n'a disparu : la carte, les quatre éléments, deux titres et une colonne.
    expect(t.elements.filter((e) => e.corbeille === undefined)).toHaveLength(1 + 4 + 2 + 1)
    expect(t.elements.find((e) => e.id === affiche)!.parent).toBe(r.colonnes[0])
    const boites = boitesDe(t)
    for (const a of boites) for (const b of boites) if (a !== b) expect(chevauche(a, b), `${a.id} sur ${b.id}`).toBe(false)
    // Les groupes se suivent de gauche à droite, chacun empilé sous son titre.
    const x = (e: string) => boites.find((b) => b.id === e)!.x
    expect(x(levain)).toBe(x(brioches))
    expect(x(levain)).toBeLessThan(x(r.colonnes[0]))
    expect(x(r.colonnes[0])).toBeLessThan(x(equipe))
    const lecture = await fait('lire_tableau', { tableau: id })
    expect(lecture.elements.find((e: { id: string }) => e.id === carte.crees[0].id).structure).toBe('logique-droite')
    expect(lecture.structure.chevauchements).toEqual([])
    // Défaire le rangement : chaque élément reprend sa place d'avant, puis les titres et la colonne neufs partent.
    expect(r.avant[affiche]).toEqual({ x: expect.any(Number), y: expect.any(Number) })
    const avantRangement = Object.entries(r.avant as Record<string, { x: number; y: number }>)
    const defait = await fait('modifier_elements', { tableau: id, modifications: avantRangement.map(([el, place]) => ({ id: el, ...place })) })
    expect(defait.avant[affiche]).toEqual({ place: { colonne: r.colonnes[0], rang: 0 } })
    await fait('jeter_elements', { tableau: id, elements: [...r.titres, ...r.colonnes] })
    const remis = lu(id)
    for (const [el, place] of avantRangement) expect(remis.elements.find((e) => e.id === el)).toMatchObject({ x: place.x, y: place.y })
    expect(remis.elements.find((e) => e.id === affiche)!.parent).toBeUndefined()
    expect(remis.elements.find((e) => e.id === affiche)!.corbeille).toBeUndefined()
    await fait('remettre_elements', { tableau: id, elements: r.titres })
    // Ranger deux fois ne double pas les titres : ils sont repris.
    const encore = await fait('ranger', { tableau: id, groupes: [{ titre: 'Offre', elements: [levain, brioches] }] })
    expect(encore.titres).toEqual([])
    expect(lu(id).elements.filter((e) => e.contenu.variante === 'titre')).toHaveLength(2)
  })

  it('l’activité dit la personne avec l’agent', () => {
    const lignes = m.base.activite(ana.utilisateur.racine, 10)
    // Sans synchro (ce monde d'essai), l'activité ne se note pas ; la base garde l'agent quand elle se note.
    m.base.noterActivite({ tableau: ana.utilisateur.racine, auteur: ana.utilisateur.id, genre: 'cree', element: 'el', typeElement: 'note', libelle: 'x', instant: m.maintenant(), agent: 'Fram' }, 0)
    expect(m.base.activite(ana.utilisateur.racine, 10).length).toBe(lignes.length + 1)
    expect(m.base.activite(ana.utilisateur.racine, 1)[0]).toMatchObject({ agent: 'Fram', auteur: { id: ana.utilisateur.id } })
  })
})

describe('la porte des agents, par la synchro comme en production', () => {
  let m: Monde
  let serveur: Hocuspocus | null = null
  let ana: Compte
  afterAll(() => m.fermer())

  it('écrit en direct dans le document ouvert, et l’activité dit « Ana avec Fram »', async () => {
    m = monde({ rattachements: [SILAK], synchro: () => serveur })
    serveur = creerHocuspocus(m.base, m.auth, m.autorisation, m.maintenant)
    ana = await m.compte('Ana')
    const q = new Date().toISOString()
    m.base.db.prepare('INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run('c-ana', 'silak-ana', 'silak', ana.utilisateur.id, q, q)
    expect((await m.appeler('/api/tableaux', { compte: ana, json: { id: 'direct-ana-1', titre: 'En direct' } })).status).toBe(201)
    // Quelqu'un a le tableau ouvert : il voit arriver la carte.
    const ouvert = await serveur.openDirectConnection(nomDuDocument('direct-ana-1'), {})
    const corps = JSON.stringify({
      id: 'essai-direct-0001',
      au_nom_de: { sujet: 'silak-ana' },
      operation: 'ajouter_elements',
      arguments: { tableau: 'direct-ana-1', elements: [{ type: 'carte_mentale', central: 'Projet', branches: [{ titre: 'Étape 1' }] }, { type: 'note', texte: 'Bonjour' }] },
    })
    const r = await m.appelerBrut('/api/outils/silak/agent', { method: 'POST', headers: { 'notak-signature': signer(SECRET, corps, m.maintenant()) }, body: corps })
    expect(r.status).toBe(200)
    const vus = [...ouvert.document!.getMap<{ contenu: { type: string } }>('elements').values()].map((e) => e.contenu.type).sort()
    expect(vus).toEqual(['arbre', 'note'])
    expect(ouvert.document!.getMap('arbres').size).toBe(2)
    await ouvert.disconnect()
    const gestes = m.base.activite('direct-ana-1', 10)
    expect(gestes.length).toBeGreaterThan(0)
    expect(gestes.every((g) => g.agent === 'Fram' && g.auteur.id === ana.utilisateur.id)).toBe(true)
    expect(regrouper(gestes)[0]).toMatchObject({ agent: 'Fram', auteur: { nom: 'Ana' } })
  })
})

describe('le contrat', () => {
  it('docs/agents.schemas.json suit le code (node scripts/schemas-agents.ts le récrit)', () => {
    expect(readFileSync(CHEMIN_SCHEMAS, 'utf8')).toBe(texteDesSchemas())
  })

  it('chaque opération a sa description et ses arguments ; la validation dit où est l’erreur', () => {
    for (const nom of NOMS_OPERATIONS) expect(OPERATIONS[nom].description.length).toBeGreaterThan(40)
    expect(validerArguments('lire_tableau', {})).toBe('tableau : manque')
    expect(validerArguments('ranger', { tableau: 'abcdefgh12', groupes: [{ elements: [] }] })).toBe('groupes[0].elements : au moins 1 attendu(s)')
    expect(validerArguments('ajouter_elements', { tableau: 'abcdefgh12', elements: [{ type: 'carte_mentale', central: 'X', branches: [{ titre: 'a', enfants: [{ titre: 'b', bizarre: 1 }] }] }] })).toContain(
      'elements[0].branches[0].enfants[0].bizarre : champ inconnu',
    )
    expect(validerArguments('trouver', {})).toBeNull()
  })

  it('le serveur charge la porte sous Node, sans bundler (comme en production)', () => {
    const racine = join(import.meta.dirname, '..', '..', '..')
    const sortie = execFileSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./apps/serveur/src/agents.ts'); console.log(typeof m.creerPorte)"], {
      cwd: racine,
      encoding: 'utf8',
    })
    expect(sortie.trim()).toBe('function')
  })
})

describe('le texte des notes', () => {
  it('le Markdown simple et retour', () => {
    const md = '# Titre\n## Sous-titre\nUn **gras**, un _italique_, un ~~barré~~ et [un lien](https://a.fr).\n- un\n  - deux\n1. premier\n> une citation\n---'
    const doc = docDepuisMarkdown(md)
    expect(doc.content!.map((b) => b.type)).toEqual(['heading', 'heading', 'paragraph', 'bulletList', 'orderedList', 'blockquote', 'horizontalRule'])
    expect(markdownDepuisDoc(doc)).toBe(md)
  })

  it('un texte vide fait une note vide, comme dans l’app', () => {
    expect(docDepuisMarkdown('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})
