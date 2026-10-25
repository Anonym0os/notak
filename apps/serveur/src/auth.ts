import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sso } from '@better-auth/sso'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { organization } from 'better-auth/plugins/organization'
import type { Base, Utilisateur } from './base.ts'
import { COULEURS, preparerCompte, preparerEspace } from './comptes.ts'
import type { Courrier } from './courriel.ts'
import { ROLES_ESPACE, ac } from './espaces.ts'
import { langueExport } from './exporter.ts'
import { hacher, verifier } from './motsDePasse.ts'

// Les comptes, les sessions et la connexion par un fournisseur passent par Better Auth, monté sur `/api/auth/*`.
// Il écrit dans la même base que le reste : la table `utilisateurs` (ses champs anglais y ont des noms à nous),
// et les tables `account`, `session` et `verification` qu'il gère seul. Le schéma vient de nos migrations, pas de lui.

export const CHEMIN_AUTH = '/api/auth'
export const DUREE_SESSION_S = 30 * 24 * 3600
export const MOT_DE_PASSE_COMPTE_MIN = 8
export const MOT_DE_PASSE_COMPTE_MAX = 200
const NOM_MAX = 80

export type Fournisseur = 'google' | 'microsoft' | 'github'
export interface Identifiants {
  clientId: string
  clientSecret: string
}

export interface OptionsAuth {
  base: Base
  secret: string
  /** L'adresse publique du serveur (`https://notak.exemple.fr`) : celle des retours de connexion et des liens envoyés. */
  origine: string
  /** D'autres origines dont les pages peuvent appeler l'API de connexion (le serveur de Vite, en développement). */
  autresOrigines?: readonly string[]
  cookieSecurise: boolean
  courrier: Courrier
  /** Les fournisseurs de connexion configurés ; un fournisseur absent n'est pas proposé. */
  fournisseurs?: Partial<Record<Fournisseur, Identifiants>>
  choisirCouleur?: () => string
  /**
   * Les inscriptions sont fermées (`NOTAK_INSCRIPTIONS=fermees`) : aucun compte ne se crée seul, ni par mot de passe
   * ni par un fournisseur. Restent le SSO d'un espace, qu'un admin a déclaré, et `bun run serveur:compte`.
   */
  inscriptionsFermees?: boolean
  /** Les fournisseurs d'identité du réseau interne (leur origine), qu'un espace peut déclarer en SSO. */
  idpInternes?: readonly string[]
}

/** Les champs de `utilisateurs` que Better Auth ne connaît pas : il les lit, il ne laisse personne les écrire. */
const champsNotak = {
  couleur: { type: 'string', required: false, input: false },
  racine: { type: 'string', required: false, input: false },
  photo: { type: 'string', required: false, input: false },
} as const

/** Les options qui fixent le schéma : la migration les compare à ce qu'elle a écrit. */
export const optionsSchema = {
  user: {
    modelName: 'utilisateurs',
    fields: { name: 'nom', emailVerified: 'email_verifie', createdAt: 'cree', updatedAt: 'modifie' },
    additionalFields: champsNotak,
  },
  advanced: { database: { generateId: 'uuid' } },
} satisfies BetterAuthOptions

/** Un espace personnel ne s'ouvre pas aux autres, ne se quitte pas et ne se supprime pas. */
const refuserSiPersonnel = (base: Base, espace: string) => {
  if (base.espace(espace)?.personnel) throw new APIError('FORBIDDEN', { message: 'espace personnel', code: 'ESPACE_PERSONNEL' })
}

/** Les plugins, à part : la migration les compare aussi à ce qu'elle a écrit. */
export function pluginsAuth(o: Pick<OptionsAuth, 'base' | 'courrier' | 'origine'>) {
  const { base, courrier } = o
  return [
    organization({
      ac,
      roles: ROLES_ESPACE,
      creatorRole: 'owner',
      teams: { enabled: true },
      dynamicAccessControl: { enabled: true },
      invitationExpiresIn: 7 * 24 * 3600,
      cancelPendingInvitationsOnReInvite: true,
      sendInvitationEmail: async ({ id, email, organization: espace, inviter }) =>
        courrier.envoyer({
          a: email,
          sujet: `Notak : ${inviter.user.name} vous invite dans « ${espace.name} »`,
          texte: `${inviter.user.name} vous invite à rejoindre l'espace « ${espace.name} ». Pour accepter, ouvrez ce lien :\n${o.origine}/?invitation=${id}`,
        }),
      organizationHooks: {
        afterCreateOrganization: async ({ organization: espace, user }) => preparerEspace(base, espace, user.id),
        beforeDeleteOrganization: async ({ organization: espace }) => refuserSiPersonnel(base, espace.id),
        beforeCreateInvitation: async ({ organization: espace }) => refuserSiPersonnel(base, espace.id),
        beforeAddMember: async ({ organization: espace }) => refuserSiPersonnel(base, espace.id),
        beforeRemoveMember: async ({ organization: espace }) => refuserSiPersonnel(base, espace.id),
      },
    }),
    // Le SSO d'entreprise se déclare espace par espace (OIDC ou SAML), et ne sert qu'une fois le domaine prouvé par
    // un enregistrement DNS. Qui arrive par lui entre dans l'espace comme simple membre.
    sso({
      domainVerification: { enabled: true },
      organizationProvisioning: { disabled: false, defaultRole: 'member' },
    }),
  ]
}

