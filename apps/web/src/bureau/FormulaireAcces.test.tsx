// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Acces } from '../bureau'
import { texteErreur } from './acces'
import { fermerDialogueAcces, ouvrirDialogueAcces } from './etat'
import { DialogueAcces, EcranAcces, FormulaireAcces } from './FormulaireAcces'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ne fait pas de dialogue modal : `open` suffit pour ce qu'on vérifie.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

const SERVEUR = 'https://notak.exemple.fr'
const acces = (o: Partial<Acces> = {}): Acces => ({ ouvrir: 'local', serveur: null, majAuto: true, version: '0.1.0', ...o })

let racine: Root
let hote: HTMLElement
let invoke: ReturnType<typeof vi.fn>
/** Ce que répond la coque, commande par commande ; une commande absente échoue comme chez une coque trop ancienne. */
let coque: Record<string, (args: unknown) => unknown>

beforeEach(() => {
  definirLangue('fr')
  coque = {}
  invoke = vi.fn(async (commande: string, args: unknown) => {
    const r = coque[commande]
    if (!r) throw `Command ${commande} not found`
    return r(args)
  })
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => {
    fermerDialogueAcces()
    racine.unmount()
  })
  hote.remove()
  document.querySelectorAll('dialog').forEach((d) => d.remove())
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
})

const appelsDe = (commande: string) => invoke.mock.calls.filter((c) => c[0] === commande).map((c) => c[1])
const champ = () => document.querySelector<HTMLInputElement>('input[name="adresse"]')!
const bouton = (texte: string | RegExp) =>
  [...document.querySelectorAll('button')].find((b) => (typeof texte === 'string' ? b.textContent === texte : texte.test(b.textContent ?? '')))
const alerte = () => document.querySelector('[role="alert"]')?.textContent ?? null
const ecrire = (valeur: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ(), valeur)
    champ().dispatchEvent(new Event('input', { bubbles: true }))
  })
const envoyer = () => act(async () => void document.querySelector('form')!.requestSubmit())

const monter = (p: Partial<Parameters<typeof FormulaireAcces>[0]> = {}) => {
  const surLocal = vi.fn()
  act(() => racine.render(<FormulaireAcces acces={acces()} mode="ecran" surLocal={surLocal} {...p} />))
  return surLocal
}

describe('« Se connecter à un serveur Notak »', () => {
  it('attend une adresse, avec le curseur dans le champ et de quoi s’aider', () => {
    monter()
    expect(document.querySelector('h1')?.textContent).toBe('Se connecter à un serveur Notak')
    expect(champ().type).toBe('url')
    expect(champ().getAttribute('inputmode')).toBe('url')
    expect(champ().getAttribute('autocomplete')).toBe('url')
    expect(champ().placeholder).toBe('https://notak.exemple.fr')
    expect(document.activeElement).toBe(champ())
    expect(document.body.textContent).toContain('L’adresse de votre serveur Notak, celle que vous ouvrez dans le navigateur.')
    expect(champ().getAttribute('aria-describedby')).toBeTruthy()
    const guide = [...document.querySelectorAll('a')].find((a) => a.href.includes('AUTO-HEBERGER'))!
    expect(guide.href).toBe('https://github.com/Anonym0os/notak/blob/main/docs/AUTO-HEBERGER.md')
    expect(guide.target).toBe('_blank')
    expect(guide.rel).toContain('noopener')
  })

  it('dit une fois, simplement, où vivent les toiles de l’ordinateur et celles du serveur', () => {
    monter()
    expect(document.body.textContent).toContain('Vos toiles de cet ordinateur restent sur cet ordinateur ; celles d’un serveur restent sur ce serveur.')
  })

  it('« Se connecter » envoie l’adresse tapée à la coque, en la retenant, et le dit pendant qu’elle travaille', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: 'notak.exemple.fr', garder: true }])
    const envoi = document.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(envoi.disabled).toBe(true)
    expect(envoi.textContent).toBe('Connexion…')
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Connexion à notak.exemple.fr…')
    expect(champ().readOnly).toBe(true)
    // Un deuxième envoi pendant ce temps ne repart pas.
    await envoyer()
    expect(appelsDe('joindre_serveur')).toHaveLength(1)
  })

  it('une adresse vide ne va pas jusqu’à la coque, et son champ se marque', async () => {
    monter()
    await envoyer()
    expect(appelsDe('joindre_serveur')).toHaveLength(0)
    expect(alerte()).toBe(texteErreur({ code: 'adresse_invalide' }))
    expect(champ().getAttribute('aria-invalid')).toBe('true')
    expect(champ().getAttribute('aria-describedby')).toContain(document.querySelector('[role="alert"]')!.id)
  })

  it.each(['adresse_invalide', 'https_requis', 'chemin', 'injoignable', 'certificat', 'delai', 'pas_notak', 'trop_ancien', 'interdit'])(
    'le refus « %s » se dit en alerte, avec ce qu’il y a à faire, et rend le champ',
    async (code) => {
      coque.joindre_serveur = () => {
        throw { code }
      }
      monter()
      ecrire('notak.exemple.fr')
      await envoyer()
      expect(alerte()).toBe(texteErreur({ code } as never))
      expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
      expect(document.activeElement).toBe(champ())
      expect(champ().readOnly).toBe(false)
      // Seule l'adresse elle-même est « invalide » pour un lecteur d'écran dans les trois cas qui s'y corrigent.
      expect(champ().getAttribute('aria-invalid') === 'true').toBe(['adresse_invalide', 'https_requis', 'chemin'].includes(code))
    },
  )

  it('une panne de la page (la coque ne répond pas) se dit comme un échec, sans rien exposer', async () => {
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    expect(alerte()).toBe('La connexion n’a pas abouti. Réessayez dans un instant.')
    expect(document.body.textContent).not.toContain('not found')
  })

  it('le détail d’un échec de la coque se lit sous le message, en texte brut', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'echec', message: '<img src=x onerror=alert(1)> la fenêtre n’est pas là' }
    }
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    expect(document.querySelector('.acces-detail')?.textContent).toContain('<img src=x')
    expect(document.querySelector('.acces-detail img')).toBeNull()
  })

  it('un serveur qui se dit ailleurs : le bouton « Utiliser » reprend avec cette adresse', async () => {
    const ailleurs = 'https://notak.exemple.com'
    coque.joindre_serveur = (a) => {
      if ((a as { adresse: string }).adresse === 'notak.exemple.fr') throw { code: 'redirige', vers: ailleurs }
      return new Promise(() => {})
    }
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    expect(alerte()).toBe(`Ce serveur se trouve à ${ailleurs}.`)
    const utiliser = bouton(`Utiliser ${ailleurs}`)!
    expect(utiliser).toBeTruthy()
    expect(document.activeElement).toBe(utiliser)
    await act(async () => utiliser.click())
    expect(appelsDe('joindre_serveur')).toEqual([
      { adresse: 'notak.exemple.fr', garder: true },
      { adresse: ailleurs, garder: true },
    ])
    expect(champ().value).toBe(ailleurs)
    expect(alerte()).toBeNull()
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Connexion à notak.exemple.com…')
  })

  it('arrive avec l’adresse du serveur retenu, et dit qu’il n’a pas répondu quand la coque nous a ramenés', () => {
    monter({ acces: acces({ ouvrir: 'serveur', serveur: SERVEUR }), echecInitial: { code: 'muette' } })
    expect(champ().value).toBe(SERVEUR)
    expect(alerte()).toContain('notak.exemple.fr n’a pas répondu')
    expect(document.body.textContent).toContain('Serveur retenu : notak.exemple.fr.')
  })
})

