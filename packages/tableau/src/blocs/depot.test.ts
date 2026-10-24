import { describe, expect, it } from 'vitest'
import { type ColonneMesuree, type EntreeDepot, choisirDepot, niveauParX, niveauxEntre, traitDuFlanc, traitDuNiveau } from './depot'
import type { Ligne } from './glisser'

/** Une ligne de 720 px de large (de 100 à 820), de `haut` à `bas`, dont le `pos` est son rang × 10. */
const L = (id: string, rang: number, haut: number, bas: number, plus: Partial<Ligne> = {}): Ligne => ({
  id,
  type: 'texte',
  pos: rang * 10,
  fin: rang * 10 + 10,
  niveau: 0,
  parent: null,
  conteneur: null,
  gauche: 100,
  droite: 820,
  haut,
  bas,
  cadre: { gauche: 100, droite: 820 },
  ferme: false,
  aEnfants: false,
  ...plus,
})

const trois = [L('A', 0, 0, 40), L('B', 1, 40, 80), L('C', 2, 80, 120)]
const entree = (lignes: Ligne[], x: number, y: number, plus: Partial<EntreeDepot> = {}): EntreeDepot => ({
  lignes,
  colonnes: [],
  fins: new Map([[null, 1000]]),
  x,
  y,
  tires: [],
  copier: false,
  ...plus,
})

describe('NOTION.md § 8 : où tombe un bloc tiré', () => {
  it('entre deux blocs courts, le bord le plus proche du pointeur, à toute la largeur du bloc', () => {
    const d = choisirDepot(entree(trois, 400, 70))
    expect(d).toMatchObject({ genre: 'entre', suivant: 'C', ou: 20, niveau: 0, repere: { x: 100, y: 80, largeur: 720, hauteur: 4 } })
    expect(choisirDepot(entree(trois, 400, 50))).toMatchObject({ genre: 'entre', suivant: 'B', repere: { y: 40 } })
  })

  it('un bloc de moins de 50 px est une cible sur toute sa hauteur et jusqu’à 125 px autour', () => {
    expect(choisirDepot(entree(trois, 400, 200))).toMatchObject({ genre: 'entre', suivant: null })
    const bas = [L('A', 0, 300, 340), L('B', 1, 340, 380)]
    expect(choisirDepot(entree(bas, 400, 180))).toMatchObject({ genre: 'entre', suivant: 'A' })
    expect(choisirDepot(entree(bas, 400, 100))).toBeNull()
  })

  it('sous le dernier bloc de la page, la zone n’a pas de plafond', () => {
    const d = choisirDepot(entree(trois, 400, 900))
    expect(d).toMatchObject({ genre: 'entre', suivant: null, ou: 1000, repere: { y: 120 } })
  })

  it('un bloc haut n’offre le haut et le bas que dans ses 25 px d’extrémité', () => {
    const haut = [L('A', 0, 0, 100)]
    expect(choisirDepot(entree(haut, 600, 10))).toMatchObject({ genre: 'entre', repere: { y: 0 } })
    expect(choisirDepot(entree(haut, 600, 90))).toMatchObject({ genre: 'entre', repere: { y: 100 } })
    // Au milieu, loin des bords : ni haut ni bas, et trop loin des flancs.
    expect(choisirDepot(entree(haut, 600, 50))).toBeNull()
  })

  it('à gauche de L − 30 px, le trait devient une barre verticale : une colonne naîtra', () => {
    const d = choisirDepot(entree(trois, 60, 60))
    expect(d).toEqual({ genre: 'flanc', cible: 'B', flanc: 'gauche', repere: { x: 92, y: 40, largeur: 4, hauteur: 40 } })
    // Dans la bande de 30 px, c’est encore un trait horizontal.
    expect(choisirDepot(entree(trois, 75, 60))?.genre).toBe('entre')
  })

  it('à droite du bloc, la barre se tient à 4 px du bord ; à plus de 200 px, rien', () => {
    expect(choisirDepot(entree(trois, 830, 60))).toEqual({ genre: 'flanc', cible: 'B', flanc: 'droite', repere: { x: 824, y: 40, largeur: 4, hauteur: 40 } })
    expect(choisirDepot(entree(trois, 1100, 60))).toBeNull()
  })

  it('un bloc haut offre une colonne dans la moitié gauche de son corps, pas au centre', () => {
    const haut = [L('A', 0, 0, 100)]
    expect(choisirDepot(entree(haut, 250, 50))).toMatchObject({ genre: 'flanc', cible: 'A', flanc: 'gauche' })
    expect(choisirDepot(entree(haut, 460, 50))).toBeNull()
  })

  it('pas de flanc sans droit d’éditer, ni sur un tableau', () => {
    expect(choisirDepot(entree(trois, 60, 60, { flancs: false }))).toBeNull()
    expect(choisirDepot(entree([L('T', 0, 0, 40, { type: 'tableau' })], 60, 20))).toBeNull()
  })

  it('le bloc tiré, et ses enfants, ne sont pas des cibles', () => {
    const lignes = [L('A', 0, 0, 40), L('B', 1, 40, 80, { fin: 30, aEnfants: true }), L('B1', 2, 80, 120, { niveau: 1, parent: 'B' }), L('C', 3, 120, 160)]
    const tires = [{ pos: 10, fin: 30 }]
    expect(choisirDepot(entree(lignes, 400, 60, { tires }))).toBeNull()
    expect(choisirDepot(entree(lignes, 400, 100, { tires }))).toBeNull()
    // Le bord d’après passe par-dessus le bloc tiré : la limite est celle entre A et C.
    expect(choisirDepot(entree(lignes, 400, 125, { tires }))).toMatchObject({ genre: 'entre', suivant: 'C', niveau: 0 })
    // ⌥ : on peut déposer à côté du bloc tiré lui-même.
    expect(choisirDepot(entree(lignes, 400, 60, { tires, copier: true }))?.genre).toBe('entre')
  })
})

