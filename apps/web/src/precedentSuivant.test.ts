// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Historique, type Sens, brancherPrecedentSuivant, historiqueDe, navigateurLesSuit, sensDeLaTouche, sensDuBouton } from './precedentSuivant'

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const EDGE = `${CHROME} Edg/142.0.0.0`
const FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.6; rv:145.0) Gecko/20100101 Firefox/145.0'
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15'
/** La webview de l'app de bureau (WKWebView, par Tauri) : WebKit, sans le mot Safari. */
const APP_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const CHROME_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1'

describe('sensDuBouton', () => {
  it('le 4ᵉ bouton recule, le 5ᵉ avance', () => {
    expect(sensDuBouton({ button: 3, buttons: 8 })).toBe('reculer')
    expect(sensDuBouton({ button: 4, buttons: 16 })).toBe('avancer')
    // Au relâchement, plus rien n'est enfoncé : `button` suffit.
    expect(sensDuBouton({ button: 3, buttons: 0 })).toBe('reculer')
  })

  it('reconnaît le WebKit qui les disait bouton du milieu, par ce que `buttons` tient', () => {
    expect(sensDuBouton({ button: 1, buttons: 8 })).toBe('reculer')
    expect(sensDuBouton({ button: 1, buttons: 16 })).toBe('avancer')
  })

  it('laisse le vrai bouton du milieu, seul ou tenu avec un autre, et le clic ordinaire', () => {
    expect(sensDuBouton({ button: 1, buttons: 4 })).toBeNull()
    expect(sensDuBouton({ button: 1, buttons: 4 | 8 })).toBeNull()
    expect(sensDuBouton({ button: 1, buttons: 0 })).toBeNull()
    expect(sensDuBouton({ button: 0, buttons: 1 })).toBeNull()
    expect(sensDuBouton({ button: 2, buttons: 2 })).toBeNull()
  })
})

describe('navigateurLesSuit', () => {
  it('Chrome, ce qui en dérive et Firefox suivent eux-mêmes ces boutons', () => {
    expect(navigateurLesSuit(CHROME)).toBe(true)
    expect(navigateurLesSuit(EDGE)).toBe(true)
    expect(navigateurLesSuit(FIREFOX)).toBe(true)
  })

  it('WebKit ne les suit pas : Safari, l’app de bureau, Chrome sur iPad (WebKit dessous)', () => {
    expect(navigateurLesSuit(SAFARI)).toBe(false)
    expect(navigateurLesSuit(APP_MAC)).toBe(false)
    expect(navigateurLesSuit(CHROME_IPAD)).toBe(false)
  })
})

describe('sensDeLaTouche', () => {
  const touche = (o: Partial<KeyboardEvent>) => ({ key: '', code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o })

  it('⌘[ recule, ⌘] avance, Ctrl aussi', () => {
    expect(sensDeLaTouche(touche({ key: '[', code: 'BracketLeft', metaKey: true }))).toBe('reculer')
    expect(sensDeLaTouche(touche({ key: ']', code: 'BracketRight', metaKey: true }))).toBe('avancer')
    expect(sensDeLaTouche(touche({ key: '[', code: 'BracketLeft', ctrlKey: true }))).toBe('reculer')
  })

  it('se lit à la place de la touche, pour un clavier AZERTY', () => {
    expect(sensDeLaTouche(touche({ key: '^', code: 'BracketLeft', metaKey: true }))).toBe('reculer')
    expect(sensDeLaTouche(touche({ key: '$', code: 'BracketRight', metaKey: true }))).toBe('avancer')
  })

  it('pas sans ⌘, ni avec ⌥ ou ⇧ (d’autres raccourcis)', () => {
    expect(sensDeLaTouche(touche({ key: '[', code: 'BracketLeft' }))).toBeNull()
    expect(sensDeLaTouche(touche({ key: '[', code: 'BracketLeft', metaKey: true, altKey: true }))).toBeNull()
    expect(sensDeLaTouche(touche({ key: '{', code: 'BracketLeft', metaKey: true, shiftKey: true }))).toBeNull()
  })
})

describe('historiqueDe', () => {
  const fenetre = (o: object) => ({ history: { back: vi.fn(), forward: vi.fn() }, ...o }) as unknown as Window

  it('suit l’API Navigation, qui ne compte que les pas de cette origine', () => {
    const h = historiqueDe(fenetre({ navigation: { canGoBack: false, canGoForward: true } }))
    expect(h.peut('reculer')).toBe(false)
    expect(h.peut('avancer')).toBe(true)
  })

  it('sans elle, ne recule pas dans l’app : la fenêtre repartirait vers sa page vide ou sa porte', () => {
    expect(historiqueDe(fenetre({ __TAURI_INTERNALS__: { invoke: vi.fn() } })).peut('reculer')).toBe(false)
    expect(historiqueDe(fenetre({})).peut('reculer')).toBe(true)
  })

  it('fait le pas de l’historique', () => {
    const f = fenetre({})
    historiqueDe(f).aller('reculer')
    historiqueDe(f).aller('avancer')
    expect(f.history.back).toHaveBeenCalledOnce()
    expect(f.history.forward).toHaveBeenCalledOnce()
  })
})

