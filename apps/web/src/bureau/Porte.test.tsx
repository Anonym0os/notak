// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Acces } from '../bureau'
import { texteErreur } from './acces'
import { SERVEUR, acces, alerte, appelsDe, bouton, coque, commandes, invoke, poserCoque, retirerCoque } from './essai'
import { LENTEUR_MS, Porte, passerLaPorte } from './Porte'

const retenu = (o: Partial<Acces> = {}) => acces({ ouvrir: 'serveur', serveur: SERVEUR, ...o })

let racine: Root
let hote: HTMLElement

beforeEach(() => {
  definirLangue('fr')
  poserCoque()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
  hote = document.createElement('div')
  hote.id = 'racine'
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  act(() => racine.unmount())
  hote.remove()
  retirerCoque()
})

describe('la connexion au serveur retenu, au lancement', () => {
  it('dit à quel serveur elle se connecte, et l’y envoie en le retenant encore', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    expect(document.querySelector('h1')?.textContent).toBe('Connexion à notak.exemple.fr…')
    expect(document.querySelector('.bureau-roue')).not.toBeNull()
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: SERVEUR, garder: true }])
  })

  it('ne touche pas aux copies .notak ouvertes : la page du serveur les prendra', async () => {
    coque.joindre_serveur = () => new Promise(() => {})
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    expect(commandes()).toEqual(['joindre_serveur'])
  })

  it('ne propose rien tout de suite, puis, passé dix secondes, d’ouvrir les toiles de cet ordinateur', async () => {
    vi.useFakeTimers()
    coque.joindre_serveur = () => new Promise(() => {})
    coque.annuler_jonction = () => false
    const surLocal = vi.fn()
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={surLocal} />))
    await act(async () => void vi.advanceTimersByTime(LENTEUR_MS - 1))
    expect(bouton('Ouvrir les toiles de cet ordinateur')).toBeUndefined()
    await act(async () => void vi.advanceTimersByTime(1))
    const ouvrir = bouton('Ouvrir les toiles de cet ordinateur')!
    expect(ouvrir).toBeTruthy()
    expect(document.querySelector('[role="status"]')?.textContent).toBe('notak.exemple.fr tarde à répondre.')
    expect(document.body.textContent).toContain('Pour cette fois seulement : notak.exemple.fr reste mémorisé')
    expect(document.activeElement).toBe(ouvrir)
    await act(async () => ouvrir.click())
    expect(surLocal).toHaveBeenCalledOnce()
    // Pour cette fois seulement : ni le serveur ni où Notak s'ouvre ne changent ; la jonction en cours est abandonnée,
    // pour qu'une réponse tardive du serveur n'emmène pas la fenêtre.
    expect(commandes()).toEqual(['joindre_serveur', 'annuler_jonction'])
    // Un second clic ne redemande rien.
    await act(async () => ouvrir.click())
    expect(appelsDe('annuler_jonction')).toHaveLength(1)
  })

  it('la fenêtre déjà partie chercher le serveur : la coque la ramène, la page n’ouvre rien elle-même', async () => {
    vi.useFakeTimers()
    // Le serveur a répondu, la navigation est lancée, mais sa page tarde : la porte est encore là.
    coque.joindre_serveur = () => ({ origine: SERVEUR, nom: null, version: '1' })
    coque.annuler_jonction = () => true
    const surLocal = vi.fn()
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={surLocal} />))
    await act(async () => void vi.advanceTimersByTime(LENTEUR_MS))
    await act(async () => bouton('Ouvrir les toiles de cet ordinateur')!.click())
    expect(appelsDe('annuler_jonction')).toHaveLength(1)
    expect(surLocal).not.toHaveBeenCalled()
  })

  it('une coque qui ne sait pas arrêter la connexion : les toiles d’ici s’ouvrent quand même', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    coque.joindre_serveur = () => new Promise(() => {})
    const surLocal = vi.fn()
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={surLocal} />))
    await act(async () => void vi.advanceTimersByTime(LENTEUR_MS))
    await act(async () => bouton('Ouvrir les toiles de cet ordinateur')!.click())
    expect(surLocal).toHaveBeenCalledOnce()
  })

  it('un serveur qui répond mal : l’écran d’accès dit pourquoi, avec son adresse sous la main', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'certificat' }
    }
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    expect(alerte()).toBe(texteErreur({ code: 'certificat' }))
    expect(document.querySelector<HTMLInputElement>('input[name="adresse"]')!.value).toBe(SERVEUR)
    expect(bouton('Toiles de cet ordinateur')).toBeTruthy()
    expect(bouton('Oublier ce serveur')).toBeTruthy()
    // Un seul essai : l'écran ne se reconnecte pas tout seul.
    expect(appelsDe('joindre_serveur')).toHaveLength(1)
  })

  it('depuis cet écran, « Toiles de cet ordinateur » les ouvre pour cette fois, sans rien régler', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'injoignable' }
    }
    const surLocal = vi.fn()
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={surLocal} />))
    expect(document.body.textContent).toContain('au prochain lancement, Notak s’ouvrira encore sur notak.exemple.fr')
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(surLocal).toHaveBeenCalledOnce()
    expect(commandes()).toEqual(['joindre_serveur'])
  })

  it('« Réessayer » (« Se connecter ») renvoie l’adresse du champ', async () => {
    coque.joindre_serveur = () => {
      throw { code: 'delai' }
    }
    await act(async () => racine.render(<Porte acces={retenu()} recherche="" surLocal={() => {}} />))
    await act(async () => void document.querySelector('form')!.requestSubmit())
    expect(appelsDe('joindre_serveur')).toEqual([
      { adresse: SERVEUR, garder: true },
      { adresse: SERVEUR, garder: true },
    ])
  })
})

