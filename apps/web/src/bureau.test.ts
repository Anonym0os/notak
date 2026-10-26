// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FICHIER_OUVERT,
  acces,
  confierCopie,
  ecouter,
  enregistrerSous,
  estErreurAcces,
  estErreurCoque,
  estPageServeur,
  fichiersOuverts,
  garderLesLiens,
  joindreServeur,
  lireFichierOuvert,
  marquerBureau,
  nomDeFichier,
  octetsDe,
  oublierServeur,
  ouvrirAilleurs,
  ouvrirFichier,
  reglerMajAuto,
  revenirIci,
} from './bureau'

type Appel = { commande: string; arguments_?: unknown; options?: { headers?: Record<string, string> } }

/** Une coque d'essai sur `window` : elle note chaque commande et répond ce que dit `repondre` (une erreur s'il lève). */
function poserCoque(repondre: (a: Appel) => unknown = () => null) {
  const appels: Appel[] = []
  const rappels = new Map<number, (message: unknown) => void>()
  let suivant = 0
  const tauri = {
    invoke: async (commande: string, arguments_?: unknown, options?: Appel['options']) => {
      const a = { commande, arguments_, options }
      appels.push(a)
      return repondre(a)
    },
    transformCallback: (f: (message: unknown) => void) => {
      suivant += 1
      rappels.set(suivant, f)
      return suivant
    },
    unregisterCallback: (id: number) => void rappels.delete(id),
  }
  Object.assign(window, { __TAURI_INTERNALS__: tauri })
  return { appels, rappels }
}

afterEach(() => {
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  delete (window as { __TAURI_EVENT_PLUGIN_INTERNALS__?: unknown }).__TAURI_EVENT_PLUGIN_INTERNALS__
  vi.unstubAllGlobals()
})

const fenetre = (tauri: boolean, largeur: number, ecran: number) => {
  const document = window.document.implementation.createHTMLDocument('')
  const ecoutes: (() => void)[] = []
  return {
    ...(tauri ? { __TAURI_INTERNALS__: { invoke: async () => null } } : {}),
    document,
    location: { protocol: 'tauri:', hostname: 'localhost', host: 'localhost', href: 'tauri://localhost/' },
    innerWidth: largeur,
    innerHeight: 800,
    screen: { width: ecran, height: 800 },
    addEventListener: (type: string, f: () => void) => type === 'resize' && ecoutes.push(f),
    ecoutes,
  }
}

