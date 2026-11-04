import { auDoigt } from '@notak/tableau'

/**
 * Le clavier d'iOS ne monte que si un champ prend le focus pendant le geste lui-même. Or le champ qu'on renomme
 * (une tuile, un dossier neuf) n'apparaît qu'après coup, une fois le menu fermé ou la toile créée : son focus arrive
 * trop tard, et le clavier reste caché. On focalise donc tout de suite, dans le geste, un champ relais invisible ; le
 * clavier monte, et le vrai champ lui reprend le focus en paraissant. Sans doigt, il n'y a rien à faire.
 */

const ID_RELAIS = 'notak-relais-clavier'
/** Rien n'est venu prendre le relais : le clavier redescend. */
const ATTENTE_MAX = 2500

export function preparerClavier(doc: Document = document): void {
  if (!auDoigt()) return
  let relais = doc.getElementById(ID_RELAIS) as HTMLInputElement | null
  if (!relais) {
    relais = doc.createElement('input')
    relais.id = ID_RELAIS
    relais.type = 'text'
    relais.tabIndex = -1
    relais.setAttribute('aria-hidden', 'true')
    relais.autocomplete = 'off'
    // 16 px : iOS ne zoome pas sur le champ. Hors de vue, sans rien recouvrir.
    Object.assign(relais.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', fontSize: '16px', border: '0', padding: '0', pointerEvents: 'none' })
    doc.body.append(relais)
  }
  relais.focus({ preventScroll: true })
  const lui = relais
  setTimeout(() => {
    if (doc.activeElement === lui) lui.blur()
  }, ATTENTE_MAX)
}
