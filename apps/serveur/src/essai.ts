import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { creerApp } from './app.ts'
import { inject } from 'vitest'
import { type Auth, creerAuth } from './auth.ts'
import { type Autorisation, ouvrirAutorisation } from './autorisation.ts'
import { type Base, type Utilisateur, ouvrirBase } from './base.ts'
import type { Cle } from './chiffrement.ts'
import type { Courriel } from './courriel.ts'
import type { ElementLu, NoeudTexte } from './contenu.ts'
import { creerLimiteur } from './debit.ts'
import { nomDuDocument } from './synchro.ts'

// Un petit monde pour essayer les routes sans réseau : une base en mémoire, l'application appelée directement.
// Les comptes sont créés par Better Auth, appelé directement : son cookie de session sert ensuite aux appels.

export interface Compte {
  utilisateur: Utilisateur
  cookie: string
}

export const ORIGINE_ESSAI = 'http://notak.essai'

/** Better Auth sur cette base, comme le monte `serveur.ts`, sans courriel ni fournisseur. */
export function authEssai(base: Base): Auth {
  return creerAuth({
    base,
    secret: 'un-secret-d-essai-assez-long-pour-better-auth',
    origine: ORIGINE_ESSAI,
    cookieSecurise: false,
    courrier: { actif: false, envoyer: async () => {} },
  })
}

/**
 * Inscrit un compte par Better Auth ; rend le compte et le cookie de sa session. Son adresse compte pour vérifiée,
 * comme celle d'un compte qui a ouvert le lien du courriel, sauf `verifie: false`.
 */
export async function inscrireEssai(auth: Auth, base: Base, nom: string, langue?: 'fr' | 'en', options: { verifie?: boolean } = {}): Promise<Compte> {
  // L'adresse se tire du nom sans ses accents : Better Auth n'accepte que des adresses ASCII.
  const adresse = `${nom.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()}@exemple.fr`
  const r = await auth.api.signUpEmail({ body: { email: adresse, password: 'motdepasse', name: nom, langue } as never, returnHeaders: true })
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]!
  if (options.verifie !== false) base.verifierEmail(r.response.user.id)
  return { utilisateur: base.utilisateurParId(r.response.user.id)!, cookie }
}

/** Un compte posé directement dans la base, sans mot de passe ni session : pour les essais qui n'en ont pas besoin. */
export function poserUtilisateur(base: Base, u: Utilisateur): void {
  const maintenant = new Date().toISOString()
  base.db
    .prepare('INSERT INTO utilisateurs (id,email,nom,couleur,racine,photo,email_verifie,cree,modifie) VALUES (?,?,?,?,?,?,1,?,?)')
    .run(u.id, u.email, u.nom, u.couleur, u.racine, u.photo ?? null, maintenant, maintenant)
}

declare module 'vitest' {
  export interface ProvidedContext {
    /** L'adresse de l'OpenFGA lancé pour les essais (`vitest.openfga.ts`). */
    openfga: string
  }
}

let magasins = 0
/** OpenFGA, celui que lance la mise en place des essais (`vitest.openfga.ts`), dans un magasin à soi. */
export function autorisationEssai(base: Base): Autorisation {
  return ouvrirAutorisation({ base, url: inject('openfga'), nom: `essai-${process.pid}-${++magasins}` })
}

/** L'adresse de l'OpenFGA des essais, pour un serveur lancé par `demarrer`. */
export const openfgaEssai = (): string => inject('openfga')

export interface Monde {
  base: Base
  auth: Auth
  autorisation: Autorisation
  dossier: string
  compte(nom: string, options?: { verifie?: boolean }): Promise<Compte>
  /** Crée un tableau à `proprietaire` et y écrit ce que fait `ecrire` ; l'état est enregistré comme le ferait la synchro. */
  tableau(proprietaire: Compte, id: string, titre: string, ecrire?: (doc: Y.Doc) => void, parent?: string): void
  appeler(
    chemin: string,
    options?: { methode?: string; compte?: Compte; cookie?: string; json?: unknown; corps?: Uint8Array; type?: string; entetes?: Record<string, string> },
  ): Promise<Response>
  /** L'application appelée telle quelle (en-têtes et corps à la main), pour ce que `appeler` ne sait pas dire. */
  appelerBrut(chemin: string, init?: RequestInit): Promise<Response>
  /** L'heure du monde (ms), qui avance d'une milliseconde à chaque lecture. */
  maintenant(): number
  /** Fait passer le temps du monde : une échéance arrive, un lien expire. */
  avancer(ms: number): void
  fermer(): void
}

/**
 * `cle` : le monde chiffre au repos, comme un serveur qui a reçu `NOTAK_CLE`. `courriels` : les courriels partent,
 * et s'empilent là. `fermetures` : le nom de chaque document dont la synchro ferme les connexions s'y empile.
 */
export function monde(options: { cle?: Cle; courriels?: Courriel[]; fermetures?: string[] } = {}): Monde {
  const dossier = mkdtempSync(join(tmpdir(), 'notak-monde-'))
  const base = ouvrirBase(':memory:', options.cle ?? null)
  const auth = authEssai(base)
  const autorisation = autorisationEssai(base)
  // Une horloge qui avance d'une milliseconde à chaque lecture : deux gestes ne tombent jamais au même instant.
  let instant = Date.now()
  const app = creerApp({
    base,
    auth,
    autorisation,
    moyens: { fournisseurs: [], courriel: false },
    dossierFichiers: join(dossier, 'fichiers'),
    limiteur: creerLimiteur(1000, 60_000),
    maintenant: () => ++instant,
    synchro: () => (options.fermetures ? ({ closeConnections: (nom: string) => void options.fermetures!.push(nom) } as never) : null),
    relaisFiable: false,
    cookieSecurise: false,
    cle: options.cle ?? null,
    origine: ORIGINE_ESSAI,
    ...(options.courriels ? { courrier: { actif: true, envoyer: async (c: Courriel) => void options.courriels!.push(c) } } : {}),
  })
  return {
    base,
    auth,
    autorisation,
    dossier,
    compte: (nom, o) => inscrireEssai(auth, base, nom, undefined, o),
    tableau(proprietaire, id, titre, ecrire, parent) {
      base.creerTableau({ id, titre, proprietaire: proprietaire.utilisateur.id, parent: parent ?? null })
      base.definirAcces({ tableau: id, utilisateur: proprietaire.utilisateur.id, role: 'proprietaire' })
      const doc = new Y.Doc()
      doc.getMap('meta').set('titre', titre)
      ecrire?.(doc)
      base.enregistrerDocument(nomDuDocument(id), Y.encodeStateAsUpdate(doc))
    },
    appeler(chemin, options = {}) {
      const entetes: Record<string, string> = { ...options.entetes }
      if (options.compte) entetes.cookie = options.compte.cookie
      if (options.cookie) entetes.cookie = options.cookie
      if (options.json !== undefined) entetes['content-type'] = 'application/json'
      if (options.type) entetes['content-type'] = options.type
      // Comme un navigateur : l'origine de la page part avec chaque appel (Better Auth la vérifie).
      entetes.origin = ORIGINE_ESSAI
      return Promise.resolve(
        app.request(chemin, {
          method: options.methode ?? (options.json !== undefined || options.corps ? 'POST' : 'GET'),
          headers: entetes,
          body: options.json !== undefined ? JSON.stringify(options.json) : options.corps,
        }),
      )
    },
    appelerBrut: (chemin, init) => Promise.resolve(app.request(chemin, init)),
    maintenant: () => instant,
    avancer(ms) {
      instant += ms
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