describe("l'application de bureau", () => {
  it('se signale à la racine, et dit le plein écran quand la fenêtre couvre l’écran', () => {
    const f = fenetre(true, 1280, 1440)
    marquerBureau(f as unknown as Window)
    const racine = f.document.documentElement
    expect(racine.hasAttribute('data-bureau')).toBe(true)
    expect(racine.hasAttribute('data-plein-ecran')).toBe(false)
    f.innerWidth = 1440
    f.ecoutes.forEach((e) => e())
    expect(racine.hasAttribute('data-plein-ecran')).toBe(true)
  })

  it('ne touche à rien dans un navigateur', () => {
    const f = fenetre(false, 1280, 1440)
    marquerBureau(f as unknown as Window)
    expect(f.document.documentElement.hasAttribute('data-bureau')).toBe(false)
  })

  it('la page d’un serveur se signale à la coque dès qu’elle tourne', () => {
    const { appels } = poserCoque(() => ({ ouvrir: 'local', serveur: 'http://localhost:3000', majAuto: true, version: '0.2.0' }))
    const f = { ...fenetre(false, 1280, 1440), __TAURI_INTERNALS__: (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ }
    f.location = { protocol: 'https:', hostname: 'notak.exemple.fr', host: 'notak.exemple.fr', href: 'https://notak.exemple.fr/' }
    marquerBureau(f as unknown as Window)
    expect(appels.map((a) => a.commande)).toEqual(['acces'])
    appels.length = 0
    marquerBureau(fenetre(true, 1280, 1440) as unknown as Window)
    expect(appels).toEqual([])
  })

  it('reconnaît la page d’un serveur : une adresse web qui n’est pas l’app embarquée', () => {
    const avec = (href: string, tauri = true) => {
      const u = new URL(href)
      return { ...(tauri ? { __TAURI_INTERNALS__: {} } : {}), location: { protocol: u.protocol, hostname: u.hostname, host: u.host, href } } as unknown as Window
    }
    expect(estPageServeur(avec('https://notak.exemple.fr/t/abc'))).toBe(true)
    expect(estPageServeur(avec('http://localhost:3005/'))).toBe(true)
    expect(estPageServeur(avec('tauri://localhost/'))).toBe(false)
    expect(estPageServeur(avec('http://tauri.localhost/'))).toBe(false)
    expect(estPageServeur(avec('https://tauri.localhost/'))).toBe(false)
    expect(estPageServeur(avec('https://notak.exemple.fr/', false))).toBe(false)
  })
})

describe('les octets de la coque', () => {
  it('arrivent en ArrayBuffer par son canal, en tableau de nombres par postMessage', () => {
    expect(octetsDe(new Uint8Array([1, 2, 3]).buffer)).toEqual(new Uint8Array([1, 2, 3]))
    expect(octetsDe([0, 128, 255])).toEqual(new Uint8Array([0, 128, 255]))
    expect(octetsDe([])).toEqual(new Uint8Array([]))
    const vue = new Uint8Array([9, 8, 7, 6]).subarray(1, 3)
    expect(octetsDe(vue)).toBe(vue)
    expect(octetsDe(new DataView(new Uint8Array([5, 6, 7]).buffer, 1))).toEqual(new Uint8Array([6, 7]))
  })

  it('refusent le reste', () => {
    for (const mauvais of [[256], [-1], [1.5], ['1'], { 0: 1 }, null, 'abc', undefined]) expect(() => octetsDe(mauvais)).toThrow()
  })
})

describe('les commandes de la coque', () => {
  it('les réglages, joindre un serveur, en revenir, l’oublier', async () => {
    const etat = { ouvrir: 'serveur', serveur: 'https://notak.exemple.fr', majAuto: false, version: '0.2.0' }
    const joint = { origine: 'https://notak.exemple.fr', nom: 'Équipe', version: '1.4.0' }
    const { appels } = poserCoque((a) => (a.commande === 'acces' ? etat : a.commande === 'joindre_serveur' ? joint : null))
    expect(await acces()).toEqual(etat)
    expect(await joindreServeur(' notak.exemple.fr ', true)).toEqual(joint)
    await revenirIci('acces')
    await revenirIci('local')
    await oublierServeur()
    await reglerMajAuto(false)
    expect(appels.map(({ commande, arguments_ }) => [commande, arguments_])).toEqual([
      ['acces', undefined],
      ['joindre_serveur', { adresse: ' notak.exemple.fr ', garder: true }],
      ['revenir_ici', { ecran: 'acces' }],
      ['revenir_ici', { ecran: 'local' }],
      ['oublier_serveur', undefined],
      ['regler_maj_auto', { actif: false }],
    ])
  })

  it('une erreur de la coque se lit à son code', async () => {
    poserCoque(() => {
      throw { code: 'redirige', vers: 'https://www.notak.exemple.fr' }
    })
    const e = await joindreServeur('notak.exemple.fr', false).catch((x: unknown) => x)
    expect(estErreurAcces(e) && e.code === 'redirige' && e.vers).toBe('https://www.notak.exemple.fr')
    expect(estErreurCoque({ code: 'type_refuse' })).toBe(true)
    expect(estErreurAcces({ code: 'type_refuse' })).toBe(false)
    expect(estErreurCoque({ code: 'redirige' })).toBe(false)
    expect(estErreurCoque(new Error('pas_notak'))).toBe(false)
    expect(estErreurCoque('Command acces not allowed by ACL')).toBe(false)
    expect(estErreurCoque(null)).toBe(false)
  })

  it('hors de l’app de bureau, une erreur', async () => {
    await expect(acces()).rejects.toThrow(/hors de l’application de bureau/)
    await expect(ecouter(FICHIER_OUVERT, () => {})).rejects.toThrow()
  })

  it('un fichier confié passe en octets bruts, son nom dans un en-tête', async () => {
    const { appels } = poserCoque()
    const octets = new Uint8Array([1, 2, 3])
    await ouvrirFichier(octets, 'Réunion d’été.pdf')
    await confierCopie(octets, 'Toiles 2026-10-26.notak')
    expect(appels[0]).toEqual({ commande: 'ouvrir_fichier', arguments_: octets, options: { headers: { 'x-notak-nom': 'R%C3%A9union%20d%E2%80%99%C3%A9t%C3%A9.pdf' } } })
    expect(appels[1]!.commande).toBe('confier_copie')
    expect(appels[1]!.arguments_).toBe(octets)
    expect(decodeURIComponent(appels[1]!.options!.headers!['x-notak-nom']!)).toBe('Toiles 2026-10-26.notak')
  })

  it('une copie ouverte se lit par morceaux, en ArrayBuffer ou en tableau', async () => {
    const contenu = Uint8Array.from({ length: 10 }, (_, i) => i)
    const { appels } = poserCoque((a) => {
      if (a.commande === 'fichiers_ouverts') return [{ id: 'f1', nom: 'Toiles.notak', taille: 10 }]
      const { debut } = a.arguments_ as { debut: number }
      const morceau = contenu.slice(debut, debut + 4)
      // Un morceau sur deux comme après un repli sur postMessage.
      return debut % 8 === 0 ? morceau.buffer : Array.from(morceau)
    })
    expect(await fichiersOuverts()).toEqual([{ id: 'f1', nom: 'Toiles.notak', taille: 10 }])
    expect(await lireFichierOuvert('f1')).toEqual(contenu)
    expect(appels.filter((a) => a.commande === 'lire_fichier_ouvert').map((a) => a.arguments_)).toEqual([
      { id: 'f1', debut: 0 },
      { id: 'f1', debut: 4 },
      { id: 'f1', debut: 8 },
    ])
    await expect(lireFichierOuvert('f2')).rejects.toEqual({ code: 'introuvable' })
  })

  it('une copie vide, raccourcie ou trop longue', async () => {
    let reponses: unknown[] = []
    let taille = 0
    poserCoque((a) => (a.commande === 'fichiers_ouverts' ? [{ id: 'f1', nom: 'a.notak', taille }] : reponses.shift()))
    reponses = [new ArrayBuffer(0)]
    expect(await lireFichierOuvert('f1')).toEqual(new Uint8Array(0))
    taille = 6
    reponses = [[1, 2, 3], []]
    await expect(lireFichierOuvert('f1')).rejects.toEqual({ code: 'illisible' })
    taille = 2
    reponses = [[1, 2, 3]]
    await expect(lireFichierOuvert('f1')).rejects.toEqual({ code: 'illisible' })
  })

  it('écoute un événement, puis cesse', async () => {
    const { appels, rappels } = poserCoque((a) => (a.commande === 'plugin:event|listen' ? 42 : null))
    const retires: [string, number][] = []
    Object.assign(window, { __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: (e: string, id: number) => retires.push([e, id]) } })
    const recus: unknown[] = []
    const cesser = await ecouter(FICHIER_OUVERT, (charge) => recus.push(charge))
    expect(appels[0]).toEqual({ commande: 'plugin:event|listen', arguments_: { event: 'notak://fichier-ouvert', target: { kind: 'Any' }, handler: 1 }, options: undefined })
    rappels.get(1)!({ event: FICHIER_OUVERT, payload: null, id: 42 })
    expect(recus).toEqual([null])
    cesser()
    cesser()
    expect(retires).toEqual([['notak://fichier-ouvert', 42]])
    expect(appels.slice(1)).toEqual([{ commande: 'plugin:event|unlisten', arguments_: { event: 'notak://fichier-ouvert', eventId: 42 }, options: undefined }])
  })

  it('une écoute refusée ne laisse pas de rappel derrière elle', async () => {
    const { rappels } = poserCoque(() => {
      throw 'event.listen not allowed'
    })
    await expect(ecouter(FICHIER_OUVERT, () => {})).rejects.toBe('event.listen not allowed')
    expect(rappels.size).toBe(0)
  })
})

