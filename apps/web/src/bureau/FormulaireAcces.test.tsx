// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { texteErreur } from './acces'
import { SERVEUR, acces, alerte, appelsDe, bouton, coque, dialoguesDeJsdom, invoke, poserCoque, retirerCoque } from './essai'
import { fermerDialogueAcces, ouvrirDialogueAcces } from './etat'
import { DialogueAcces, EcranAcces, FormulaireAcces } from './FormulaireAcces'

dialoguesDeJsdom()

let racine: Root
let hote: HTMLElement

beforeEach(() => {
  definirLangue('fr')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  poserCoque()
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
  retirerCoque()
  vi.restoreAllMocks()
})

const champ = () => document.querySelector<HTMLInputElement>('input[name="adresse"]')!
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

  it('dit une fois, simplement, où vivent les toiles de l’ordinateur et celles du serveur, copie hors ligne comprise', () => {
    monter()
    expect(document.body.textContent).toContain('Vos toiles de cet ordinateur restent sur cet ordinateur.')
    expect(document.body.textContent).toContain('Notak garde ici une copie de celles que vous y ouvrez, pour travailler hors ligne.')
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

  it.each(['adresse_invalide', 'https_requis', 'chemin', 'injoignable', 'certificat', 'delai', 'pas_notak', 'trop_ancien', 'mal_regle', 'interdit'])(
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

  it('le détail d’un échec de la coque ne s’affiche pas : il va à la console, l’écran dit quoi faire', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'echec', message: 'Permission denied (os error 13)' }
    }
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    expect(alerte()).toBe('La connexion n’a pas abouti. Réessayez dans un instant.')
    expect(document.body.textContent).not.toContain('Permission denied')
    expect(console.warn).toHaveBeenCalledWith('Notak :', { code: 'echec', message: 'Permission denied (os error 13)' })
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

  it('un serveur resté à son adresse par défaut : ce que son administrateur doit régler, le guide, et rien qui mène à cet ordinateur', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'mal_regle' }
    }
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    expect(alerte()).toContain('NOTAK_ORIGINE=https://')
    expect(alerte()).toContain('administrateur')
    expect(bouton(/^Utiliser/)).toBeUndefined()
    const guide = [...document.querySelectorAll('a')].find((a) => a.textContent === 'Ce que dit le guide de NOTAK_ORIGINE')!
    expect(guide.href).toBe('https://github.com/Anonym0os/notak/blob/main/docs/AUTO-HEBERGER.md#les-variables')
    expect(guide.target).toBe('_blank')
  })

  it('arrive avec l’adresse du serveur retenu, et dit qu’il n’a pas répondu quand la coque nous a ramenés', () => {
    monter({ acces: acces({ ouvrir: 'serveur', serveur: SERVEUR }), echecInitial: { code: 'muette' } })
    expect(champ().value).toBe(SERVEUR)
    expect(alerte()).toContain('notak.exemple.fr n’a pas répondu')
    expect(document.body.textContent).toContain('Serveur mémorisé : notak.exemple.fr.')
  })
})

describe('pendant « Connexion… », une sortie', () => {
  it('« Annuler » arrête la jonction et rend le formulaire, sans attendre la fin de la vérification ; le curseur suit', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    coque.annuler_jonction = () => false
    const surLocal = monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    const annuler = bouton('Annuler')!
    expect(annuler.disabled).toBe(false)
    // Le bouton pressé est pris : le curseur va à la sortie.
    expect(document.activeElement).toBe(annuler)
    await act(async () => annuler.click())
    // Sur l'écran d'accès, une fenêtre déjà partie y reviendrait.
    expect(appelsDe('annuler_jonction')).toEqual([{ ecran: 'acces' }])
    expect(bouton('Annuler')).toBeUndefined()
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
    expect(champ().readOnly).toBe(false)
    expect(document.activeElement).toBe(champ())
    expect(alerte()).toBeNull()
    expect(surLocal).not.toHaveBeenCalled()
  })

  it('la jonction annulée qui finit plus tard ne touche pas à la suivante', async () => {
    const finir: Array<(e: unknown) => void> = []
    coque.joindre_serveur = () => new Promise((_, refus) => finir.push(refus))
    coque.annuler_jonction = () => false
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    await act(async () => bouton('Annuler')!.click())
    await envoyer()
    expect(appelsDe('joindre_serveur')).toHaveLength(2)
    // La première finit sur « annule », la seconde attend toujours le serveur.
    await act(async () => finir[0]!({ code: 'annule' }))
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent).toBe('Connexion…')
    expect(bouton('Annuler')).toBeTruthy()
  })

  it('la fenêtre déjà partie chercher le serveur : la coque la ramène, la page attend d’être remplacée', async () => {
    coque.joindre_serveur = () => ({ origine: SERVEUR, nom: null, version: '1' })
    coque.annuler_jonction = () => true
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    await act(async () => bouton('Annuler')!.click())
    expect(appelsDe('annuler_jonction')).toHaveLength(1)
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent).toBe('Connexion…')
  })

  it('« Toiles de cet ordinateur » reste une sortie : la jonction s’arrête, puis les toiles d’ici s’ouvrent', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    coque.annuler_jonction = () => false
    const surLocal = monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    const local = bouton('Toiles de cet ordinateur')!
    expect(local.disabled).toBe(false)
    await act(async () => local.click())
    expect(appelsDe('annuler_jonction')).toEqual([{ ecran: 'local' }])
    expect(surLocal).toHaveBeenCalledOnce()
  })

  it('… et si la fenêtre était déjà partie, c’est la coque qui la ramène aux toiles d’ici', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    coque.annuler_jonction = () => true
    const surLocal = monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(surLocal).not.toHaveBeenCalled()
  })

  it('dans la fenêtre, « Annuler » aussi ; une fenêtre déjà partie reviendrait aux toiles d’ici', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    coque.annuler_jonction = () => false
    monter({ mode: 'dialogue', surFermer: () => {} })
    ecrire('notak.exemple.fr')
    await envoyer()
    await act(async () => bouton('Annuler')!.click())
    expect(appelsDe('annuler_jonction')).toEqual([{ ecran: 'local' }])
  })
})

