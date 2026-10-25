// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import { Diapositive } from '../Diapo'
import type { Diapo, DiapoListe, EtatItem } from '../modele/diapositives'
import type { Gabarit } from '../modele/gabarits'
import { ajouterEnfant, lire, nouvelArbre } from '../modele/sujets'
import { type RatioPitch, themePitchDe } from '../themesPitch'
import { GABARITS } from './gabarits'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Cours → A (A1, A2, A3), B, C ; P illustré (image sans titre) → I1, I2 illustrés ; Q → R. */
function carte() {
  let a: Arbre = nouvelArbre('Cours')
  const c = lire(a).central
  const ids: Record<string, Id> = { c }
  for (const [nom, parent] of [
    ['A', 'c'],
    ['B', 'c'],
    ['C', 'c'],
    ['A1', 'A'],
    ['A2', 'A'],
    ['A3', 'A'],
    ['P', 'c'],
    ['I1', 'P'],
    ['I2', 'P'],
  ] as const) {
    ;[a, ids[nom]] = ajouterEnfant(a, ids[parent]!, nom === 'P' || nom.startsWith('I') ? '' : `Sujet ${nom}`)
  }
  const image = (id: Id, l: number, h: number) => {
    a = { ...a, sujets: { ...a.sujets, [id]: { ...a.sujets[id]!, image: { fichier: `f-${id}`, l, h } } } }
  }
  image(ids.P!, 800, 600)
  image(ids.I1!, 600, 400)
  image(ids.I2!, 400, 400)
  image(ids.A!, 900, 600)
  a = { ...a, sujets: { ...a.sujets, [ids.A!]: { ...a.sujets[ids.A!]!, etiquettes: ['Urgent'], note: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Une note.' }] }] } } } }
  return { a, ids }
}

const commun = { niveau: 'principal' as const, sautee: false, enchaine: { avant: false, arriere: false } }
const liste = (sujet: Id, gabarit: Gabarit, enfants: Id[], etats?: EtatItem[]): DiapoListe => ({
  ...commun,
  type: 'liste',
  sujet,
  gabarit,
  livraison: 'percer',
  disposition: 'accolade',
  items: enfants.map((id, i) => ({ id, etat: etats?.[i] ?? (i === 0 ? 'courant' : 'cache') })),
  montre: 0,
  centre: 0,
  premiere: false,
})

function monter(a: Arbre, diapo: Diapo, ratio: RatioPitch = '16:9') {
  const hote = document.createElement('div')
  document.body.append(hote)
  const racine = createRoot(hote)
  act(() => racine.render(<Diapositive lecture={lire(a)} diapo={diapo} theme={themePitchDe('default')} ratio={ratio} taille={{ l: 800, h: ratio === '16:9' ? 450 : 600 }} />))
  const boites = [...hote.querySelectorAll('[data-boite]')].map((e) => e.getAttribute('data-boite')!)
  const fin = () => (act(() => racine.unmount()), hote.remove())
  return { hote, boites, fin }
}

describe('les gabarits de diapositive', () => {
  const { a, ids } = carte()
  const { c, A, B, C, A1, A2, A3, P, I1, I2 } = ids as Record<string, Id>
  const enfants = [A!, B!, C!]
  const cas: [Gabarit, Diapo, string[], RatioPitch?][] = [
    ['sujet', { ...commun, type: 'sujet', sujet: B!, gabarit: 'sujet' }, [`${B}:titre`]],
    ['sujet-image', { ...commun, type: 'sujet', sujet: A!, gabarit: 'sujet-image', placeImage: 'gauche' }, [`${A}:image`, `${A}:titre`, `${A}:etiquettes`, `${A}:note`]],
    ['accolade', liste(c!, 'accolade', enfants), [`${c}:titre`, `${c}:accolade`, `${A}:titre`, `${B}:titre`, `${C}:titre`]],
    ['puces', liste(c!, 'puces', enfants), [`${c}:titre`, `${A}:puce`, `${A}:titre`, `${C}:puce`]],
    ['paroles', liste(c!, 'paroles', enfants), [`${c}:titre`, `${c}:fleche`, `${A}:titre`]],
    ['arbre', liste(c!, 'arbre', enfants), [`${c}:titre`, `${A}:branche`, `${C}:branche`, `${B}:titre`], '9:16'],
    ['enfant-unique', liste(B!, 'enfant-unique', [A!]), [`${B}:titre`, `${B}:separateur`, `${A}:titre`]],
    ['resume', { ...commun, type: 'resume', sujet: B!, gabarit: 'resume', plage: [A1!, A2!, A3!], forme: 'accolade', moment: 'entree' }, [`${A1}:titre`, `${B}:ellipse`, `${A3}:titre`, `${B}:forme`, `${B}:titre`]],
    ['resume-defilant', { ...commun, type: 'resume', sujet: B!, gabarit: 'resume-defilant', plage: [A1!, A2!], forme: 'accolade', moment: 'entree' }, [`${A1}:titre`, `${B}:forme`, `${B}:titre`], '9:16'],
    ['arete', liste(c!, 'arete', enfants), [`${c}:titre`, `${c}:epine`, `${A}:arete`, `${B}:arete`, `${C}:titre`]],
    ['tete-arete', liste(A!, 'tete-arete', [A1!, A2!, A3!]), [`${c}:epine`, `${A}:arete`, `${A}:titre`, `${B}:arete`, `${A1}:trait`, `${A1}:titre`]],
    ['chronologie', liste(c!, 'chronologie', enfants), [`${c}:titre`, `${c}:axe`, `${A}:point`, `${A}:tige`, `${B}:titre`]],
    ['tete-chronologie', liste(A!, 'tete-chronologie', [A1!, A2!]), [`${c}:axe`, `${A}:tige`, `${A}:point`, `${A}:titre`, `${A1}:trait`, `${A2}:titre`]],
    ['parent-illustre', liste(P!, 'parent-illustre', enfants), [`${P}:image`, `${A}:titre`, `${C}:titre`]],
    ['enfant-unique-parent-illustre', liste(P!, 'enfant-unique-parent-illustre', [B!]), [`${P}:image`, `${P}:separateur`, `${B}:titre`]],
    ['enfants-illustres', liste(B!, 'enfants-illustres', [I1!, I2!]), [`${B}:titre`, `${I1}:image`, `${I2}:image`]],
    ['liste-illustree', liste(P!, 'liste-illustree', [I1!, I2!]), [`${P}:image`, `${I1}:image`, `${I2}:image`]],
    ['enfant-unique-illustre', liste(B!, 'enfant-unique-illustre', [I1!]), [`${B}:titre`, `${B}:separateur`, `${I1}:image`]],
  ]

  it('chaque gabarit a son dessin', () => {
    expect(Object.keys(GABARITS).sort()).toEqual([...cas.map(([g]) => g), 'fin'].sort())
  })

  for (const [gabarit, diapo, attendues, ratio] of cas)
    it(`${gabarit} : il se monte et pose ses boîtes`, () => {
      const m = monter(a, diapo, ratio)
      expect(m.hote.querySelector('.notak-arbre-diapo')?.getAttribute('data-gabarit')).toBe(gabarit)
      for (const b of attendues) expect(m.boites).toContain(b)
      // Aucune mesure ne s'égare : pas de NaN ni d'infini dans les positions.
      expect(m.hote.innerHTML).not.toMatch(/NaN|Infinity/)
      m.fin()
    })

  it('« Merci » et l’en-tête : la fin porte sa boîte, un sous-sujet le fil d’Ariane de sa branche', () => {
    const m = monter(a, { ...commun, type: 'fin', sujet: c!, niveau: 'central', gabarit: 'sujet' })
    expect(m.boites).toEqual([`${c}:merci`])
    expect(m.hote.textContent).toBe('Merci')
    m.fin()
    const n = monter(a, { ...commun, niveau: 'sous-sujet', type: 'sujet', sujet: A1!, gabarit: 'sujet' })
    expect(n.boites).toEqual([`${A}:entete`, `${A}:filet`, `${A1}:titre`])
    n.fin()
  })

  it('les états d’étape sont des attributs ; la diapositive est à sa taille de base, réduite d’une seule échelle', () => {
    const m = monter(a, liste(c!, 'puces', enfants, ['passe', 'courant', 'cache']))
    const etats = [...m.hote.querySelectorAll('.notak-arbre-diapo-texte[data-etat]')].map((e) => e.getAttribute('data-etat'))
    expect(etats).toEqual(['passe', 'courant', 'cache'])
    const d = m.hote.querySelector<HTMLElement>('.notak-arbre-diapo')!
    expect(d.style.width).toBe('1600px')
    expect(d.style.transform).toBe('scale(0.5)')
    expect(m.hote.querySelector('.notak-arbre-diapo-decor')).toBeTruthy()
    m.fin()
  })

  it('les paroles : le courant en gras, sa version normale superposée', () => {
    const m = monter(a, liste(c!, 'paroles', enfants, ['passe', 'courant', 'cache']))
    const courant = m.hote.querySelector('.notak-arbre-diapo-parole[data-courant]')!
    expect(courant.getAttribute('data-boite')).toBe(`${B}:titre`)
    expect(courant.querySelectorAll('.notak-arbre-diapo-parole-gras, .notak-arbre-diapo-parole-normale')).toHaveLength(2)
    m.fin()
  })
})