describe('ouvrir un fichier ailleurs', () => {
  const servir = (octets: Uint8Array, type: string) => {
    const lus: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        lus.push(u)
        return new Response(octets as Uint8Array<ArrayBuffer>, { headers: { 'content-type': type } })
      }),
    )
    return lus
  }

  it('un fichier de la page s’ouvre dans l’application du système', async () => {
    const lus = servir(new Uint8Array([37, 80, 68, 70]), 'application/pdf')
    const { appels } = poserCoque()
    expect(await ouvrirAilleurs('blob:http://localhost:3000/0b6f6e2c', 'Rapport')).toBe('ouvert')
    expect(await ouvrirAilleurs('/fichiers/Plan%20d%E2%80%99acc%C3%A8s.pdf')).toBe('ouvert')
    expect(lus).toEqual(['blob:http://localhost:3000/0b6f6e2c', 'http://localhost:3000/fichiers/Plan%20d%E2%80%99acc%C3%A8s.pdf'])
    expect(appels.map((a) => [a.commande, decodeURIComponent(a.options!.headers!['x-notak-nom']!)])).toEqual([
      ['ouvrir_fichier', 'Rapport.pdf'],
      ['ouvrir_fichier', 'Plan d’accès.pdf'],
    ])
    expect(appels[0]!.arguments_).toEqual(new Uint8Array([37, 80, 68, 70]))
  })

  it('une sorte que la coque n’ouvre pas se propose à l’enregistrement', async () => {
    const svg = Uint8Array.from('<svg/>', (c) => c.charCodeAt(0))
    servir(svg, 'image/svg+xml')
    const { appels } = poserCoque((a) => {
      if (a.commande === 'ouvrir_fichier') throw { code: 'type_refuse' }
      if (a.commande === 'choisir_emplacement') return 'dessin.svg'
      return null
    })
    expect(await ouvrirAilleurs('blob:http://localhost:3000/1', 'dessin')).toBe('enregistre')
    expect(appels.map((a) => [a.commande, a.arguments_])).toEqual([
      ['ouvrir_fichier', svg],
      ['choisir_emplacement', { nom: 'dessin.svg', extension: 'svg', description: 'SVG' }],
      ['ecrire_fichier', svg],
    ])
  })

  it('l’enregistrement auquel on renonce n’écrit rien ; une autre erreur remonte', async () => {
    servir(new Uint8Array([1]), 'application/zip')
    const { appels } = poserCoque((a) => {
      if (a.commande === 'ouvrir_fichier') throw { code: 'type_refuse' }
      return null
    })
    expect(await ouvrirAilleurs('blob:http://localhost:3000/1', 'archive.zip')).toBe('annule')
    expect(appels.map((a) => a.commande)).toEqual(['ouvrir_fichier', 'choisir_emplacement'])
    poserCoque(() => {
      throw { code: 'echec', message: 'disque plein' }
    })
    await expect(ouvrirAilleurs('blob:http://localhost:3000/1', 'a.pdf')).rejects.toEqual({ code: 'echec', message: 'disque plein' })
  })

  it('la page ne lit pas les octets d’un autre site', async () => {
    const lus = servir(new Uint8Array([1]), 'application/pdf')
    poserCoque()
    for (const ailleurs of ['https://exemple.fr/a.pdf', 'blob:https://exemple.fr/1', 'file:///etc/passwd', 'javascript:alert(1)', 'http://localhost:3001/a.pdf']) {
      await expect(ouvrirAilleurs(ailleurs)).rejects.toThrow(/refusée/)
    }
    expect(lus).toEqual([])
  })

  it('un nom à partir de ce qu’on sait', () => {
    const u = (s: string) => new URL(s)
    expect(nomDeFichier('Rapport', u('blob:http://localhost:3000/1'), 'application/pdf')).toBe('Rapport.pdf')
    expect(nomDeFichier('photo.JPG', u('blob:http://localhost:3000/1'), 'image/jpeg')).toBe('photo.JPG')
    expect(nomDeFichier(undefined, u('blob:http://localhost:3000/1'), 'image/png; charset=binary')).toBe('fichier.png')
    expect(nomDeFichier('  ', u('http://localhost:3000/a/b%20c.txt'), 'text/plain')).toBe('b c.txt')
    expect(nomDeFichier(undefined, u('http://localhost:3000/a/%E0%A4%A.txt'), null)).toBe('%E0%A4%A.txt')
    expect(nomDeFichier(undefined, u('data:application/octet-stream,abc'), 'application/octet-stream')).toBe('fichier')
  })

  it('« Enregistrer sous » sans extension ne filtre rien', async () => {
    const { appels } = poserCoque(() => 'LISEZMOI')
    expect(await enregistrerSous(new Uint8Array([1]), 'LISEZMOI')).toBe(true)
    expect(appels[0]!.arguments_).toEqual({ nom: 'LISEZMOI', extension: '', description: 'LISEZMOI' })
  })
})