describe('NOTION.md § 8 : le retrait se choisit par l’abscisse', () => {
  const liste = [
    L('P', 0, 0, 40, { type: 'puce', fin: 20, aEnfants: true }),
    L('C', 1, 40, 80, { type: 'puce', niveau: 1, parent: 'P', pos: 10, fin: 20 }),
    L('Q', 2, 80, 120, { type: 'puce', pos: 20, fin: 30 }),
  ]

  it('entre le dernier enfant et le bloc suivant, deux niveaux : la souris à droite met dans l’enfant', () => {
    const profond = choisirDepot(entree(liste, 500, 82))
    expect(profond).toMatchObject({ genre: 'entre', niveau: 1, suivant: 'Q' })
    // Le trait est décalé de 32 px et raccourci de 6 px par niveau (mesuré : x = L + 32, largeur 682).
    expect(profond && 'repere' in profond && profond.repere).toEqual({ x: 132, y: 80, largeur: 682, hauteur: 4 })
    const surface = choisirDepot(entree(liste, 110, 82))
    expect(surface).toMatchObject({ genre: 'entre', niveau: 0, repere: { x: 100, largeur: 720 }, voile: null })
  })

  it('le parent qui reçoit prend un voile, enfants compris, à 2 px du bord', () => {
    const d = choisirDepot(entree(liste, 500, 82))
    expect(d && d.genre === 'entre' && d.voile).toEqual({ gauche: 102, droite: 818, haut: 2, bas: 78 })
  })

  it('entre un parent et son premier enfant, il n’y a qu’un niveau : celui de l’enfant', () => {
    expect(choisirDepot(entree(liste, 110, 42))).toMatchObject({ genre: 'entre', niveau: 1, suivant: 'C' })
  })

  it('niveauxEntre : du niveau du bloc d’après à celui du bloc d’avant, un de plus pour un dépliant ouvert', () => {
    expect(niveauxEntre({ niveau: 2, type: 'texte', ferme: false }, { niveau: 0 }, false)).toEqual([0, 1, 2])
    expect(niveauxEntre({ niveau: 0, type: 'deroulant', ferme: false }, { niveau: 0 }, false)).toEqual([0, 1])
    expect(niveauxEntre({ niveau: 0, type: 'deroulant', ferme: true }, { niveau: 0 }, false)).toEqual([0])
    expect(niveauxEntre({ niveau: 0, type: 'puce', ferme: false }, { niveau: 1 }, true)).toEqual([1])
    expect(niveauxEntre(null, { niveau: 0 }, false)).toEqual([0])
    expect(niveauxEntre({ niveau: 3, type: 'texte', ferme: false }, null, false)).toEqual([0, 1, 2, 3])
  })

  it('niveauParX : le plus profond dont le bord est à gauche du pointeur, sinon le moins profond', () => {
    expect(niveauParX([0, 1, 2], 170, 100)).toBe(2)
    expect(niveauParX([0, 1, 2], 140, 100)).toBe(1)
    expect(niveauParX([0, 1, 2], 20, 100)).toBe(0)
    expect(niveauParX([1, 2], 20, 100)).toBe(1)
  })

  it('un dépliant ouvert reçoit un enfant par son bas ; un dépliant fermé, par dessus', () => {
    const ouvert = [L('D', 0, 0, 40, { type: 'deroulant' }), L('E', 1, 40, 80)]
    expect(choisirDepot(entree(ouvert, 500, 38))).toMatchObject({ genre: 'entre', niveau: 1, suivant: 'E' })
    const ferme = [L('D', 0, 0, 40, { type: 'deroulant', ferme: true, fin: 15 }), L('E', 1, 40, 80, { pos: 15 })]
    expect(choisirDepot(entree(ferme, 500, 20))).toEqual({ genre: 'dans', cible: 'D', ou: 15, niveau: 1, repere: { x: 100, y: 0, largeur: 720, hauteur: 40 } })
    // Un bord à moins de 7 px l’emporte sur « dessus ».
    expect(choisirDepot(entree(ferme, 500, 36))?.genre).toBe('entre')
  })

  it('les traits : horizontal et vertical', () => {
    expect(traitDuNiveau({ gauche: 100, droite: 820 }, 2, 50)).toEqual({ x: 164, y: 50, largeur: 644, hauteur: 4 })
    expect(traitDuFlanc('gauche', 100, 10, 60)).toEqual({ x: 92, y: 10, largeur: 4, hauteur: 50 })
    expect(traitDuFlanc('droite', 820, 10, 60)).toEqual({ x: 824, y: 10, largeur: 4, hauteur: 50 })
  })
})

