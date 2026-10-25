import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ClientWriteRequestOnDuplicateWrites, ClientWriteRequestOnMissingDeletes, OpenFgaClient } from '@openfga/sdk'
import { transformer } from '@openfga/syntax-transformer'
import type { Base, Relation } from './base.ts'
import type { DroitsTableau } from '../../../packages/tableau/src/coeur/droitsElements.ts'
import type { Role } from './droits.ts'
import { synchroniserEspaces } from './espaces.ts'

// Les droits sont évalués par OpenFGA, d'après le modèle `autorisation/modele.fga`. Notak garde la vérité dans sa
// table `relations` et en envoie les changements par sa boîte d'envoi ; OpenFGA n'en est que la copie qu'il évalue.
// Un OpenFGA neuf, ou dont le magasin a disparu (un moteur en mémoire relancé), est rempli de tout au démarrage.

export const MODELE = readFileSync(new URL('../autorisation/modele.fga', import.meta.url), 'utf8')
const EMPREINTE_MODELE = createHash('sha256').update(MODELE).digest('hex').slice(0, 16)
/** OpenFGA n'accepte pas plus de cent relations par écriture. */
const PAR_ENVOI = 100

/** Ce que chaque rôle sur un tableau demande, du plus fort au plus faible. */
const ACTIONS_DES_ROLES: [Role, string][] = [
  ['proprietaire', 'peut_posseder'],
  ['edition', 'peut_ecrire'],
  ['commentaire', 'peut_commenter'],
  ['lecture', 'peut_lire'],
]

/** L'objet du modèle d'autorisation qui porte un élément d'un tableau. */
export const objetElement = (tableau: string, element: string) => `element:${tableau}/${element}`

export interface Autorisation {
  /** Vrai si `sujet` (`user:u1`, `lien:jeton`) a `relation` sur `objet` (`tableau:t1`). */
  verifier(sujet: string, relation: string, objet: string): Promise<boolean>
  /** Le meilleur rôle de ce sujet sur ce tableau, d'après le modèle, ou `null` s'il ne peut pas le lire. */
  roleSur(sujet: string, tableau: string): Promise<Role | null>
  /** Ce que ce sujet peut faire sur ce tableau et ses éléments qui ont leurs propres droits ; `null` s'il ne le lit pas. */
  droitsSur(sujet: string, tableau: string): Promise<DroitsTableau | null>
  /** Les identifiants des objets de ce type sur lesquels le sujet a cette relation. */
  lister(sujet: string, relation: string, type: string): Promise<string[]>
  /**
   * Accorde les espaces signalés, puis envoie ce qui attend dans la boîte. À attendre après un changement de droits :
   * la réponse ne part qu'une fois OpenFGA à jour. Rend les espaces dont les droits ont changé.
   */
  vider(): Promise<string[]>
}

export interface OptionsAutorisation {
  base: Base
  /** L'adresse d'OpenFGA (`http://openfga:8080`). */
  url: string
  /** Le nom du magasin créé s'il n'en existe pas. */
  nom?: string
  journal?: (ligne: string) => void
}