describe('brancherPrecedentSuivant', () => {
  let debrancher = () => {}
  afterEach(() => {
    debrancher()
    document.body.innerHTML = ''
  })

  /** L'historique d'essai : il note chaque pas. */
  function historique(peut = true): Historique & { pas: Sens[] } {
    const pas: Sens[] = []
    return { pas, peut: () => peut, aller: (s) => void pas.push(s) }
  }
  const souris = (type: string, button: number, buttons: number, cible: EventTarget = document.body) => {
    const e = new MouseEvent(type, { button, buttons, bubbles: true, cancelable: true })
    cible.dispatchEvent(e)
    return e
  }
  /** Un appui puis un relâchement, comme les donne un WebKit de 2026 (ou Chrome). */
  const presser = (button: number, cible: EventTarget = document.body) => {
    const buttons = button === 3 ? 8 : 16
    souris('pointerdown', button, buttons, cible)
    souris('mousedown', button, buttons, cible)
    return souris('mouseup', button, 0, cible)
  }

  it('dans WebKit, le 4ᵉ bouton recule et le 5ᵉ avance, au relâchement', () => {
    const h = historique()
    debrancher = brancherPrecedentSuivant(window, { suitSeul: false, historique: h })
    expect(presser(3).defaultPrevented).toBe(true)
    expect(presser(4).defaultPrevented).toBe(true)
    expect(h.pas).toEqual(['reculer', 'avancer'])
  })

  it('l’appui ne descend pas dans la page : rien dessous ne le prend pour un clic', () => {
    debrancher = brancherPrecedentSuivant(window, { suitSeul: false, historique: historique() })
    const vu = vi.fn()
    document.body.addEventListener('pointerdown', vu)
    document.body.addEventListener('mousedown', vu)
    presser(3)
    expect(vu).not.toHaveBeenCalled()
    souris('pointerdown', 0, 1)
    expect(vu).toHaveBeenCalledOnce()
  })

  it('le WebKit d’avant 2026 : un « milieu » qui tient le 4ᵉ bouton recule, sans faire glisser la toile ni ouvrir de lien', () => {
    const h = historique()
    debrancher = brancherPrecedentSuivant(window, { suitSeul: false, historique: h })
    const glisser = vi.fn()
    document.body.addEventListener('pointerdown', glisser)
    souris('pointerdown', 1, 8)
    souris('mousedown', 1, 8)
    souris('mouseup', 1, 0)
    expect(souris('auxclick', 1, 0).defaultPrevented).toBe(true)
    expect(glisser).not.toHaveBeenCalled()
    expect(h.pas).toEqual(['reculer'])
  })

  it('le vrai bouton du milieu garde son glisser et son clic', () => {
    const h = historique()
    debrancher = brancherPrecedentSuivant(window, { suitSeul: false, historique: h })
    const glisser = vi.fn()
    document.body.addEventListener('pointerdown', glisser)
    souris('pointerdown', 1, 4)
    souris('mousedown', 1, 4)
    souris('mouseup', 1, 0)
    expect(souris('auxclick', 1, 0).defaultPrevented).toBe(false)
    expect(glisser).toHaveBeenCalledOnce()
    expect(h.pas).toEqual([])
  })

  it('un élément qui a besoin du bouton le garde en annulant son relâchement', () => {
    const h = historique()
    debrancher = brancherPrecedentSuivant(window, { suitSeul: false, historique: h })
    const editeur = document.body.appendChild(document.createElement('div'))
    editeur.addEventListener('mouseup', (e) => e.preventDefault())
    presser(3, editeur)
    expect(h.pas).toEqual([])
  })

  it('sans pas à faire (le début de l’historique de l’app), rien ne bouge', () => {
    const h = historique(false)
    debrancher = brancherPrecedentSuivant(window, { suitSeul: false, historique: h })
    presser(3)
    expect(h.pas).toEqual([])
  })

  it('dans Chrome, le navigateur fait le pas lui-même : la page ne le refait pas', () => {
    const h = historique()
    debrancher = brancherPrecedentSuivant(window, { suitSeul: true, historique: h })
    expect(presser(3).defaultPrevented).toBe(false)
    const cmd = new KeyboardEvent('keydown', { key: '[', code: 'BracketLeft', metaKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(cmd)
    expect(cmd.defaultPrevented).toBe(false)
    expect(h.pas).toEqual([])
  })

  it('⌘[ et ⌘] font de même là où personne ne les prend', () => {
    const h = historique()
    debrancher = brancherPrecedentSuivant(window, { suitSeul: false, historique: h })
    const taper = (cible: EventTarget, o: KeyboardEventInit) => {
      const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, metaKey: true, ...o })
      cible.dispatchEvent(e)
      return e
    }
    expect(taper(document.body, { key: '[', code: 'BracketLeft' }).defaultPrevented).toBe(true)
    taper(document.body, { key: ']', code: 'BracketRight' })
    expect(h.pas).toEqual(['reculer', 'avancer'])

    // Dans un champ ou un texte qu'on écrit, la touche reste au texte.
    const champ = document.body.appendChild(document.createElement('input'))
    expect(taper(champ, { key: '[', code: 'BracketLeft' }).defaultPrevented).toBe(false)
    // La toile a déjà reculé dans ses toiles (elle annule la touche) : pas un second pas.
    const toile = (e: KeyboardEvent) => e.preventDefault()
    document.addEventListener('keydown', toile)
    taper(document.body, { key: '[', code: 'BracketLeft' })
    document.removeEventListener('keydown', toile)
    expect(h.pas).toEqual(['reculer', 'avancer'])
  })
})