describe('NOTION.md § 8 : les colonnes', () => {
  // Deux colonnes de 330 px (100 → 430, 476 → 806), chacune avec un bloc de 40 px.
  const lignes = [
    L('A', 0, 0, 40, { conteneur: 'c1', parent: 'c1', gauche: 100, droite: 430, cadre: { gauche: 100, droite: 430 } }),
    L('B', 1, 0, 40, { conteneur: 'c2', parent: 'c2', gauche: 476, droite: 806, cadre: { gauche: 476, droite: 806 } }),
  ]
  const colonnes: ColonneMesuree[] = [
    { id: 'c1', rangee: 'r', indice: 0, total: 2, blocs: ['A'], gauche: 100, haut: 0, droite: 430, bas: 40 },
    { id: 'c2', rangee: 'r', indice: 1, total: 2, blocs: ['B'], gauche: 476, haut: 0, droite: 806, bas: 40 },
  ]
  const e = (x: number, y: number) => entree(lignes, x, y, { colonnes, fins: new Map<string | null, number>([[null, 100], ['c1', 9], ['c2', 19]]) })

  it('à gauche de la première colonne, une colonne naît avant elle', () => {
    expect(choisirDepot(e(60, 20))).toEqual({ genre: 'flanc', cible: 'A', flanc: 'gauche', repere: { x: 92, y: 0, largeur: 4, hauteur: 40 } })
  })

  it('à droite de la dernière colonne seulement, une colonne naît après', () => {
    expect(choisirDepot(e(830, 20))).toEqual({ genre: 'flanc', cible: 'B', flanc: 'droite', repere: { x: 810, y: 0, largeur: 4, hauteur: 40 } })
  })

  it('dans l’écart entre deux colonnes, le trait se pose au milieu', () => {
    expect(choisirDepot(e(440, 20))).toEqual({ genre: 'flanc', cible: 'B', flanc: 'gauche', repere: { x: 451, y: 0, largeur: 4, hauteur: 40 } })
  })

  it('dans une colonne, un bloc court offre le haut et le bas, avec la fin de la colonne pour dernier repère', () => {
    expect(choisirDepot(e(300, 30))).toMatchObject({ genre: 'entre', conteneur: 'c1', suivant: null, ou: 9, repere: { x: 100, y: 40, largeur: 330 } })
  })
})