describe('l’écran d’accès demandé (?acces)', () => {
  it('ne se connecte jamais de lui-même, même avec un serveur à ouvrir', async () => {
    await act(async () => racine.render(<Porte acces={retenu()} recherche="?acces" surLocal={() => {}} />))
    expect(document.querySelector('h1')?.textContent).toBe('Se connecter à un serveur Notak')
    expect(invoke).not.toHaveBeenCalled()
    expect(alerte()).toBeNull()
  })

  it('erreur=muette : le serveur retenu n’a pas répondu, et le champ le porte', async () => {
    await act(async () => racine.render(<Porte acces={retenu()} recherche="?acces&erreur=muette" surLocal={() => {}} />))
    expect(alerte()).toContain('notak.exemple.fr n’a pas répondu')
    expect(document.querySelector<HTMLInputElement>('input[name="adresse"]')!.value).toBe(SERVEUR)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('une autre valeur d’erreur dans l’adresse ne s’affiche pas', async () => {
    await act(async () => racine.render(<Porte acces={retenu()} recherche="?acces&erreur=<b>piege</b>" surLocal={() => {}} />))
    expect(alerte()).toBeNull()
    expect(document.body.textContent).not.toContain('piege')
  })

  it('sans serveur retenu, il n’y a rien à reprocher à personne', async () => {
    await act(async () => racine.render(<Porte acces={acces()} recherche="?acces&erreur=muette" surLocal={() => {}} />))
    expect(alerte()).toBeNull()
    expect(document.querySelector<HTMLInputElement>('input[name="adresse"]')!.value).toBe('')
  })

  it('« Toiles de cet ordinateur » rend la main à l’édition locale', async () => {
    const surLocal = vi.fn()
    await act(async () => racine.render(<Porte acces={acces()} recherche="?acces" surLocal={surLocal} />))
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(surLocal).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('passer la porte', () => {
  it('les toiles de cet ordinateur : l’édition locale se monte sans rien afficher d’autre', async () => {
    coque.acces = () => acces()
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    expect(monter).toHaveBeenCalledOnce()
    expect(hote.childElementCount).toBe(0)
  })

  it('un coup d’œil depuis un serveur (?ici) : l’édition locale, sans connexion, et l’adresse nettoyée', async () => {
    history.replaceState(null, '', '/?ici&garde=1')
    coque.acces = () => retenu()
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    expect(monter).toHaveBeenCalledOnce()
    expect(commandes()).toEqual(['acces'])
    expect(location.search).toBe('?garde=1')
  })

  it('le coup d’œil vaut pour la séance : l’édition qui se recharge d’elle-même ne rejoint pas le serveur', async () => {
    history.replaceState(null, '', '/?ici')
    coque.acces = () => retenu()
    coque.joindre_serveur = () => new Promise(() => {})
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    // Une copie devenue l'accueil : la page repart de « / ».
    await act(async () => passerLaPorte(monter))
    expect(monter).toHaveBeenCalledTimes(2)
    expect(appelsDe('joindre_serveur')).toEqual([])
    // L'écran d'accès demandé, lui, s'affiche toujours.
    history.replaceState(null, '', '/?acces')
    await act(async () => passerLaPorte(monter))
    expect(hote.querySelector('h1')?.textContent).toBe('Se connecter à un serveur Notak')
  })

  it('« pour cette fois » à la porte vaut aussi pour la séance', async () => {
    coque.acces = () => retenu()
    coque.joindre_serveur = () => {
      throw { code: 'injoignable' }
    }
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(monter).toHaveBeenCalledOnce()
    await act(async () => passerLaPorte(monter))
    expect(monter).toHaveBeenCalledTimes(2)
    expect(appelsDe('joindre_serveur')).toHaveLength(1)
  })

  it('une coque d’avant les serveurs (réglages refusés) : l’édition locale', async () => {
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    expect(monter).toHaveBeenCalledOnce()
  })

  it('une coque qui ne répond pas retient la page trois secondes, pas davantage', async () => {
    vi.useFakeTimers()
    coque.acces = () => new Promise(() => {})
    const monter = vi.fn()
    const fin = passerLaPorte(monter)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(monter).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await fin
    expect(monter).toHaveBeenCalledOnce()
  })

  it('un serveur retenu : la connexion prend la place, et l’édition locale ne se monte pas', async () => {
    coque.acces = () => retenu()
    coque.joindre_serveur = () => new Promise(() => {})
    const monter = vi.fn()
    await act(async () => passerLaPorte(monter))
    expect(monter).not.toHaveBeenCalled()
    expect(hote.querySelector('h1')?.textContent).toBe('Connexion à notak.exemple.fr…')
    expect(commandes()).toEqual(['acces', 'joindre_serveur'])
  })

  it('l’écran d’accès : choisir les toiles d’ici retire la porte, nettoie l’adresse et monte l’édition locale', async () => {
    history.replaceState(null, '', '/?acces&erreur=muette&garde=1#fin')
    coque.acces = () => acces({ serveur: SERVEUR })
    const monter = vi.fn(() => expect(hote.childElementCount).toBe(0))
    await act(async () => passerLaPorte(monter))
    expect(hote.querySelector('h1')?.textContent).toBe('Se connecter à un serveur Notak')
    expect(monter).not.toHaveBeenCalled()
    await act(async () => bouton('Toiles de cet ordinateur')!.click())
    expect(monter).toHaveBeenCalledOnce()
    // Un rechargement ne ramène pas à l'écran d'accès ; le reste de l'adresse est intact.
    expect(location.search).toBe('?garde=1')
    expect(location.hash).toBe('#fin')
  })
})