export function ouvrirAutorisation(o: OptionsAutorisation): Autorisation {
  const { base } = o
  const journal = o.journal ?? ((l: string) => console.warn(l))
  let client: OpenFgaClient | null = null

  /** Le magasin et le modèle, créés ou retrouvés ; un magasin neuf reçoit toutes les relations. */
  const preparer = async (): Promise<OpenFgaClient> => {
    let magasin = base.reglage('openfga.magasin')
    if (magasin) {
      try {
        await new OpenFgaClient({ apiUrl: o.url, storeId: magasin }).getStore()
      } catch {
        journal(`Notak : le magasin OpenFGA ${magasin} a disparu, il est recréé et rempli depuis la base.`)
        magasin = null
      }
    }
    if (!magasin) {
      magasin = (await new OpenFgaClient({ apiUrl: o.url }).createStore({ name: o.nom ?? 'notak' })).id
      base.transaction(() => {
        base.definirReglage('openfga.magasin', magasin!)
        base.definirReglage('openfga.empreinte', '')
        base.remplirBoite()
      })
    }
    let modele = base.reglage('openfga.modele')
    if (!modele || base.reglage('openfga.empreinte') !== EMPREINTE_MODELE) {
      const json = transformer.transformDSLToJSONObject(MODELE) as unknown as Parameters<OpenFgaClient['writeAuthorizationModel']>[0]
      modele = (await new OpenFgaClient({ apiUrl: o.url, storeId: magasin }).writeAuthorizationModel(json)).authorization_model_id
      base.definirReglage('openfga.modele', modele)
      base.definirReglage('openfga.empreinte', EMPREINTE_MODELE)
    }
    return new OpenFgaClient({ apiUrl: o.url, storeId: magasin, authorizationModelId: modele })
  }
  let pret: Promise<OpenFgaClient> | null = null
  const fga = (): Promise<OpenFgaClient> => {
    if (client) return Promise.resolve(client)
    pret ??= preparer().then(
      (c) => (client = c),
      (e: unknown) => {
        pret = null
        throw e
      },
    )
    return pret
  }

  /** OpenFGA a perdu le magasin ou le modèle (un volume effacé, un moteur en mémoire relancé) sous un Notak lancé. */
  const perdu = (e: unknown): boolean => {
    const code = (e as { apiErrorCode?: string } | null)?.apiErrorCode
    return code === 'authorization_model_not_found' || code === 'store_id_not_found' || (e as { statusCode?: number } | null)?.statusCode === 404
  }
  /** Oublie le client : le prochain appel retrouve ou refait le magasin, et le remplit s'il est neuf. */
  const oublier = () => {
    client = null
    pret = null
    journal('Notak : OpenFGA a perdu le magasin ou le modèle ; ils sont refaits depuis la base.')
  }

  const tuple = (r: Relation) => ({ user: r.sujet, relation: r.relation, object: r.objet })

  // Un seul envoi à la fois : deux envois croisés pourraient remettre dans OpenFGA un état déjà dépassé.
  let enCours: Promise<string[]> = Promise.resolve([])
  const envoyer = async (): Promise<string[]> => {
    const changes = synchroniserEspaces(base)
    try {
      await pousser()
    } catch (e) {
      if (!perdu(e)) throw e
      oublier()
      await pousser()
    }
    return changes
  }
  const pousser = async () => {
    const c = await fga()
    for (;;) {
      const lot = base.boiteEnvoi(PAR_ENVOI)
      if (lot.length === 0) break
      // La boîte ne dit pas quoi faire, seulement quoi revoir : l'état présent de la relation décide.
      const ecrire = lot.filter((r) => base.relationExiste(r))
      const effacer = lot.filter((r) => !base.relationExiste(r))
      await c.write(
        { writes: ecrire.map(tuple), deletes: effacer.map(tuple) },
        { conflict: { onDuplicateWrites: ClientWriteRequestOnDuplicateWrites.Ignore, onMissingDeletes: ClientWriteRequestOnMissingDeletes.Ignore } },
      )
      base.sortirDeBoite(lot)
    }
  }

  const vider = (): Promise<string[]> => {
    enCours = enCours.catch(() => []).then(envoyer)
    return enCours
  }
  /**
   * Avant d'évaluer : ce qui attend encore part d'abord. Une vérification voit donc toujours le dernier état écrit
   * dans la base, quel que soit le chemin qui l'a écrit.
   */
  /** Évalue par `f` ; si OpenFGA a perdu le magasin, le refait, le remplit, et réessaie une fois. */
  const evaluer = async <T>(f: (c: OpenFgaClient) => Promise<T>): Promise<T> => {
    await aJour()
    try {
      return await f(await fga())
    } catch (e) {
      if (!perdu(e)) throw e
      oublier()
      await vider()
      return f(await fga())
    }
  }
  const aJour = async () => {
    await enCours.catch(() => {})
    // Préparer d'abord : un magasin neuf remplit la boîte, qu'il faut alors envoyer avant de répondre.
    await fga()
    if (base.boiteEnvoi(1).length > 0 || base.espacesASynchroniser().length > 0) await vider()
  }

  return {
    verifier: (sujet, relation, objet) => evaluer(async (c) => (await c.check({ user: sujet, relation, object: objet })).allowed === true),
    roleSur: (sujet, tableau) =>
      evaluer(async (c) => {
        const { result } = await c.batchCheck({
          checks: ACTIONS_DES_ROLES.map(([, relation], i) => ({ user: sujet, relation, object: `tableau:${tableau}`, correlationId: String(i) })),
        })
        const permis = new Set(result.filter((r) => r.allowed).map((r) => Number(r.correlationId)))
        const trouve = ACTIONS_DES_ROLES.findIndex((_, i) => permis.has(i))
        return trouve < 0 ? null : ACTIONS_DES_ROLES[trouve]![0]
      }),
    async droitsSur(sujet, tableau) {
      const role = await this.roleSur(sujet, tableau)
      if (!role) return null
      const ids = base.elementsAvecDroits(tableau)
      if (ids.length === 0) return { role, elements: {} }
      const verifs = ids.flatMap((id) => ['peut_ecrire', 'peut_commenter'].map((relation) => ({ user: sujet, relation, object: objetElement(tableau, id) })))
      const { result } = await evaluer((c) =>
        c.batchCheck({ checks: verifs.map((v, i) => ({ ...v, correlationId: String(i) })) }),
      )
      const permis = new Set(result.filter((r) => r.allowed).map((r) => Number(r.correlationId)))
      return {
        role,
        elements: Object.fromEntries(ids.map((id, i) => [id, { ecrire: permis.has(2 * i), commenter: permis.has(2 * i + 1) }])),
      }
    },
    lister: (sujet, relation, type) =>
      evaluer(async (c) => (await c.listObjects({ user: sujet, relation, type })).objects.map((x) => x.slice(type.length + 1))),
    vider,
  }
}
