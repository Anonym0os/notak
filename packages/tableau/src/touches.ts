// Lire un raccourci comme il est marqué sur le clavier de la personne, quelle que soit sa disposition (AZERTY,
// QWERTZ, QWERTY…), sur Mac comme ailleurs.
//
// `key` dit le caractère que la touche a donné : juste tant qu'Alt n'est pas tenu, mais sur Mac ⌥A donne « å » (« æ »
// en AZERTY). `code` dit la place de la touche sur un clavier QWERTY : en AZERTY, la touche marquée A envoie `KeyQ`, en
// QWERTZ la Z envoie `KeyY`. Ni l'un ni l'autre ne suffit donc pour ⌥A.

/** Ce qu'un raccourci lit d'un évènement clavier (natif ou de React). */
export type ToucheLue = { key?: string; code?: string; keyCode?: number; altKey?: boolean }

/**
 * La lettre (a…z) de la touche, telle qu'elle est marquée sur le clavier, même sous Alt. `key` quand il en donne une ;
 * sinon `keyCode`, que WebKit et Chromium tirent, sur Mac comme sur iPad, du caractère que la touche donne dans la
 * disposition active sans ses modificateurs (`charactersIgnoringModifiers`) : juste dès la première frappe, sans rien
 * apprendre, et c'est déjà ce que ProseMirror lit pour les raccourcis du texte. Une disposition sans lettres latines
 * (cyrillique, grec) n'en donne pas : `keyCode` retombe alors sur la place de la touche, comme les raccourcis du Mac.
 */
export function lettreDe(e: ToucheLue): string | null {
  const k = (e.key ?? '').toLowerCase()
  if (/^[a-z]$/.test(k)) return k
  const c = e.keyCode ?? 0
  if (c >= 65 && c <= 90) return String.fromCharCode(c + 32)
  const m = /^Key([A-Z])$/.exec(e.code ?? '')
  return m ? m[1]!.toLowerCase() : null
}

/**
 * Le chiffre de la touche, la rangée du haut ou le pavé, même changé par Maj ou Alt (« ¡ » pour ⌥1 en QWERTY) : en
 * AZERTY, ⌘1 se tape ⌘& sans Maj, comme dans les menus du Mac.
 */
export function chiffreDe(e: ToucheLue): number | null {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? '') ?? /^(\d)$/.exec(e.key ?? '')
  return m ? Number(m[1]) : null
}

/**
 * La place des signes sur un clavier américain, seuls puis avec Maj : ce qu'on suppose d'une touche dont on n'a encore
 * rien vu, comme le faisaient les raccourcis avant qu'on apprenne la disposition.
 */
const AMERICAIN: Record<string, readonly [string, string]> = {
  Backquote: ['`', '~'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
}

/**
 * Ce que chaque touche donne d'ordinaire, seule (`KeyM`) puis avec Maj seule (`KeyM⇧`), appris des frappes de la
 * personne : `keyCode` ne dit rien de juste d'une ponctuation hors d'un clavier américain. Gardé d'une visite à l'autre,
 * pour que ⇧⌘, tombe juste en AZERTY dès la première frappe.
 */
const CLE = 'notak:disposition'
const appris = new Map<string, string>(lireGarde())

function lireGarde(): [string, string][] {
  try {
    // Ce qui est gardé vient peut-être d'une autre version : seules passent des paires « touche → un caractère ».
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}') as unknown
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return []
    return Object.entries(brut).filter((x): x is [string, string] => /^[A-Za-z0-9]{1,24}⇧?$/.test(x[0]) && typeof x[1] === 'string' && [...x[1]].length === 1)
  } catch {
    return []
  }
}

function garder() {
  try {
    localStorage.setItem(CLE, JSON.stringify(Object.fromEntries(appris)))
  } catch {
    // Sans stockage, la disposition s'apprend de nouveau à chaque visite.
  }
}

/**
 * Retient ce que la touche vient de donner, quand rien ne l'a changé : ni Alt, ni Cmd, ni Ctrl, ni AltGr, ni le
 * verrouillage des majuscules (qui donne les chiffres sur un Mac en AZERTY), ni une composition en cours. Une touche
 * morte (`Dead`, l'accent grave d'un Mac français) ne s'apprend pas : elle ne dit pas son signe.
 */
export function apprendre(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return
  if (e.getModifierState?.('AltGraph') || e.getModifierState?.('CapsLock')) return
  if (!e.code || [...e.key].length !== 1 || e.key === ' ') return
  const cle = e.shiftKey ? `${e.code}⇧` : e.code
  if (appris.get(cle) === e.key) return
  appris.set(cle, e.key)
  garder()
}

/** Ce que la touche `code` donne seule, ou avec Maj seule (`maj`), d'après ce qu'on en a vu ; `undefined` : rien vu. */
export function signeAppris(code: string | undefined, maj = false): string | undefined {
  return code ? appris.get(maj ? `${code}⇧` : code) : undefined
}

/** Oublie la disposition apprise (pour les essais). */
export function oublierDisposition() {
  appris.clear()
}

/**
 * Lequel de ces signes la touche porte : celui qu'elle vient de donner (`key`) ; sinon celui qu'elle donne d'ordinaire,
 * seule ou avec Maj (sous Alt, le Mac change le caractère ; sous Maj, ⇧⌘, donne « < » en QWERTY, « ? » en AZERTY).
 * Une touche dont on n'a encore rien vu se lit à sa place sur un clavier américain, à moins que `key` ne dise qu'elle
 * donne autre chose : en AZERTY, la touche que QWERTY place à « / » donne « = », et ⌘= reste le zoom. `null` : aucun.
 */
export function signeParmi(e: ToucheLue, signes: readonly string[]): string | null {
  if (e.key && signes.includes(e.key)) return e.key
  const vus = [signeAppris(e.code), signeAppris(e.code, true)].filter((s): s is string => s !== undefined)
  if (vus.length > 0) return vus.find((s) => signes.includes(s)) ?? null
  const americain = AMERICAIN[e.code ?? '']
  if (!americain) return null
  // `key` parle quand rien ne l'a changé : ni Alt, ni une touche morte (`Dead`).
  const parle = !e.altKey && [...(e.key ?? '')].length === 1
  if (parle && !americain.includes(e.key!)) return null
  return americain.find((s) => signes.includes(s)) ?? null
}

if (typeof window !== 'undefined') {
  // Toutes les frappes, celles des champs comprises (c'est là qu'on tape « , » et « . ») : avant qu'on les arrête.
  window.addEventListener('keydown', apprendre, true)
  // Chrome sait dire d'un coup ce que chaque touche donne seule (`navigator.keyboard`), WebKit et Firefox non : ce
  // qu'on apprend des frappes y suffit. Ce que dit Chrome est la disposition de maintenant : elle passe devant ce qui
  // était gardé d'une visite où la personne en avait peut-être une autre.
  const clavier = (navigator as Navigator & { keyboard?: { getLayoutMap?(): Promise<{ forEach(f: (signe: string, code: string) => void): void }> } }).keyboard
  void (async () => {
    try {
      const carte = await clavier?.getLayoutMap?.()
      carte?.forEach((signe, code) => {
        if ([...signe].length === 1) appris.set(code, signe)
      })
    } catch {
      // Refusé (un cadre d'une autre origine) : on apprend des frappes.
    }
  })()
}