export function optionsAuth(o: OptionsAuth) {
  const { base, courrier } = o
  const choisirCouleur = o.choisirCouleur ?? (() => COULEURS[randomInt(COULEURS.length)]!)
  const f = o.fournisseurs ?? {}
  return {
    ...optionsSchema,
    plugins: pluginsAuth(o),
    database: base.db,
    secret: o.secret,
    baseURL: o.origine,
    basePath: CHEMIN_AUTH,
    trustedOrigins: [o.origine, ...(o.autresOrigines ?? []), ...(o.idpInternes ?? [])],
    telemetry: { enabled: false },
    // Le débit se limite devant, par adresse, comme sur le reste de l'API (`app.ts`).
    rateLimit: { enabled: false },
    advanced: {
      ...optionsSchema.advanced,
      cookiePrefix: 'notak',
      useSecureCookies: o.cookieSecurise,
      // Le contrôle de l'origine reste actif partout, essais compris (Better Auth le coupe sinon sous NODE_ENV=test) :
      // c'est lui qui empêche une page d'un autre site d'agir avec le cookie de quelqu'un.
      disableOriginCheck: false,
    },
    session: { expiresIn: DUREE_SESSION_S, updateAge: 24 * 3600 },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MOT_DE_PASSE_COMPTE_MIN,
      maxPasswordLength: MOT_DE_PASSE_COMPTE_MAX,
      // Les empreintes Argon2 d'avant Better Auth restent bonnes : on garde le même hachage.
      password: { hash: hacher, verify: ({ hash, password }: { hash: string; password: string }) => verifier(hash, password) },
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) =>
        courrier.envoyer({ a: user.email, sujet: 'Notak : changer de mot de passe', texte: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable une heure) :\n${url}` }),
    },
    emailVerification: {
      sendOnSignUp: courrier.actif,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) =>
        courrier.envoyer({ a: user.email, sujet: 'Notak : confirmer votre adresse', texte: `Pour confirmer votre adresse, ouvrez ce lien :\n${url}` }),
    },
    socialProviders: {
      ...(f.google && { google: { ...f.google, prompt: 'select_account' as const } }),
      ...(f.microsoft && { microsoft: { ...f.microsoft, tenantId: 'common' } }),
      ...(f.github && { github: f.github }),
    },
    // Un compte existant et un fournisseur qui garantit la même adresse : c'est la même personne.
    account: { accountLinking: { enabled: true } },
    databaseHooks: {
      user: {
        create: {
          // Toute création passe ici, par mot de passe comme par fournisseur : le nom se vérifie, la couleur et
          // l'accueil se choisissent.
          before: async (u: { name: string; [cle: string]: unknown }, ctx: { path?: string } | null) => {
            if (o.inscriptionsFermees && ctx?.path !== undefined && !ctx.path.startsWith('/sso/')) {
              throw new APIError('FORBIDDEN', { message: 'inscriptions fermées', code: 'INSCRIPTIONS_FERMEES' })
            }
            const nom = (u.name ?? '').trim()
            if (!nom || nom.length > NOM_MAX) throw new APIError('BAD_REQUEST', { message: 'nom invalide', code: 'NOM_INVALIDE' })
            return { data: { ...u, name: nom, couleur: choisirCouleur(), racine: randomUUID() } }
          },
          after: async (u: { id: string }, ctx: { body?: { langue?: unknown } } | null) => {
            const utilisateur = base.utilisateurParId(u.id)
            if (utilisateur) preparerCompte(base, utilisateur, langueExport(ctx?.body?.langue))
          },
        },
      },
    },
  } satisfies BetterAuthOptions
}

export function creerAuth(o: OptionsAuth) {
  return betterAuth(optionsAuth(o))
}

export type Auth = ReturnType<typeof creerAuth>

/** Le compte de la session portée par ces en-têtes (cookie), ou `null`. */
export async function utilisateurDeSession(auth: Auth, base: Base, entetes: Headers): Promise<Utilisateur | null> {
  const session = await auth.api.getSession({ headers: entetes }).catch(() => null)
  return session ? base.utilisateurParId(session.user.id) : null
}

/** Les fournisseurs configurés par l'environnement : `NOTAK_GOOGLE_ID` et `NOTAK_GOOGLE_SECRET`, et ainsi de suite. */
export function fournisseursDe(env: NodeJS.ProcessEnv): Partial<Record<Fournisseur, Identifiants>> {
  const res: Partial<Record<Fournisseur, Identifiants>> = {}
  for (const nom of ['google', 'microsoft', 'github'] as const) {
    const clientId = env[`NOTAK_${nom.toUpperCase()}_ID`]
    const clientSecret = env[`NOTAK_${nom.toUpperCase()}_SECRET`]
    if (clientId && clientSecret) res[nom] = { clientId, clientSecret }
  }
  return res
}

/**
 * Le secret qui signe les cookies : `NOTAK_SECRET` s'il est donné, sinon celui qu'on a tiré au premier démarrage et
 * gardé dans le dossier des données (lisible par le seul propriétaire). Le changer déconnecte tout le monde.
 */
export function secretDe(env: NodeJS.ProcessEnv, dossier: string): string {
  if (env.NOTAK_SECRET) return env.NOTAK_SECRET
  const chemin = join(dossier, 'secret')
  if (existsSync(chemin)) return readFileSync(chemin, 'utf8').trim()
  const secret = randomBytes(32).toString('base64url')
  writeFileSync(chemin, secret, { mode: 0o600 })
  return secret
}
