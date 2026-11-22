import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { Hocuspocus } from '@hocuspocus/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { regrouper } from './activite.ts'
import { CHEMIN_SCHEMAS, texteDesSchemas } from '../../../scripts/schemas-agents.ts'
import { NOMS_OPERATIONS, OPERATIONS, validerArguments } from './agentsContrat.ts'
import { boitesDe, chevauche } from '../../../packages/tableau/src/agents/poser.ts'
import { ajouterAPage, blocsDePage, docDePage, docDepuisMarkdown, idsDesBlocs, markdownDePage, markdownDepuisDoc, pageRiche, retirerDePage } from '../../../packages/tableau/src/agents/texte.ts'
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
  /** Change le document enregistré d'un tableau, comme l'app l'aurait fait (ce monde d'essai n'a pas de synchro). */
  const ecrire = (tableau: string, f: (elements: Y.Map<Record<string, unknown>>) => void) => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument(tableau))!)
    f(doc.getMap<Record<string, unknown>>('elements'))
    m.base.enregistrerDocument(nomDuDocument(tableau), Y.encodeStateAsUpdate(doc))
    doc.destroy()
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

    describe('les pages', () => {
      let pages: string
      beforeAll(async () => {
        pages = await tableau(ana, 'pages-ana-01', 'Pages')
      })
      const md = '# Rendez-vous\nLe **12 décembre**, avec [le site](https://exemple.fr).\n- Devis\n- [ ] Rappeler'

      it('ajouter_elements : une page, faite comme l’app, avec son adresse ; lire_tableau la lit en Markdown', async () => {
        const r = await fait('ajouter_elements', {
          tableau: pages,
          elements: [
            { type: 'page', titre: 'Wilfried Robert', texte: md, couleur: 'bleu' },
            { type: 'page', titre: '  En   vue carte ', texte: 'Un début.', apercu: true },
            { type: 'carte_mentale', central: 'Rendez-vous', branches: [{ titre: 'Avant' }] },
          ],
        })
        const [page, carte, mentale] = r.crees
        expect(page).toMatchObject({ type: 'page', l: 10, adresse: `${ORIGINE_ESSAI}/t/${pages}/e/${page.id}` })
        expect(carte).toMatchObject({ type: 'page', l: 34 })
        expect(mentale.adresse).toBe(`${ORIGINE_ESSAI}/t/${pages}/e/${mentale.id}`)
        const el = lu(pages).elements.find((e) => e.id === page.id)!
        expect(el.contenu).toMatchObject({ type: 'document', titre: 'Wilfried Robert', couleur: 'bleu' })
        expect((el.contenu.texte as { content: { type: string }[] }).content.map((b) => b.type)).toEqual(['heading', 'paragraph', 'puce', 'tache'])
        expect(lu(pages).elements.find((e) => e.id === carte.id)!.contenu).toMatchObject({ titre: 'En vue carte', carte: true })
        const lecture = await fait('lire_tableau', { tableau: pages })
        const lue = lecture.elements.find((e: { id: string }) => e.id === page.id)
        expect(lue).toMatchObject({ type: 'page', titre: 'Wilfried Robert', texte: md, couleur: 'bleu', adresse: page.adresse, empreinte: expect.stringMatching(/^[0-9a-f]{16}$/) })
        expect(lue.riche).toBeUndefined()
        expect(lecture.elements.find((e: { id: string }) => e.id === carte.id)).toMatchObject({ apercu: true })
        expect(lecture.elements.find((e: { id: string }) => e.id === mentale.id).adresse).toBe(mentale.adresse)
        expect(await agir('ajouter_elements', { tableau: pages, elements: [{ type: 'page', texte: 'sans titre' }] })).toMatchObject({ statut: 400, corps: { code: 'arguments_invalides' } })
      })

      it('lire_tableau : le début d’une longue page dans le tableau entier, son texte entier quand on la lit seule', async () => {
        const long = Array.from({ length: 400 }, (_, i) => `Paragraphe ${i} du compte rendu.`).join('\n')
        const r = await fait('ajouter_elements', { tableau: pages, elements: [{ type: 'page', titre: 'Compte rendu', texte: long }] })
        const id = r.crees[0].id
        const entier = (await fait('lire_tableau', { tableau: pages })).elements.find((e: { id: string }) => e.id === id)
        expect(entier).toMatchObject({ tronque: true })
        expect(entier.texte.length).toBe(4000)
        const seule = (await fait('lire_tableau', { tableau: pages, elements: [id] })).elements[0]
        expect(seule.texte).toBe(long)
        expect(seule.tronque).toBeUndefined()
        expect(seule.empreinte).toBe(entier.empreinte)
      })

      it('modifier_elements : le texte d’une page, puis l’annulation par avant, qui n’écrase pas une retouche', async () => {
        const id = (await fait('ajouter_elements', { tableau: pages, elements: [{ type: 'page', titre: 'Note de cadrage', texte: md }] })).crees[0].id
        const { empreinte } = (await fait('lire_tableau', { tableau: pages, elements: [id] })).elements[0]
        const r = await fait('modifier_elements', { tableau: pages, modifications: [{ id, texte: '# Rendez-vous\nLe **13 décembre**.', attendu: empreinte, titre: 'Cadrage', couleur: 'vert' }] })
        expect(r.modifies).toEqual([id])
        expect(r.avant[id]).toEqual({ texte: md, titre: 'Note de cadrage', couleur: 'aucune', attendu: r.empreintes[id] })
        expect(lu(pages).elements.find((e) => e.id === id)!.contenu).toMatchObject({ titre: 'Cadrage', couleur: 'vert' })
        // Une empreinte qui n'est plus celle du texte : rien ne change.
        const perime = await agir('modifier_elements', { tableau: pages, modifications: [{ id, texte: 'perdu', attendu: empreinte }] })
        expect(perime).toMatchObject({ statut: 409, corps: { code: 'modifie_depuis' } })
        // L'annulation : avant, renvoyé tel quel.
        await fait('modifier_elements', { tableau: pages, modifications: [{ id, ...r.avant[id] }] })
        expect((await fait('lire_tableau', { tableau: pages, elements: [id] })).elements[0]).toMatchObject({ texte: md, titre: 'Note de cadrage', empreinte })
        // Retouchée à la main après le geste de l'agent : son annulation ne l'écrase pas.
        const geste = await fait('modifier_elements', { tableau: pages, modifications: [{ id, texte: 'Version de l’agent' }] })
        ecrire(pages, (elements) => {
          const e = elements.get(id)!
          elements.set(id, { ...e, contenu: { ...(e.contenu as object), texte: docDePage('Version de l’agent, retouchée par Ana') } })
        })
        expect(await agir('modifier_elements', { tableau: pages, modifications: [{ id, ...geste.avant[id] }] })).toMatchObject({ statut: 409, corps: { code: 'modifie_depuis' } })
        expect((await fait('lire_tableau', { tableau: pages, elements: [id] })).elements[0].texte).toBe('Version de l’agent, retouchée par Ana')
      })

      it('modifier_elements : ajouter à la fin d’une page ou d’une note, puis le défaire', async () => {
        const [page, note] = (await fait('ajouter_elements', { tableau: pages, elements: [{ type: 'page', titre: 'Suivi', texte: md }, { type: 'note', texte: 'Une note' }] })).crees.map((c: { id: string }) => c.id)
        const r = await fait('modifier_elements', {
          tableau: pages,
          modifications: [
            { id: page, ajouter_texte: '## Prochaines étapes\n- Envoyer le devis' },
            { id: note, ajouter_texte: '- un point de plus' },
          ],
        })
        expect(r.avant[page]).toEqual({ retirer_blocs: [expect.stringMatching(/^[0-9a-z]{10}$/), expect.stringMatching(/^[0-9a-z]{10}$/)], attendu: r.empreintes[page] })
        expect(r.avant[note]).toEqual({ texte: 'Une note' })
        const apres = (await fait('lire_tableau', { tableau: pages, elements: [page, note] })).elements
        expect(apres.find((e: { id: string }) => e.id === page).texte).toBe(`${md}\n## Prochaines étapes\n- Envoyer le devis`)
        expect(apres.find((e: { id: string }) => e.id === note).texte).toBe('Une note\n- un point de plus')
        const defait = await fait('modifier_elements', { tableau: pages, modifications: [{ id: page, ...r.avant[page] }, { id: note, ...r.avant[note] }] })
        // Défaire le retrait remettrait les blocs à la fin.
        expect(defait.avant[page]).toEqual({ ajouter_texte: '## Prochaines étapes\n- Envoyer le devis', attendu: defait.empreintes[page] })
        const remis = (await fait('lire_tableau', { tableau: pages, elements: [page, note] })).elements
        expect(remis.find((e: { id: string }) => e.id === page).texte).toBe(md)
        expect(remis.find((e: { id: string }) => e.id === note).texte).toBe('Une note')
        expect(await agir('modifier_elements', { tableau: pages, modifications: [{ id: note, retirer_blocs: ['abc'] }] })).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(await agir('modifier_elements', { tableau: pages, modifications: [{ id: note, texte: 'x', attendu: '0123456789abcdef' }] })).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(await agir('modifier_elements', { tableau: pages, modifications: [{ id: page, texte: 'x', ajouter_texte: 'y' }] })).toMatchObject({ statut: 400, corps: { code: 'arguments_invalides' } })
      })

      it('une page riche ne se récrit pas d’un bloc ; on y ajoute à la fin', async () => {
        const id = (await fait('ajouter_elements', { tableau: pages, elements: [{ type: 'page', titre: 'Avec une image', texte: 'Avant l’image' }] })).crees[0].id
        ecrire(pages, (elements) => {
          const e = elements.get(id)!
          const c = e.contenu as { texte: { content: unknown[] } }
          elements.set(id, { ...e, contenu: { ...c, texte: { ...c.texte, content: [...c.texte.content, { type: 'image', attrs: { id: 'img0000001', fichier: 'f1' } }] } } })
        })
        expect((await fait('lire_tableau', { tableau: pages, elements: [id] })).elements[0]).toMatchObject({ riche: true })
        const refus = await agir('modifier_elements', { tableau: pages, modifications: [{ id, texte: 'Tout récrit' }] })
        expect(refus).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(refus.corps.erreur).toContain('ajouter_texte')
        await fait('modifier_elements', { tableau: pages, modifications: [{ id, ajouter_texte: 'Après l’image' }] })
        const blocs = (lu(pages).elements.find((e) => e.id === id)!.contenu.texte as { content: { type: string }[] }).content.map((b) => b.type)
        expect(blocs).toEqual(['paragraph', 'image', 'paragraph'])
      })

      it('un dossier et l’accueil ne rangent que des pages, des cartes mentales et des liens', async () => {
        const dossier = (await fait('creer_tableau', { titre: 'Clients en cours', dans: pages, dossier: true })).tableau.id
        const refus = await agir('ajouter_elements', { tableau: dossier, elements: [{ type: 'page', titre: 'Fiche' }, { type: 'note', texte: 'perdue' }] })
        expect(refus).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(refus.corps.erreur).toContain('« note »')
        expect(lu(dossier).elements).toHaveLength(0)
        const r = await fait('ajouter_elements', {
          tableau: dossier,
          elements: [{ type: 'page', titre: 'Fiche' }, { type: 'carte_mentale', central: 'Idées' }, { type: 'lien', url: 'https://exemple.fr' }],
        })
        // Dans un dossier, une page ou une carte s'ouvre en grand ; un lien se choisit dans la bibliothèque.
        expect(r.crees.map((c: { adresse: string }) => c.adresse)).toEqual([
          `${ORIGINE_ESSAI}/t/${dossier}/e/${r.crees[0].id}`,
          `${ORIGINE_ESSAI}/t/${dossier}/e/${r.crees[1].id}`,
          `${ORIGINE_ESSAI}/?dossier=${dossier}&element=${r.crees[2].id}`,
        ])
        expect(await agir('ajouter_elements', { tableau: ana.utilisateur.racine, elements: [{ type: 'taches', taches: [{ texte: 'x' }] }] })).toMatchObject({
          statut: 422,
          corps: { code: 'impossible' },
        })
      })
    })

    describe('les lignes', () => {
      let relations: string
      beforeAll(async () => {
        relations = await tableau(ana, 'lignes-ana-01', 'Relations')
      })

      it('ajouter_elements : une ligne entre deux éléments de la même demande (#n), faite comme l’outil Ligne', async () => {
        const r = await fait('ajouter_elements', {
          tableau: relations,
          elements: [{ type: 'note', texte: 'Cause' }, { type: 'note', texte: 'Effet' }, { type: 'ligne', de: '#1', vers: '#2', libelle: '  mène   à ' }],
        })
        const [cause, effet, ligne] = r.crees
        expect(ligne).toEqual({ id: expect.any(String), type: 'ligne', de: cause.id, vers: effet.id, adresse: `${ORIGINE_ESSAI}/t/${relations}/e/${ligne.id}` })
        expect(lu(relations).elements.find((x) => x.id === ligne.id)!.contenu).toEqual({
          type: 'ligne',
          depart: { element: cause.id },
          arrivee: { element: effet.id },
          pointeDepart: 'rien',
          pointeArrivee: 'fleche',
          trait: 'plein',
          epaisseur: 2,
          libelle: 'mène à',
        })
        // La ligne ne prend pas de place : les notes se posent côte à côte, comme sans elle.
        expect(effet.x).toBe(cause.x + cause.l + 2)
        const lue = (await fait('lire_tableau', { tableau: relations })).elements.find((x: { id: string }) => x.id === ligne.id)
        expect(lue).toMatchObject({ type: 'ligne', de: cause.id, vers: effet.id, libelle: 'mène à' })
      })

      it('une ligne entre des éléments déjà là, sans flèche ; chaque bout est vérifié', async () => {
        const [a, b] = lu(relations).elements.filter((e) => e.contenu.type === 'note')
        const r = await fait('ajouter_elements', { tableau: relations, elements: [{ type: 'ligne', de: a!.id, vers: b!.id, fleche: false }] })
        const ligne = r.crees[0].id
        expect(lu(relations).elements.find((x) => x.id === ligne)!.contenu).toMatchObject({ pointeArrivee: 'rien', depart: { element: a!.id } })
        const essai = (elements: unknown[], place?: unknown) => agir('ajouter_elements', { tableau: relations, elements, ...(place ? { place } : {}) })
        expect(await essai([{ type: 'ligne', de: '#3', vers: a!.id }])).toMatchObject({ statut: 400, corps: { code: 'arguments_invalides' } })
        expect(await essai([{ type: 'note', texte: 'x' }, { type: 'ligne', de: '#2', vers: '#1' }])).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(await essai([{ type: 'ligne', de: ligne, vers: a!.id }])).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(await essai([{ type: 'ligne', de: a!.id, vers: a!.id }])).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(await essai([{ type: 'note', texte: 'x' }, { type: 'ligne', de: '#1', vers: 'nulle-part' }])).toMatchObject({ statut: 404, corps: { code: 'element_introuvable' } })
        expect(await essai([{ type: 'ligne', de: a!.id }])).toMatchObject({ statut: 400, corps: { code: 'arguments_invalides' } })
        ecrire(relations, (elements) => elements.set(b!.id, { ...elements.get(b!.id)!, verrou: true }))
        expect(await essai([{ type: 'ligne', de: a!.id, vers: b!.id }])).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        ecrire(relations, (elements) => {
          const { verrou: _v, ...e } = elements.get(b!.id)!
          elements.set(b!.id, e)
        })
        const colonne = (await fait('ajouter_elements', { tableau: relations, elements: [{ type: 'colonne', titre: 'Col', elements: [{ type: 'note', texte: 'rangée' }] }] })).crees[0]
        expect(await essai([{ type: 'ligne', de: a!.id, vers: colonne.elements[0] }])).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(await essai([{ type: 'ligne', de: a!.id, vers: colonne.id }])).toMatchObject({ statut: 200 })
        expect(await essai([{ type: 'ligne', de: a!.id, vers: b!.id }], { dans_colonne: colonne.id })).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        // Rien n'a été posé par une demande refusée.
        expect(lu(relations).elements.filter((e) => e.contenu.type === 'ligne')).toHaveLength(3)
      })

      it('jeter un élément emporte ses lignes ; le remettre les remet, quand leurs deux bouts reviennent', async () => {
        const r = await fait('ajouter_elements', {
          tableau: relations,
          elements: [{ type: 'note', texte: 'A' }, { type: 'note', texte: 'B' }, { type: 'note', texte: 'C' }, { type: 'ligne', de: '#1', vers: '#2' }, { type: 'ligne', de: '#2', vers: '#3' }],
        })
        const [, b, c, ab, bc] = r.crees.map((x: { id: string }) => x.id) as string[]
        const corbeille = () => lu(relations).elements.filter((e) => e.corbeille !== undefined).map((e) => e.id)
        expect(await fait('jeter_elements', { tableau: relations, elements: [b] })).toEqual({ jetes: [b], deja: [] })
        expect(corbeille()).toEqual(expect.arrayContaining([b, ab, bc]))
        await fait('jeter_elements', { tableau: relations, elements: [c] })
        expect(await fait('remettre_elements', { tableau: relations, elements: [b] })).toEqual({ remis: [b], deja: [] })
        // A et B sont là : leur ligne revient ; C reste à la corbeille, et la ligne qui y mène aussi.
        expect(corbeille()).not.toContain(ab)
        expect(corbeille()).toContain(bc)
        expect(await fait('remettre_elements', { tableau: relations, elements: [c, bc] })).toEqual({ remis: [c, bc], deja: [] })
        expect(corbeille()).toEqual([])
        // Défaire la pose : jeter ce qu'elle a créé, la ligne comprise.
        expect((await fait('jeter_elements', { tableau: relations, elements: r.crees.map((x: { id: string }) => x.id) })).jetes).toHaveLength(5)
      })
    })

    describe('l’organisation', () => {
      const carteDans = (porteur: string, cible: string) => lu(porteur).elements.filter((e) => e.contenu.type === 'tableau' && e.contenu.cible === cible && !e.contenu.raccourci)

      it('modifier_tableau : le titre (aussitôt en base), la couleur, le dossier ; avant le défait', async () => {
        const id = (await fait('creer_tableau', { titre: 'Brouillon' })).tableau.id as string
        const r = await fait('modifier_tableau', { tableau: id, titre: '  Plan   2027 ', couleur: 'vert', dossier: true })
        expect(r).toEqual({ tableau: { id, titre: 'Plan 2027', adresse: `${ORIGINE_ESSAI}/?dossier=${id}`, dossier: true }, avant: { titre: 'Brouillon', couleur: 'aucune', dossier: false } })
        expect(m.base.tableau(id)!.titre).toBe('Plan 2027')
        expect(lu(id)).toMatchObject({ titre: 'Plan 2027', couleur: 'vert', dossier: true })
        expect((await fait('trouver', { texte: 'plan 2027' })).resultats).toEqual([expect.objectContaining({ tableau: id, titre: 'Plan 2027' })])
        const defait = await fait('modifier_tableau', { tableau: id, ...r.avant })
        expect(defait.tableau).toEqual({ id, titre: 'Brouillon', adresse: `${ORIGINE_ESSAI}/t/${id}` })
        expect(lu(id).couleur).toBeUndefined()
        expect(lu(id).dossier).toBeUndefined()
        // Un dossier qu'un outil a fait reste tel quel ; l'accueil ne se montre pas en dossier.
        const fiche = (await fait('trouver', { fiche: 'societe:7' })).fiche.tableau as string
        expect(await agir('modifier_tableau', { tableau: fiche, titre: 'Autre' })).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(await agir('modifier_tableau', { tableau: ana.utilisateur.racine, dossier: true })).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
      })

      it('deplacer : la carte change de porteur, avant.dans le remet ; une boucle se refuse d’une phrase', async () => {
        const a = (await fait('creer_tableau', { titre: 'Prism' })).tableau.id as string
        const dossier = (await fait('creer_tableau', { titre: 'Clients', dossier: true })).tableau.id as string
        const racine = ana.utilisateur.racine
        const r = await fait('deplacer', { tableau: a, vers: dossier })
        expect(r).toMatchObject({
          tableau: { id: a, titre: 'Prism', adresse: `${ORIGINE_ESSAI}/t/${a}` },
          de: { id: racine },
          vers: { id: dossier, titre: 'Clients' },
          acces: { change: false, resume: 'Personne d’autre n’y gagne ni n’y perd l’accès.' },
          avant: { dans: racine },
        })
        expect(m.base.tableau(a)!.parent).toBe(dossier)
        expect(carteDans(dossier, a).map((e) => e.id)).toEqual([r.carte])
        expect(carteDans(racine, a)).toEqual([])
        expect((await fait('trouver', { dans: dossier })).contenu).toEqual([expect.objectContaining({ tableau: a, titre: 'Prism' })])
        const boucle = await agir('deplacer', { tableau: dossier, vers: a })
        expect(boucle).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
        expect(boucle.corps.erreur).toBe('« Prism » est rangé dans « Clients » : un tableau ne se range pas dans ce qu’il contient.')
        expect(await agir('deplacer', { tableau: a, vers: a })).toMatchObject({ statut: 422 })
        // Le remettre où il était.
        const remis = await fait('deplacer', { tableau: a, vers: r.avant.dans })
        expect(remis).toMatchObject({ de: { id: dossier }, vers: { id: racine }, avant: { dans: dossier } })
        expect(m.base.tableau(a)!.parent).toBe(racine)
        expect(carteDans(racine, a)).toHaveLength(1)
        expect(carteDans(dossier, a)).toEqual([])
        // Déjà là : rien ne bouge.
        expect(await fait('deplacer', { tableau: a, vers: racine })).toMatchObject({ avant: { dans: racine }, acces: { change: false } })
        expect(carteDans(racine, a)).toHaveLength(1)
      })

      it('deplacer : quand les accès changent, rien ne bouge sans l’accord ; essai le dit', async () => {
        const a = (await fait('creer_tableau', { titre: 'Devis Prism' })).tableau.id as string
        const commun = (await fait('creer_tableau', { titre: 'Avec Bob', dossier: true })).tableau.id as string
        expect((await m.appeler(`/api/tableaux/${commun}/partage`, { compte: ana, json: { email: bob.utilisateur.email, role: 'edition' } })).status).toBe(200)
        const essai = await fait('deplacer', { tableau: a, vers: commun, essai: true })
        expect(essai).toMatchObject({ essai: true, acces: { change: true, gagnent: 1, perdent: 0, resume: '1 personne ou équipe y gagnerait l’accès.' } })
        expect(m.base.tableau(a)!.parent).toBe(ana.utilisateur.racine)
        const refus = await agir('deplacer', { tableau: a, vers: commun })
        expect(refus).toMatchObject({ statut: 409, corps: { code: 'acces_change' } })
        expect(refus.corps.erreur).toContain('1 personne ou équipe y gagnerait l’accès')
        expect(carteDans(commun, a)).toEqual([])
        const fait2 = await fait('deplacer', { tableau: a, vers: commun, accepter_acces: true })
        expect(fait2.acces).toMatchObject({ change: true, gagnent: 1 })
        expect(m.base.tableau(a)!.parent).toBe(commun)
        // Bob peut écrire dans le dossier, sans posséder le tableau d'Ana : il ne le range pas ailleurs.
        lier(bob, 'silak-bob')
        const parBob = await agir('deplacer', { tableau: a, vers: bob.utilisateur.racine }, { au_nom_de: { sujet: 'silak-bob' } })
        expect(parBob).toMatchObject({ statut: 403, corps: { code: 'interdit' } })
        // L'accueil ne se range nulle part.
        expect(await agir('deplacer', { tableau: ana.utilisateur.racine, vers: commun })).toMatchObject({ statut: 422, corps: { code: 'impossible' } })
      })
    })

    describe('la bibliothèque', () => {
      let dora: Compte
      const pour = { au_nom_de: { sujet: 'silak-dora' } }
      const faitPourDora = (operation: string, args: unknown) => fait(operation, args, pour)
      beforeAll(async () => {
        dora = await m.compte('Dora')
        lier(dora, 'silak-dora')
      })

      it('trouver : toute la bibliothèque, chaque entrée avec ce qui la range, son adresse, favori et partage', async () => {
        const clients = (await faitPourDora('creer_tableau', { titre: 'Clients', dossier: true })).tableau.id as string
        const prism = (await faitPourDora('creer_tableau', { titre: 'Prism', dans: clients })).tableau.id as string
        const [page, carte] = (await faitPourDora('ajouter_elements', { tableau: prism, elements: [{ type: 'page', titre: 'Wilfried Robert' }, { type: 'carte_mentale', central: 'Rendez-vous' }] })).crees.map(
          (c: { id: string }) => c.id,
        )
        await faitPourDora('ajouter_elements', { tableau: prism, elements: [{ type: 'note', texte: 'Une note ne se range pas en bibliothèque' }] })
        expect((await m.appeler(`/api/tableaux/${prism}/favori`, { compte: dora, methode: 'PUT' })).status).toBeLessThan(300)
        expect((await m.appeler(`/api/tableaux/${prism}/partage`, { compte: dora, json: { email: ana.utilisateur.email, role: 'lecture' } })).status).toBe(200)
        const r = (await faitPourDora('trouver', { bibliotheque: true })).bibliotheque
        expect(r.total).toBe(4)
        expect(r.suite).toBeUndefined()
        const de = (genre: string) => r.entrees.find((e: { genre: string }) => e.genre === genre)
        expect(de('dossier')).toEqual({ genre: 'dossier', titre: 'Clients', tableau: clients, adresse: `${ORIGINE_ESSAI}/?dossier=${clients}` })
        expect(de('toile')).toEqual({ genre: 'toile', titre: 'Prism', tableau: prism, dans: clients, ou: 'Clients', adresse: `${ORIGINE_ESSAI}/t/${prism}`, favori: true })
        expect(de('page')).toEqual({ genre: 'page', titre: 'Wilfried Robert', tableau: prism, element: page, ou: 'Prism', adresse: `${ORIGINE_ESSAI}/t/${prism}/e/${page}` })
        expect(de('carte_mentale')).toMatchObject({ titre: 'Rendez-vous', tableau: prism, element: carte, adresse: `${ORIGINE_ESSAI}/t/${prism}/e/${carte}` })
        // Partagée, vue par Ana.
        expect((await fait('trouver', { bibliotheque: true, genres: ['toile'] })).bibliotheque.entrees).toContainEqual(expect.objectContaining({ tableau: prism, partage: true }))
        // `dans` dit aussi les pages et les cartes mentales.
        expect((await faitPourDora('trouver', { dans: prism })).contenu).toEqual([
          { genre: 'page', titre: 'Wilfried Robert', element: page, adresse: `${ORIGINE_ESSAI}/t/${prism}/e/${page}` },
          { genre: 'carte_mentale', titre: 'Rendez-vous', element: carte, adresse: `${ORIGINE_ESSAI}/t/${prism}/e/${carte}` },
        ])
        expect((await faitPourDora('trouver', { dans: clients })).contenu).toEqual([expect.objectContaining({ tableau: prism, genre: 'toile', adresse: `${ORIGINE_ESSAI}/t/${prism}` })])
      })

      it('trouver : par pages de 50, d’un curseur à l’autre, et légère', async () => {
        const plein = (await faitPourDora('creer_tableau', { titre: 'Archives' })).tableau.id as string
        await faitPourDora('ajouter_elements', { tableau: plein, elements: Array.from({ length: 56 }, (_, i) => ({ type: 'page', titre: `Compte rendu du ${i + 1} mars` })) })
        const premiere = (await faitPourDora('trouver', { bibliotheque: true })).bibliotheque
        expect(premiere.entrees).toHaveLength(50)
        expect(premiere.total).toBe(61)
        expect(premiere.suite).toBe('50')
        const seconde = (await faitPourDora('trouver', { bibliotheque: true, curseur: premiere.suite })).bibliotheque
        expect(seconde.entrees).toHaveLength(11)
        expect(seconde.suite).toBeUndefined()
        const vues = new Set([...premiere.entrees, ...seconde.entrees].map((e: { tableau: string; element?: string }) => `${e.tableau}/${e.element ?? ''}`))
        expect(vues.size).toBe(61)
        expect((await faitPourDora('trouver', { bibliotheque: true, genres: ['dossier', 'toile'], limite: 2 })).bibliotheque).toMatchObject({ total: 3, suite: '2' })
        // Rien de ce qui ne sert qu'à dessiner une vignette : cinquante pages tiennent en moins de 12 000 signes (les
        // identifiants, de 26 signes, en font l'essentiel).
        expect(JSON.stringify(premiere).length).toBeLessThan(12_000)
        const unePage = premiere.entrees.find((e: { genre: string }) => e.genre === 'page')
        expect(Object.keys(unePage).sort()).toEqual(['adresse', 'element', 'genre', 'ou', 'tableau', 'titre'])
        // Les plus récentes d'abord : la toile où l'on vient de poser les pages.
        expect(premiere.entrees[0]).toEqual({ genre: 'toile', titre: 'Archives', tableau: plein, adresse: `${ORIGINE_ESSAI}/t/${plein}` })
      })
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
    let corpsPage = ''
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
    // Une page ouverte en écriture (la présence le dit) ne se récrit pas ; refermée, si.
    const page = await m.appelerBrut('/api/outils/silak/agent', {
      method: 'POST',
      headers: { 'notak-signature': signer(SECRET, (corpsPage = JSON.stringify({ id: 'essai-direct-0002', au_nom_de: { sujet: 'silak-ana' }, operation: 'ajouter_elements', arguments: { tableau: 'direct-ana-1', elements: [{ type: 'page', titre: 'Compte rendu', texte: 'Début' }] } })), m.maintenant()) },
      body: corpsPage,
    })
    const idPage = ((await page.json()) as Reponse).resultat!.crees[0].id as string
    // Ce qu'un client signale en ouvrant la page en grand (la présence du serveur, ici, tient lieu de la sienne).
    const presence = ouvert.document!.awareness
    presence.setLocalState({ utilisateur: { id: 'u-bob', nom: 'Bob', couleur: '#000' }, edition: idPage })
    const changer = async (n: number) => {
      const corps = JSON.stringify({ id: `essai-direct-01${n}`, au_nom_de: { sujet: 'silak-ana' }, operation: 'modifier_elements', arguments: { tableau: 'direct-ana-1', modifications: [{ id: idPage, ajouter_texte: 'Suite' }] } })
      const r = await m.appelerBrut('/api/outils/silak/agent', { method: 'POST', headers: { 'notak-signature': signer(SECRET, corps, m.maintenant()) }, body: corps })
      return { statut: r.status, corps: (await r.json()) as Reponse }
    }
    const refus = await changer(1)
    expect(refus).toMatchObject({ statut: 423, corps: { code: 'en_edition' } })
    expect(refus.corps.erreur).toContain('par Bob')
    presence.setLocalState({ utilisateur: { id: 'u-bob', nom: 'Bob', couleur: '#000' }, edition: null })
    expect((await changer(2)).statut).toBe(200)
    presence.setLocalState(null)
    await ouvert.disconnect()
    const gestes = m.base.activite('direct-ana-1', 10)
    expect(gestes.length).toBeGreaterThan(0)
    expect(gestes.every((g) => g.agent === 'Fram' && g.auteur.id === ana.utilisateur.id)).toBe(true)
    expect(regrouper(gestes)[0]).toMatchObject({ agent: 'Fram', auteur: { nom: 'Ana' } })
  })
})