describe('les toiles de cet ordinateur', () => {
  it('sur l’écran d’accès, sans serveur à ouvrir : « Toiles de cet ordinateur » ferme l’écran, sans toucher aux réglages', async () => {
    const surLocal = monter()
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(surLocal).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('quand on vient d’un serveur retenu : la coque s’en souvient, Notak s’ouvrira ici la prochaine fois', async () => {
    coque.revenir_ici = () => undefined
    const surLocal = monter({ acces: acces({ ouvrir: 'serveur', serveur: SERVEUR }) })
    expect(document.body.textContent).toContain('Notak s’ouvrira désormais sur cet ordinateur ; notak.exemple.fr reste retenu pour y revenir.')
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(appelsDe('revenir_ici')).toEqual([{ ecran: 'local' }])
    expect(surLocal).not.toHaveBeenCalled()
  })

  it('un refus de la coque à ce moment-là se dit, et l’on peut réessayer', async () => {
    coque.revenir_ici = () => {
      throw { code: 'interdit' }
    }
    monter({ acces: acces({ ouvrir: 'serveur', serveur: SERVEUR }) })
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(alerte()).toBe(texteErreur({ code: 'interdit' }))
    expect(bouton('Toiles de cet ordinateur')!.disabled).toBe(false)
  })

  it('dans la fenêtre : pas de bouton superflu tant que rien n’est retenu ; la croix la ferme', async () => {
    const surFermer = vi.fn()
    monter({ mode: 'dialogue', surFermer })
    expect(document.querySelector('h2')?.textContent).toBe('Se connecter à un serveur Notak')
    expect(bouton('Toiles de cet ordinateur')).toBeUndefined()
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')!.click())
    expect(surFermer).toHaveBeenCalledOnce()
  })
})

describe('oublier le serveur retenu', () => {
  const retenu = () => acces({ ouvrir: 'serveur', serveur: SERVEUR })

  it('ne se fait pas d’un clic : une phrase dit ce qui se passe, et « Annuler » reprend la main', async () => {
    monter({ acces: retenu() })
    await act(async () => bouton('Oublier ce serveur')!.click())
    expect(document.querySelector('[role="group"]')?.textContent).toContain(
      'Oublier notak.exemple.fr ? La session ouverte sur ce serveur sera fermée sur cet ordinateur. Vos toiles de cet ordinateur ne sont pas touchées.',
    )
    expect(document.activeElement).toBe(bouton('Annuler'))
    await act(async () => bouton('Annuler')!.click())
    expect(appelsDe('oublier_serveur')).toHaveLength(0)
    expect(document.querySelector('[role="group"]')).toBeNull()
    expect(document.activeElement).toBe(bouton('Oublier ce serveur'))
  })

  it('confirmé : la coque oublie, l’adresse retenue disparaît du champ et de l’écran, et on le dit', async () => {
    coque.oublier_serveur = () => undefined
    coque.acces = () => acces()
    const surLocal = monter({ acces: retenu() })
    expect(champ().value).toBe(SERVEUR)
    await act(async () => bouton('Oublier ce serveur')!.click())
    await act(async () => bouton('Oui, oublier')!.click())
    expect(appelsDe('oublier_serveur')).toHaveLength(1)
    expect(champ().value).toBe('')
    expect(bouton('Oublier ce serveur')).toBeUndefined()
    expect(document.body.textContent).not.toContain('Serveur retenu')
    expect(document.querySelector('[role="status"]')?.textContent).toBe('notak.exemple.fr est oublié.')
    expect(document.activeElement).toBe(champ())
    // Rien d'autre ne bouge : ni la fenêtre, ni les toiles d'ici.
    expect(surLocal).not.toHaveBeenCalled()
    expect(appelsDe('revenir_ici')).toHaveLength(0)
    // Les réglages que la coque donne ont changé : l'écran ne propose plus de rentrer « pour de bon ».
    expect(document.body.textContent).not.toContain('reste retenu pour y revenir')
  })

  it('une adresse que la personne a retapée entre-temps n’est pas effacée', async () => {
    coque.oublier_serveur = () => undefined
    coque.acces = () => acces()
    monter({ acces: retenu() })
    ecrire('autre.exemple.fr')
    await act(async () => bouton('Oublier ce serveur')!.click())
    await act(async () => bouton('Oui, oublier')!.click())
    expect(champ().value).toBe('autre.exemple.fr')
  })

  it('refusé par la coque : l’erreur se dit, et le serveur reste retenu', async () => {
    coque.oublier_serveur = () => {
      throw { code: 'echec', message: 'disque plein' }
    }
    monter({ acces: retenu() })
    await act(async () => bouton('Oublier ce serveur')!.click())
    await act(async () => bouton('Oui, oublier')!.click())
    expect(alerte()).toContain('La connexion n’a pas abouti')
    expect(document.body.textContent).toContain('Serveur retenu : notak.exemple.fr.')
    expect(bouton('Oublier ce serveur')).toBeTruthy()
  })
})

describe('l’écran entier', () => {
  it('prend le thème de l’appareil et porte la marque, dans un <main>', () => {
    act(() => racine.render(<EcranAcces acces={acces()} surLocal={() => {}} />))
    expect(hote.querySelector('.notak-espace')?.getAttribute('data-theme')).toMatch(/clair|sombre/)
    expect(hote.querySelector('main.connexion')).not.toBeNull()
    expect(hote.querySelector('img.connexion-marque')).not.toBeNull()
  })
})

describe('la fenêtre ouverte depuis l’édition locale', () => {
  const ouvrir = async () => {
    coque.acces = () => acces({ ouvrir: 'local', serveur: SERVEUR })
    act(() => racine.render(<DialogueAcces />))
    await act(async () => void ouvrirDialogueAcces())
  }

  it('s’ouvre en modale sur des réglages frais, le curseur dans le champ, avec le serveur retenu', async () => {
    await ouvrir()
    const d = document.querySelector('dialog')!
    expect(d.open).toBe(true)
    expect(d.getAttribute('aria-label')).toBe('Se connecter à un serveur Notak')
    expect(document.activeElement).toBe(champ())
    expect(champ().value).toBe(SERVEUR)
    expect(document.body.textContent).toContain('Serveur retenu : notak.exemple.fr.')
  })

  it('rien n’est monté tant qu’on ne l’a pas ouverte', () => {
    act(() => racine.render(<DialogueAcces />))
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('se ferme par sa croix, par Échap (le navigateur ferme le dialogue), et par un clic sur le voile', async () => {
    await ouvrir()
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')!.click())
    expect(document.querySelector('dialog')).toBeNull()

    await act(async () => void ouvrirDialogueAcces())
    await act(async () => document.querySelector('dialog')!.dispatchEvent(new Event('close')))
    expect(document.querySelector('dialog')).toBeNull()

    await act(async () => void ouvrirDialogueAcces())
    await act(async () => document.querySelector('dialog')!.click())
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('le clavier y reste : Tab et Échap ne parviennent pas aux panneaux qui le gardent pour eux', async () => {
    await ouvrir()
    const vus: string[] = []
    const espion = (e: KeyboardEvent) => vus.push(e.key)
    document.addEventListener('keydown', espion, true)
    act(() => void champ().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    // Hors de la fenêtre, le clavier reste à qui l'avait.
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    document.removeEventListener('keydown', espion, true)
    expect(vus).toEqual(['Escape'])
  })
})
