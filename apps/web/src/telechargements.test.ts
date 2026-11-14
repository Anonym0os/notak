// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { telechargerFichier } from '@notak/tableau'
import { TELECHARGEMENT_FINI, annoncerTelechargement, brancherTelechargements, voieDesTelechargements } from './telechargements'

/** Ce que la page a annoncé, et les boutons de l'annonce. */
const m = vi.hoisted(() => ({ annonces: [] as { texte: string; action?: { libelle: string; faire(): void } }[] }))
vi.mock('@notak/tableau', async (origine) => ({
  ...(await origine<typeof import('@notak/tableau')>()),
  annoncer: (a: { texte: string; action?: { libelle: string; faire(): void } }) => void m.annonces.push(a),
}))

type Appel = { commande: string; arguments_?: unknown }

interface Coque {
  plateforme?: string
  telecharge?: boolean
  repondre?: (a: Appel) => unknown
}

/** Une fenêtre d'essai : un navigateur, ou la coque d'un Mac (d'avant ses téléchargements ou non), d'un iPhone. */
function fenetre(coque: Coque | null) {
  const appels: Appel[] = []
  const rappels = new Map<number, (message: unknown) => void>()
  let suivant = 0
  const w = Object.assign(Object.create(window), {
    location: window.location,
    navigator: window.navigator,
    ...(coque
      ? {
          __NOTAK_PLATEFORME__: coque.plateforme ?? 'macos',
          ...(coque.telecharge ? { __NOTAK_TELECHARGEMENTS__: true } : {}),
          __TAURI_INTERNALS__: {
            invoke: async (commande: string, arguments_?: unknown) => {
              const a = { commande, arguments_ }
              appels.push(a)
              if (commande === 'plugin:event|listen') return 7
              return coque.repondre?.(a) ?? null
            },
            transformCallback: (f: (message: unknown) => void) => {
              suivant += 1
              rappels.set(suivant, f)
              return suivant
            },
          },
        }
      : {}),
  }) as Window
  return { w, appels, rappels }
}

afterEach(() => {
  m.annonces.length = 0
  vi.restoreAllMocks()
})

describe('par où passe un téléchargement', () => {
  it('un navigateur garde le sien : un lien de téléchargement', () => {
    expect(voieDesTelechargements(fenetre(null).w)).toBe('lien')
  })

  it('l’app de Mac le range dans Téléchargements : un lien aussi', () => {
    expect(voieDesTelechargements(fenetre({ telecharge: true }).w)).toBe('lien')
    expect(voieDesTelechargements(fenetre({ plateforme: 'windows', telecharge: true }).w)).toBe('lien')
  })

  it('une app de Mac d’avant ses téléchargements passe par « Enregistrer sous »', () => {
    expect(voieDesTelechargements(fenetre({}).w)).toBe('enregistrer-sous')
  })

  it('l’app d’un iPhone ou d’un iPad passe par la feuille de partage', () => {
    expect(voieDesTelechargements(fenetre({ plateforme: 'ios' }).w)).toBe('partage')
    // Même si une coque de Mac s'y croyait : sur un appareil mobile, il n'y a pas de Téléchargements à montrer.
    expect(voieDesTelechargements(fenetre({ plateforme: 'ios', telecharge: true }).w)).toBe('partage')
  })
})