describe('le relais de l’agent, avec ce que la personne lit vraiment', () => {
  const TOUR = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee'
  let m: Monde
  let ana: Compte
  let bob: Compte
  let silak: Server
  const reponses: Record<string, unknown> = {}
  const recus: Record<string, any>[] = []
  beforeAll(async () => {
    // Un faux Silak, sur un vrai port de cette machine : il garde ce qu'on lui relaie et répond selon le type.
    silak = createServer((req, res) => {
      let corps = ''
      req.on('data', (x) => (corps += x))
      req.on('end', () => {
        const lu = JSON.parse(corps) as { type: string }
        recus.push(lu)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(reponses[lu.type] ?? {}))
      })
    })
    await new Promise<void>((pret) => silak.listen(0, '127.0.0.1', pret))
    const port = (silak.address() as AddressInfo).port
    m = monde({ rattachements: [{ ...SILAK, agentAdresse: `http://127.0.0.1:${port}/hooks/notak/fram` }] })
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    const quand = new Date().toISOString()
    m.base.db.prepare('INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run('c-ana', 'silak-ana', 'silak', ana.utilisateur.id, quand, quand)
  })
  afterAll(async () => {
    m.fermer()
    silak.closeAllConnections()
    await new Promise((fini) => silak.close(fini))
  })
  const agir = async (operation: string, args: unknown, n: number) => {
    const corps = JSON.stringify({ id: `essai-relais-${n}`, au_nom_de: { sujet: 'silak-ana' }, operation, arguments: args })
    const r = await m.appelerBrut('/api/outils/silak/agent', { method: 'POST', headers: { 'notak-signature': signer(SECRET, corps, m.maintenant()) }, body: corps })
    return ((await r.json()) as Reponse).resultat!
  }

  it('la bulle paraît à qui lit le tableau ; crees, ouvrir et ouvert suivent ce que la personne lit', async () => {
    expect((await m.appeler('/api/tableaux', { compte: ana, json: { id: 'relais-ana-1', titre: 'Prism' } })).status).toBe(201)
    expect((await m.appeler('/api/tableaux', { compte: bob, json: { id: 'relais-bob-1', titre: 'Secret de Bob' } })).status).toBe(201)
    expect((await m.appeler('/api/tableaux', { compte: bob, json: { id: 'relais-bob-2', titre: 'Lu par Ana' } })).status).toBe(201)
    expect((await m.appeler('/api/tableaux/relais-bob-2/partage', { compte: bob, json: { email: ana.utilisateur.email, role: 'lecture' } })).status).toBe(200)
    const page = (await agir('ajouter_elements', { tableau: 'relais-ana-1', elements: [{ type: 'page', titre: 'Wilfried Robert', texte: 'Rendez-vous' }] }, 1)).crees[0].id as string

    // Ana lit seulement « Lu par Ana » : la bulle y paraît quand même.
    reponses['fram.fil'] = { fil: 'f1', echanges: [], tour: null }
    const lecture = await m.appeler('/api/tableaux/relais-bob-2/agent', { compte: ana })
    expect(lecture.status).toBe(200)
    expect(await lecture.json()).toMatchObject({ agent: 'Fram', disponible: true })

    reponses['fram.lire'] = {
      tour: TOUR,
      etat: 'done',
      fini: true,
      texte: 'C’est fait.',
      echec: null,
      cartes: [],
      crees: [
        { type: 'page', titre: 'Titre de Silak', tableau: 'relais-ana-1', element: page, adresse: 'https://ailleurs.exemple/piege' },
        { type: 'toile', titre: 'Secret', tableau: 'relais-bob-1' },
        { type: 'note', titre: 'Absente', tableau: 'relais-ana-1', element: 'nexistepas01' },
        { type: 'toile', titre: 'Prism', tableau: 'relais-ana-1' },
      ],
      ouvrir: { tableau: 'relais-bob-1' },
    }
    const tour = (await (await m.appeler(`/api/tableaux/relais-ana-1/agent/tours/${TOUR}`, { compte: ana })).json()) as Record<string, unknown>
    expect(tour.crees).toEqual([
      { type: 'page', titre: 'Wilfried Robert', tableau: 'relais-ana-1', element: page, adresse: `${ORIGINE_ESSAI}/t/relais-ana-1/e/${page}` },
      { type: 'toile', titre: 'Prism', tableau: 'relais-ana-1', adresse: `${ORIGINE_ESSAI}/t/relais-ana-1` },
    ])
    // Un tableau qu'Ana ne lit pas ne s'ouvre pas pour elle.
    expect(tour.ouvrir).toBeNull()

    reponses['fram.demander'] = { tour: TOUR, fil: 'f1', etat: 'queued' }
    expect((await m.appeler('/api/tableaux/relais-ana-1/agent', { compte: ana, json: { message: 'Complète-la.', ouvert: page } })).status).toBe(202)
    const demande = recus.filter((x) => x.type === 'fram.demander').at(-1)!
    expect(demande.tableau).toEqual({ id: 'relais-ana-1', titre: 'Prism', lien: `${ORIGINE_ESSAI}/t/relais-ana-1` })
    expect(demande.selection).toEqual([{ id: page, texte: `La page « Wilfried Robert » est ouverte en grand : ${ORIGINE_ESSAI}/t/relais-ana-1/e/${page}` }])
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

  it('le serveur charge la porte sous Node, sans bundler (comme en production), le Markdown des pages compris', () => {
    const racine = join(import.meta.dirname, '..', '..', '..')
    const script = [
      "const m = await import('./apps/serveur/src/agents.ts')",
      "const c = await import('./packages/tableau/src/blocs/collageMarkdown.ts')",
      "const t = await import('./packages/tableau/src/agents/texte.ts')",
      "console.log(typeof m.creerPorte, typeof c.blocsDepuisMarkdown, JSON.stringify(t.markdownDePage(t.docDePage('# Titre\\n- un'))))",
    ].join(';')
    const sortie = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: racine, encoding: 'utf8' })
    expect(sortie.trim()).toBe('function function "# Titre\\n- un"')
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

describe('le texte des pages', () => {
  const md = [
    '# Wilfried Robert',
    'Rendez-vous le **12 décembre**, avec [le site](https://exemple.fr) et `le code`.',
    '## À faire',
    '- [ ] Devis',
    '- [x] Maquette',
    '- une puce',
    '  - sous-puce',
    '1. un',
    '2. deux',
    '> une citation',
    '> sur deux lignes',
    '```js',
    'const a = 1',
    '```',
    '---',
  ].join('\n')

  it('le Markdown en blocs à plat, chacun avec son id, et retour', () => {
    const doc = docDePage(md)
    expect(doc.content!.map((b) => b.type)).toEqual(['heading', 'paragraph', 'heading', 'tache', 'tache', 'puce', 'puce', 'numero', 'numero', 'citation', 'codeBlock', 'horizontalRule'])
    expect(doc.content![6]!.attrs).toMatchObject({ retrait: 1 })
    const ids = doc.content!.map((b) => b.attrs?.id)
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{10}$/)
    expect(new Set(ids).size).toBe(ids.length)
    expect(markdownDePage(doc)).toBe(md)
    expect(pageRiche({ texte: doc })).toBe(false)
  })

  it('une page vide est celle de l’app ; un lien qui ne mène pas au web ne garde que son texte', () => {
    expect(docDePage('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    const [p] = blocsDePage('[ici](javascript:alert) et [là](mailto:a@b.fr)')
    expect(JSON.stringify(p)).not.toContain('javascript')
    expect(JSON.stringify(p)).toContain('mailto:a@b.fr')
  })

  it('lit aussi une page d’avant les blocs à plat (l’écriture imbriquée)', () => {
    const ancienne = docDepuisMarkdown('# Titre\n- un\n  - deux\n> cité')
    expect(markdownDePage(ancienne)).toBe('# Titre\n- un\n  - deux\n> cité')
    expect(pageRiche({ texte: ancienne })).toBe(false)
  })

  it('une page riche : ce que son Markdown ne dit pas', () => {
    const avec = (bloc: object) => ({ texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }, bloc] } })
    expect(pageRiche(avec({ type: 'image', attrs: { fichier: 'f1' } }))).toBe(true)
    expect(pageRiche(avec({ type: 'colonnes', content: [] }))).toBe(true)
    expect(pageRiche(avec({ type: 'paragraph', attrs: { couleur: 'rouge' } }))).toBe(true)
    expect(pageRiche(avec({ type: 'paragraph', content: [{ type: 'text', text: 'y', marks: [{ type: 'commentaireTexte', attrs: { fil: 'f' } }] }] }))).toBe(true)
    expect(pageRiche(avec({ type: 'heading', attrs: { level: 2, depliant: true } }))).toBe(true)
    expect(pageRiche({ ...avec({ type: 'paragraph' }), fils: { f: {} } })).toBe(true)
    expect(pageRiche(avec({ type: 'paragraph', attrs: { textAlign: 'left', retrait: 0, couleur: null } }))).toBe(false)
  })

  it('ajouter à la fin, puis retirer ce qu’on a ajouté', () => {
    const doc = docDePage('# Titre\nUn paragraphe')
    const ajout = blocsDePage('## Suite\n- un point', idsDesBlocs(doc))
    const apres = ajouterAPage(doc, ajout)
    expect(markdownDePage(apres)).toBe('# Titre\nUn paragraphe\n## Suite\n- un point')
    const { doc: defait, retires } = retirerDePage(apres, new Set(ajout.map((b) => b.attrs!.id as string)))
    expect(retires).toHaveLength(2)
    expect(defait).toEqual(doc)
    // Une page vide reçoit l'ajout à la place de son paragraphe vide ; tout retirer la laisse vide.
    const vide = ajouterAPage(docDePage(''), ajout)
    expect(vide.content).toEqual(ajout)
    expect(retirerDePage(vide, new Set(ajout.map((b) => b.attrs!.id as string))).doc).toEqual(docDePage(''))
  })
})
