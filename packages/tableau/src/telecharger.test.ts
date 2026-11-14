// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nomDeTelechargement, reglerTelechargement, telechargerFichier } from './telecharger'

/** Ce que la toile a annoncé. */
const annonces = vi.hoisted(() => [] as string[])
vi.mock('./avis', () => ({ annoncer: (a: { texte: string }) => void annonces.push(a.texte) }))

/** Les liens que la toile a cliqués, tels qu'ils étaient au clic, et s'ils étaient dans la page. */
let liens: { href: string | null; download: string; target: string; dansLaPage: boolean }[]
const { createObjectURL, revokeObjectURL } = URL

beforeEach(() => {
  liens = []
  annonces.length = 0
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    liens.push({ href: this.getAttribute('href'), download: this.download, target: this.target, dansLaPage: this.isConnected })
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:http://localhost:3000/${++n}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  reglerTelechargement({ remise: null })
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('le nom du fichier téléchargé', () => {
  it('garde le nom donné, sans chemin ni caractère de contrôle', () => {
    expect(nomDeTelechargement('Rapport annuel.pdf')).toBe('Rapport annuel.pdf')
    expect(nomDeTelechargement('Budget 2024/2025.xlsx')).toBe('Budget 2024 2025.xlsx')
    expect(nomDeTelechargement('..\\..\\secret.txt')).toBe('.. .. secret.txt')
    expect(nomDeTelechargement('ligne\nretour\t.md')).toBe('ligne retour .md')
  })

  it('un nom vide devient « fichier », et un nom sans extension prend celle de sa sorte', () => {
    expect(nomDeTelechargement('   ')).toBe('fichier')
    expect(nomDeTelechargement('', 'image/png')).toBe('fichier.png')
    expect(nomDeTelechargement('Mon chat', 'image/jpeg')).toBe('Mon chat.jpg')
    expect(nomDeTelechargement('Compte rendu', 'text/markdown;charset=utf-8')).toBe('Compte rendu.md')
    // Une extension déjà là, ou une sorte qu'on ne connaît pas, ne change rien.
    expect(nomDeTelechargement('photo.heic', 'image/jpeg')).toBe('photo.heic')
    expect(nomDeTelechargement('archive', 'application/x-7z-compressed')).toBe('archive')
  })
})

describe('dans un navigateur, et dans l’app de Mac', () => {
  it('l’adresse d’un fichier se télécharge par un lien, sans en lire les octets', async () => {
    const lecture = vi.fn()
    vi.stubGlobal('fetch', lecture)
    await telechargerFichier('/api/fichiers/ab', 'Billets.pdf', 'application/pdf')
    expect(liens).toEqual([{ href: '/api/fichiers/ab', download: 'Billets.pdf', target: '', dansLaPage: true }])
    expect(lecture).not.toHaveBeenCalled()
    // Le lien ne reste pas dans la page.
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('le lien part au clic, sans attendre : le navigateur le tient pour un geste de la personne', () => {
    void telechargerFichier('blob:http://localhost:3000/photo', 'photo.jpg')
    expect(liens).toHaveLength(1)
  })

  it('un fichier en main devient une adresse de la page, oubliée une fois le téléchargement parti', async () => {
    vi.useFakeTimers()
    await telechargerFichier(new Blob(['# Titre'], { type: 'text/markdown' }), 'Document')
    expect(liens).toEqual([{ href: 'blob:http://localhost:3000/1', download: 'Document.md', target: '', dansLaPage: true }])
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/1')
  })

  it('des `data:` deviennent un fichier de la page : l’app de Mac ne les télécharge pas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })))
    await telechargerFichier('data:image/svg+xml,%3Csvg%2F%3E', 'Croquis')
    expect(liens).toEqual([{ href: 'blob:http://localhost:3000/1', download: 'Croquis.svg', target: '', dansLaPage: true }])
  })

  it('une image d’un autre site s’ouvre à côté, pas à la place de Notak', async () => {
    await telechargerFichier('https://images.exemple.fr/chat.jpg', 'Chat')
    expect(liens).toEqual([{ href: 'https://images.exemple.fr/chat.jpg', download: 'Chat', target: '_blank', dansLaPage: true }])
  })
})

describe('sur un iPhone ou un iPad, dans l’app', () => {
  it('les octets se lisent, avec les cookies de la page, puis passent à la feuille de partage', async () => {
    const remise = vi.fn(async () => 'partage')
    reglerTelechargement({ remise })
    const lecture = vi.fn(async () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }))
    vi.stubGlobal('fetch', lecture)
    await telechargerFichier('/api/fichiers/ab', 'Billets')
    expect(lecture).toHaveBeenCalledWith('/api/fichiers/ab', { credentials: 'same-origin' })
    expect(remise).toHaveBeenCalledTimes(1)
    const [fichier, nom] = remise.mock.calls[0] as unknown as [Blob, string]
    expect(nom).toBe('Billets.pdf')
    expect([fichier.size, fichier.type]).toEqual([4, 'application/pdf'])
    // Aucun lien : il ne mènerait nulle part.
    expect(liens).toEqual([])
  })

  it('un fichier déjà en main passe tel quel', async () => {
    const remise = vi.fn(async () => 'annule')
    reglerTelechargement({ remise })
    const fichier = new Blob(['<svg/>'], { type: 'image/svg+xml' })
    await telechargerFichier(fichier, 'Croquis.svg')
    expect(remise).toHaveBeenCalledWith(fichier, 'Croquis.svg')
    expect(annonces).toEqual([])
  })

  it('un réseau coupé se dit, et rien ne part', async () => {
    const remise = vi.fn(async () => 'partage')
    reglerTelechargement({ remise })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Load failed')
      }),
    )
    await expect(telechargerFichier('/api/fichiers/ab', 'Billets.pdf')).resolves.toBeUndefined()
    expect(remise).not.toHaveBeenCalled()
    expect(annonces).toEqual(['« Billets.pdf » ne s’est pas téléchargé. Réessayez dans un instant.'])
  })

  it('un fichier que le serveur ne rend pas se dit aussi', async () => {
    reglerTelechargement({ remise: vi.fn(async () => 'partage') })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await telechargerFichier('/api/fichiers/disparu', 'photo.jpg')
    expect(annonces).toEqual(['« photo.jpg » ne s’est pas téléchargé. Réessayez dans un instant.'])
  })

  it('une feuille de partage qui échoue se dit', async () => {
    reglerTelechargement({
      remise: async () => {
        throw new Error('le partage a échoué')
      },
    })
    await telechargerFichier(new Blob(['x']), 'notes.txt')
    expect(annonces).toEqual(['« notes.txt » ne s’est pas téléchargé. Réessayez dans un instant.'])
  })
})