describe('les liens dans l’app de bureau', () => {
  const lieu = { href: window.location.href, protocol: window.location.protocol, host: window.location.host }
  const ouvertes: string[] = []
  const fenetreLiens = Object.assign(Object.create(window), {
    addEventListener: window.addEventListener.bind(window),
    location: lieu,
    open: (u: string) => void ouvertes.push(u),
  })
  // Un seul écouteur sur `window` pour tout le fichier : ses fenêtres d'essai se succèdent.
  garderLesLiens(fenetreLiens as Window)
  // Après lui, on relève ce qu'il a décidé, puis on empêche jsdom de suivre le lien.
  let retenu = false
  window.addEventListener('click', (e) => {
    retenu = e.defaultPrevented
    e.preventDefault()
  })
  const cliquer = (selecteur: string) => {
    document.querySelector(selecteur)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    return { defaultPrevented: retenu }
  }
  const surPlace = (href: string) => {
    const u = new URL(href)
    Object.assign(lieu, { href, protocol: u.protocol, host: u.host })
  }
  afterEach(() => surPlace('http://localhost:3000/'))

  it('un lien vers un autre site part dans le navigateur, la fenêtre reste sur Notak', () => {
    ouvertes.length = 0
    document.body.innerHTML = '<a id="l" href="https://exemple.fr/page">x</a><a id="m" href="mailto:a@b.fr">m</a><a id="dl" href="https://exemple.fr/f.png" download>d</a>'
    expect(cliquer('#l').defaultPrevented).toBe(true)
    expect(cliquer('#m').defaultPrevented).toBe(true)
    expect(cliquer('#dl').defaultPrevented).toBe(true)
    expect(ouvertes).toEqual(['https://exemple.fr/page', 'mailto:a@b.fr', 'https://exemple.fr/f.png'])
  })

  it('un lien de l’application ou un texte en écriture restent à la page', () => {
    ouvertes.length = 0
    document.body.innerHTML = '<a id="ici" href="/t/abc">t</a><div contenteditable="true"><a id="ed" href="https://exemple.fr">e</a></div>'
    expect(cliquer('#ici').defaultPrevented).toBe(false)
    expect(cliquer('#ed').defaultPrevented).toBe(false)
    expect(ouvertes).toEqual([])
  })

  it('dans l’app embarquée (`tauri://localhost`), un lien interne se suit sur place', () => {
    ouvertes.length = 0
    surPlace('tauri://localhost/t/abc')
    document.body.innerHTML = '<a id="racine" href="/">r</a><a id="autre" href="/t/def?x=1">t</a><a id="web" href="http://localhost:3000/">w</a>'
    expect(cliquer('#racine').defaultPrevented).toBe(false)
    expect(cliquer('#autre').defaultPrevented).toBe(false)
    expect(cliquer('#web').defaultPrevented).toBe(true)
    expect(ouvertes).toEqual(['http://localhost:3000/'])
  })

  it('un téléchargement de la page passe par « Enregistrer sous »', async () => {
    ouvertes.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } })),
    )
    const { appels } = poserCoque((a) => (a.commande === 'choisir_emplacement' ? 'carte.png' : null))
    document.body.innerHTML = '<a id="blob" href="blob:http://localhost:3000/0b6f" download="carte">b</a><a id="meme" href="/f/plan.png" download>p</a>'
    expect(cliquer('#blob').defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(appels.length).toBe(2))
    expect(cliquer('#meme').defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(appels.length).toBe(4))
    expect(appels.map((a) => [a.commande, a.arguments_])).toEqual([
      ['choisir_emplacement', { nom: 'carte.png', extension: 'png', description: 'PNG' }],
      ['ecrire_fichier', new Uint8Array([1, 2])],
      ['choisir_emplacement', { nom: 'plan.png', extension: 'png', description: 'PNG' }],
      ['ecrire_fichier', new Uint8Array([1, 2])],
    ])
    expect(ouvertes).toEqual([])
  })

  it('un lien d’une autre sorte ne s’ouvre nulle part', () => {
    ouvertes.length = 0
    document.body.innerHTML = '<a id="js" href="javascript:alert(1)">j</a><a id="f" href="file:///etc/passwd">f</a><a id="jsdl" href="javascript:alert(1)" download>d</a>'
    expect(cliquer('#js').defaultPrevented).toBe(true)
    expect(cliquer('#f').defaultPrevented).toBe(true)
    expect(cliquer('#jsdl').defaultPrevented).toBe(true)
    expect(ouvertes).toEqual([])
  })
})
