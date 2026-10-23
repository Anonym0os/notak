import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { creerApp } from './app.ts'
import { type Base, type Utilisateur, ouvrirBase } from './base.ts'
import { inscrire } from './comptes.ts'
import type { ElementLu, NoeudTexte } from './contenu.ts'
import { creerLimiteur } from './debit.ts'
import { NOM_COOKIE, nouveauJeton } from './sessions.ts'
import { nomDuDocument } from './synchro.ts'

// Un petit monde pour essayer les routes sans réseau : une base en mémoire, l'application appelée directement.
// Les comptes sont créés sans passer par la route d'inscription (le hachage coûte), la session posée à la main.

export interface Compte {
  utilisateur: Utilisateur
  cookie: string
}

export interface Monde {
  base: Base
  dossier: string
  compte(nom: string): Promise<Compte>
  /** Crée un tableau à `proprietaire` et y écrit ce que fait `ecrire` ; l'état est enregistré comme le ferait la synchro. */
  tableau(proprietaire: Compte, id: string, titre: string, ecrire?: (doc: Y.Doc) => void, parent?: string): void
  appeler(chemin: string, options?: { methode?: string; compte?: Compte; json?: unknown; corps?: Uint8Array; type?: string }): Promise<Response>
  fermer(): void
}

export function monde(): Monde {
  const dossier = mkdtempSync(join(tmpdir(), 'notak-monde-'))
  const base = ouvrirBase(':memory:')
  // Une horloge qui avance d'une milliseconde à chaque lecture : deux gestes ne tombent jamais au même instant.
  let instant = Date.now()
  const app = creerApp({
    base,
    dossierFichiers: join(dossier, 'fichiers'),
    limiteur: creerLimiteur(1000, 60_000),
    maintenant: () => ++instant,
    synchro: () => null,
    relaisFiable: false,
    cookieSecurise: false,
  })
  return {
    base,
    dossier,
    async compte(nom) {
      const utilisateur = await inscrire(base, { email: `${nom.toLowerCase()}@exemple.fr`, motDePasse: 'motdepasse', nom })
      const { jeton, empreinte } = nouveauJeton()
      base.creerSession(empreinte, utilisateur.id, Date.now() + 3_600_000)
      return { utilisateur, cookie: `${NOM_COOKIE}=${jeton}` }
    },
    tableau(proprietaire, id, titre, ecrire, parent) {
      base.creerTableau({ id, titre, proprietaire: proprietaire.utilisateur.id, parent: parent ?? null })
      base.definirAcces({ tableau: id, utilisateur: proprietaire.utilisateur.id, role: 'proprietaire' })
      const doc = new Y.Doc()
      doc.getMap('meta').set('titre', titre)
      ecrire?.(doc)
      base.enregistrerDocument(nomDuDocument(id), Y.encodeStateAsUpdate(doc))
    },
    appeler(chemin, options = {}) {
      const entetes: Record<string, string> = {}
      if (options.compte) entetes.cookie = options.compte.cookie
      if (options.json !== undefined) entetes['content-type'] = 'application/json'
      if (options.type) entetes['content-type'] = options.type
      return Promise.resolve(
        app.request(chemin, {
          method: options.methode ?? (options.json !== undefined || options.corps ? 'POST' : 'GET'),
          headers: entetes,
          body: options.json !== undefined ? JSON.stringify(options.json) : options.corps,
        }),
      )
    },
    fermer() {
      base.fermer()
      rmSync(dossier, { recursive: true, force: true })
    },
  }
}

let compteur = 0
/** Pose un élément dans le document, comme le fait la toile. */
export function poser(doc: Y.Doc, contenu: ElementLu['contenu'], champs: Partial<ElementLu> = {}): string {
  const rang = ++compteur
  const id = champs.id ?? `el${rang}`
  doc.getMap('elements').set(id, { id, x: 0, y: 0, largeur: 34, plan: `p${String(rang).padStart(4, '0')}`, ...champs, contenu })
  return id
}

export const texte = (...paragraphes: string[]): NoeudTexte => ({
  type: 'doc',
  content: paragraphes.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
})