describe('ce que la toile fait de ses téléchargements', () => {
  afterEach(() => brancherTelechargements(fenetre(null).w)())

  it('sur un iPhone, le fichier va à la feuille de partage, sous son nom', async () => {
    const { w, appels } = fenetre({ plateforme: 'ios', repondre: (a) => (a.commande === 'plugin:appareil|partager' ? { fait: true } : null) })
    brancherTelechargements(w)
    await telechargerFichier(new Blob(['%PDF'], { type: 'application/pdf' }), 'Billets')
    expect(appels).toEqual([{ commande: 'plugin:appareil|partager', arguments_: { nom: 'Billets.pdf', donnees: btoa('%PDF') } }])
    // Rien à écouter : la feuille du système dit elle-même où le fichier est allé.
    expect(appels.some((a) => a.commande === 'plugin:event|listen')).toBe(false)
  })

  it('dans une app de Mac d’avant, il passe par « Enregistrer sous »', async () => {
    const { w, appels } = fenetre({ repondre: (a) => (a.commande === 'choisir_emplacement' ? 'Billets.pdf' : null) })
    // `enregistrerSous` parle à la coque de la page.
    Object.assign(window, { __TAURI_INTERNALS__: (w as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ })
    try {
      brancherTelechargements(w)
      // jsdom ne lit pas un `Blob` en octets ; WebKit, si.
      const fichier = Object.assign(new Blob(), { arrayBuffer: async () => new Uint8Array([1, 2]).buffer })
      await telechargerFichier(fichier, 'Billets.pdf')
      expect(appels).toEqual([
        { commande: 'choisir_emplacement', arguments_: { nom: 'Billets.pdf', extension: 'pdf', description: 'PDF' } },
        { commande: 'ecrire_fichier', arguments_: new Uint8Array([1, 2]) },
      ])
    } finally {
      delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    }
  })

  it('dans l’app de Mac d’aujourd’hui, un lien, et la page écoute la fin du téléchargement', async () => {
    const clics: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clics.push(this.download)
    })
    const { w, appels, rappels } = fenetre({ telecharge: true })
    brancherTelechargements(w)
    await telechargerFichier('/api/fichiers/ab', 'Billets.pdf')
    expect(clics).toEqual(['Billets.pdf'])
    await vi.waitFor(() => expect(appels.map((a) => a.commande)).toEqual(['plugin:event|listen']))
    expect(appels[0]!.arguments_).toMatchObject({ event: TELECHARGEMENT_FINI })
    // La coque dit la fin : la page l'annonce.
    rappels.get(1)!({ payload: { id: 3, nom: 'Billets.pdf', reussi: true } })
    expect(m.annonces.map((a) => a.texte)).toEqual(['Enregistré dans Téléchargements'])
  })
})

describe('l’annonce de la fin d’un téléchargement', () => {
  it('« Enregistré dans Téléchargements », et « Afficher dans le Finder » montre ce fichier-là', async () => {
    const { w, appels } = fenetre({ telecharge: true })
    Object.assign(window, { __TAURI_INTERNALS__: (w as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ })
    try {
      annoncerTelechargement({ id: 12, nom: 'photo (1).jpg', reussi: true }, w)
      expect(m.annonces).toHaveLength(1)
      expect(m.annonces[0]!.texte).toBe('Enregistré dans Téléchargements')
      expect(m.annonces[0]!.action!.libelle).toBe('Afficher dans le Finder')
      m.annonces[0]!.action!.faire()
      await vi.waitFor(() => expect(appels).toEqual([{ commande: 'montrer_telechargement', arguments_: { id: 12 } }]))
    } finally {
      delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    }
  })

  it('hors d’un Mac, le bouton dit « dossier »', () => {
    annoncerTelechargement({ id: 1, nom: 'a.png', reussi: true }, fenetre({ plateforme: 'windows', telecharge: true }).w)
    expect(m.annonces[0]!.action!.libelle).toBe('Afficher dans le dossier')
  })

  it('un fichier déplacé depuis se dit, plutôt qu’un Finder sans rien', async () => {
    const { w } = fenetre({
      telecharge: true,
      repondre: () => {
        throw { code: 'introuvable' }
      },
    })
    Object.assign(window, { __TAURI_INTERNALS__: (w as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ })
    try {
      annoncerTelechargement({ id: 1, nom: 'a.png', reussi: true }, w)
      m.annonces[0]!.action!.faire()
      await vi.waitFor(() => expect(m.annonces.map((a) => a.texte)).toEqual(['Enregistré dans Téléchargements', 'Ce fichier n’est plus dans Téléchargements.']))
    } finally {
      delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    }
  })

  it('un échec se dit, avec le nom du fichier, et sans bouton', () => {
    annoncerTelechargement({ id: null, nom: 'Billets.pdf', reussi: false }, fenetre({ telecharge: true }).w)
    expect(m.annonces).toEqual([{ texte: '« Billets.pdf » ne s’est pas téléchargé. Réessayez dans un instant.' }])
  })

  it('ce que la coque n’a pas pu dire ne s’annonce pas', () => {
    for (const charge of [null, 'fini', { nom: 'a.png' }, { reussi: true }]) annoncerTelechargement(charge, fenetre({ telecharge: true }).w)
    expect(m.annonces).toEqual([])
  })
})