describe('les toiles de cet ordinateur', () => {
  it('sur l’écran d’accès, sans serveur à ouvrir : « Toiles de cet ordinateur » ferme l’écran, sans toucher aux réglages', async () => {
    const surLocal = monter()
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(surLocal).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('quand un serveur s’ouvre d’office : un coup d’œil, pour cette fois ; rien ne change aux réglages', async () => {
    const surLocal = monter({ acces: acces({ ouvrir: 'serveur', serveur: SERVEUR }) })
    expect(document.body.textContent).toContain(
      'Pour cette fois : au prochain lancement, Notak s’ouvrira encore sur notak.exemple.fr. Cela se change dans les réglages de l’app.',
    )
    expect(document.body.textContent).not.toContain('désormais')
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(surLocal).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('dans la fenêtre, on est déjà sur les toiles d’ici : pas de bouton pour y aller ; la croix la ferme', async () => {
    const surFermer = vi.fn()
    monter({ mode: 'dialogue', surFermer, acces: acces({ ouvrir: 'serveur', serveur: SERVEUR }) })
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
      'Oublier notak.exemple.fr ? La session ouverte sur ce serveur sera fermée sur cet ordinateur. Les copies de ses toiles que Notak garde pour travailler hors ligne restent sur cet ordinateur. Vos toiles de cet ordinateur ne sont pas touchées.',
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
    expect(document.body.textContent).not.toContain('Serveur mémorisé')
    expect(document.querySelector('[role="status"]')?.textContent).toBe('notak.exemple.fr est oublié.')
    expect(document.activeElement).toBe(champ())
    // Rien d'autre ne bouge : ni la fenêtre, ni les toiles d'ici.
    expect(surLocal).not.toHaveBeenCalled()
    expect(appelsDe('revenir_ici')).toHaveLength(0)
    // Les réglages que la coque donne ont changé : l'écran ne dit plus que Notak s'ouvrira sur ce serveur.
    expect(document.body.textContent).not.toContain('s’ouvrira encore sur')
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

  it('refusé par la coque : l’erreur se dit, et le serveur reste mémorisé', async () => {
    coque.oublier_serveur = () => {
      throw { code: 'echec', message: 'disque plein' }
    }
    monter({ acces: retenu() })
    await act(async () => bouton('Oublier ce serveur')!.click())
    await act(async () => bouton('Oui, oublier')!.click())
    expect(alerte()).toContain('La connexion n’a pas abouti')
    expect(document.body.textContent).toContain('Serveur mémorisé : notak.exemple.fr.')
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
    expect(document.body.textContent).toContain('Serveur mémorisé : notak.exemple.fr.')
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

  it('fermée par sa croix ou son voile, elle rend le curseur à ce qui l’avait ouverte', async () => {
    const origine = document.createElement('button')
    document.body.append(origine)
    coque.acces = () => acces({ serveur: SERVEUR })
    act(() => racine.render(<DialogueAcces />))
    for (const fermer of [() => document.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')!.click(), () => document.querySelector('dialog')!.click()]) {
      origine.focus()
      await act(async () => void ouvrirDialogueAcces())
      expect(document.activeElement).toBe(champ())
      await act(async () => fermer())
      expect(document.querySelector('dialog')).toBeNull()
      expect(document.activeElement).toBe(origine)
    }
    origine.remove()
  })

  it('fermée pendant « Connexion… » (Échap, la croix, le voile), elle arrête la jonction : renoncer ne mène pas chez le serveur', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    coque.annuler_jonction = () => false
    await ouvrir()
    await envoyer()
    expect(appelsDe('joindre_serveur')).toHaveLength(1)
    // Échap : le navigateur ferme le dialogue de lui-même.
    await act(async () => document.querySelector('dialog')!.dispatchEvent(new Event('close')))
    expect(document.querySelector('dialog')).toBeNull()
    expect(appelsDe('annuler_jonction')).toHaveLength(1)
    // Fermée sans rien en cours : rien à arrêter.
    await act(async () => void ouvrirDialogueAcces())
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')!.click())
    expect(appelsDe('annuler_jonction')).toHaveLength(1)
  })

  it('fermée quand la coque a déjà lancé la fenêtre vers le serveur, mais que sa page tarde : la jonction s’arrête aussi', async () => {
    coque.joindre_serveur = () => ({ origine: SERVEUR, nom: null, version: '1' })
    coque.annuler_jonction = () => true
    await ouvrir()
    await envoyer()
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Connexion à notak.exemple.fr…')
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')!.click())
    expect(appelsDe('annuler_jonction')).toHaveLength(1)
  })

  it('une jonction arrêtée ne se dit pas comme une erreur', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'annule' }
    }
    monter()
    ecrire('notak.exemple.fr')
    await envoyer()
    expect(alerte()).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
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
