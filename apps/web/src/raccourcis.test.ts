import { describe, expect, it } from 'vitest'
import { adresseArrivee, enteteAutorisation, etapesRaccourciImage, etapesRaccourciTexte, favori } from './raccourcis'

const ORIGINE = 'https://notak.exemple.fr'
const JETON = 'nk_abcDEF123-_'

describe('étapes du Raccourci iOS', () => {
  it('disent l’adresse, la méthode POST et l’en-tête Authorization avec le jeton', () => {
    for (const etapes of [etapesRaccourciTexte(ORIGINE, JETON), etapesRaccourciImage(ORIGINE, JETON)]) {
      const tout = etapes.join('\n')
      expect(tout).toContain(`\`${ORIGINE}/api/arrivee\``)
      expect(tout).toContain('POST')
      expect(tout).toContain('`Authorization`')
      expect(tout).toContain(`\`Bearer ${JETON}\``)
    }
  })

  it('le raccourci de texte envoie du JSON, celui d’image un formulaire avec un fichier « image »', () => {
    expect(etapesRaccourciTexte(ORIGINE, JETON).join('\n')).toMatch(/JSON[\s\S]*`texte`/)
    const image = etapesRaccourciImage(ORIGINE, JETON).join('\n')
    expect(image).toMatch(/Formulaire[\s\S]*Fichier[\s\S]*`image`/)
    expect(image).toContain('JPEG')
  })

  it('ne se répètent pas : chaque étape est une phrase différente', () => {
    for (const etapes of [etapesRaccourciTexte(ORIGINE, JETON), etapesRaccourciImage(ORIGINE, JETON)]) {
      expect(new Set(etapes).size).toBe(etapes.length)
    }
  })
})

describe('favori du bureau', () => {
  it('est un lien javascript: sur une seule ligne, qui porte l’origine et le jeton', () => {
    const f = favori(ORIGINE, JETON)
    expect(f.startsWith('javascript:')).toBe(true)
    expect(f).not.toContain('\n')
    expect(f).toContain(JSON.stringify(ORIGINE))
    expect(f).toContain(enteteAutorisation(JETON))
    expect(adresseArrivee(ORIGINE)).toBe(`${ORIGINE}/api/arrivee`)
  })

  it('est du JavaScript valide, même une fois ramené sur une ligne', () => {
    expect(() => new Function(favori(ORIGINE, JETON).slice('javascript:'.length))).not.toThrow()
  })

  it('ne se laisse pas casser par un jeton ou une origine qui porte des guillemets', () => {
    const f = favori('https://x.fr', 'a"b\'c')
    expect(() => new Function(f.slice('javascript:'.length))).not.toThrow()
  })

  it('envoie l’adresse, le titre et la sélection, et se replie sur la page de partage', async () => {
    const appels: { url: string; init: RequestInit }[] = []
    const ouverts: string[] = []
    const globales = globalThis as Record<string, unknown>
    const avant = { location: globales.location, document: globales.document, getSelection: globales.getSelection, fetch: globales.fetch, open: globales.open }
    globales.location = { href: 'https://exemple.fr/article' }
    globales.document = { title: 'Un article', createElement: () => ({ style: {}, remove() {} }), body: { append() {} } }
    globales.getSelection = () => 'un passage'
    globales.fetch = (url: string, init: RequestInit) => {
      appels.push({ url, init })
      return Promise.resolve(new Response('{}', { status: 401 }))
    }
    globales.open = (adresse: string) => void ouverts.push(adresse)
    try {
      new Function(favori(ORIGINE, JETON).slice('javascript:'.length))()
      await new Promise((r) => setTimeout(r, 0))
    } finally {
      Object.assign(globales, avant)
    }
    expect(appels).toHaveLength(1)
    expect(appels[0]!.url).toBe(`${ORIGINE}/api/arrivee`)
    expect((appels[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${JETON}`)
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({ url: 'https://exemple.fr/article', titre: 'Un article', texte: 'un passage' })
    const [repli] = ouverts
    expect(new URL(repli!).pathname).toBe('/partage')
    expect(new URL(repli!).searchParams.get('adresse')).toBe('https://exemple.fr/article')
  })
})
