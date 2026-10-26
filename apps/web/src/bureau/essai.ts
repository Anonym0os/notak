import { type Mock, vi } from 'vitest'
import type { Acces } from '../bureau'

/**
 * Ce que partagent les essais de l'app de bureau (jsdom) : une fausse coque, de quoi lire ce qu'on lui a demandé, et de
 * quoi lire l'écran. Une seule maquette : quand le contrat de la coque change, elle change ici pour tous.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export const SERVEUR = 'https://notak.exemple.fr'

/** Des réglages de la coque : les toiles d'ici, sans serveur, sauf ce qu'on change. */
export const acces = (o: Partial<Acces> = {}): Acces => ({ ouvrir: 'local', serveur: null, majAuto: true, version: '0.1.0', ...o })

/** Ce que répond la coque, commande par commande ; une commande absente échoue comme chez une coque trop ancienne. */
export type Table = Record<string, (args: unknown) => unknown>

/** La table de la coque posée (à compléter dans chaque essai : `coque.joindre_serveur = …`), et son `invoke`. */
export let coque: Table = {}
export let invoke: Mock<(commande: string, args?: unknown, options?: unknown) => Promise<unknown>>

/** Pose une fausse coque sur `window`, qui répond d'après `table`. */
export function poserCoque(table: Table = {}) {
  coque = table
  invoke = vi.fn(async (commande: string, args?: unknown) => {
    const r = coque[commande]
    // Ce que dit Tauri d'une commande qu'il ne connaît pas : une phrase, pas un refus de la coque.
    if (!r) throw `Command ${commande} not found`
    return r(args)
  })
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
}

export const retirerCoque = () => void delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__

/** Les arguments de chaque appel à `commande`, dans l'ordre. */
export const appelsDe = (commande: string) => invoke.mock.calls.filter((c) => c[0] === commande).map((c) => c[1])
/** Les commandes demandées, chacune une fois, dans l'ordre de la première demande. */
export const commandes = () => [...new Set(invoke.mock.calls.map((c) => c[0]))]

/** Le bouton qui dit exactement ce texte (ou qui répond à ce motif). */
export const bouton = (texte: string | RegExp) =>
  [...document.querySelectorAll('button')].find((b) => (typeof texte === 'string' ? b.textContent === texte : texte.test(b.textContent ?? '')))
/** Ce que dit l'alerte de l'écran, s'il y en a une. */
export const alerte = () => document.querySelector('[role="alert"]')?.textContent ?? null

/**
 * jsdom ne fait pas de dialogue modal : `open` suffit pour ce qu'on vérifie. `close()` émet `close`, comme un
 * navigateur, et rend le curseur à ce qui l'avait avant `showModal()`. Ce qui l'avait hors des dialogues : jsdom laisse
 * `autoFocus` prendre un champ d'un dialogue encore fermé, ce qu'un navigateur ne fait pas (il n'est pas affiché).
 */
export function dialoguesDeJsdom() {
  // Les types disent `showModal` toujours là ; jsdom ne l'a pas.
  if ((HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal) return
  const avant = new WeakMap<HTMLDialogElement, Element | null>()
  let dehors: Element | null = null
  document.addEventListener('focusin', (e) => {
    if (e.target instanceof Element && !e.target.closest('dialog')) dehors = e.target
  })
  HTMLDialogElement.prototype.showModal = function () {
    avant.set(this, dehors)
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return
    this.open = false
    const retour = avant.get(this)
    if (retour instanceof HTMLElement && retour.isConnected) retour.focus()
    this.dispatchEvent(new Event('close'))
  }
}
