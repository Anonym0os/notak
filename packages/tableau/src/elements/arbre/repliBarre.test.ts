import { describe, expect, it } from 'vitest'
import { BOUTONS_BARRE, type MesuresBarre, ORDRE_REPLI, calculerRepli, largeurPilule, largeurRequise, placerBarre } from './repliBarre'

/** La carte de Xmind, comme Notak la dispose : 8 + maison 42 + 12 + panneau 42 + 12 avant le titre ; export 42 + 12 + pilule 76 + 8 à droite. */
const mesures = (largeur: number, plus: Partial<MesuresBarre> = {}): MesuresBarre => ({ largeur, debutTitre: 116, titre: 100, droite: 138, ...plus })

describe('la largeur de la barre', () => {
  it('une pilule : 4 de bord, 34 par bouton, 48 pour le « + » (Xmind : 260 pour six boutons)', () => {
    expect(largeurPilule(6)).toBe(260)
    expect(largeurPilule(0)).toBe(56)
  })

  it('chaque niveau libère ce que l’élément replié occupait', () => {
    // 116 + 100 + 16 + 260 + 16 + 138 pour tout garder ; le titre libère 100 + 12 ; chaque bouton 34.
    expect(largeurRequise(mesures(0), 0)).toBe(646)
    expect(largeurRequise(mesures(0), 1)).toBe(534)
    expect(ORDRE_REPLI.slice(0, 7)).toEqual(['titre', 'tache', 'etiquette', 'zone', 'limite', 'resume', 'relation'])
    expect([2, 3, 4, 5, 6, 7].map((n) => largeurRequise(mesures(0), n))).toEqual([500, 466, 432, 398, 364, 330])
  })
})

describe('le repli', () => {
  it('rien ne se replie quand tout tient, ni sans mesure', () => {
    for (const r of [calculerRepli(mesures(646)), calculerRepli(mesures(1400)), calculerRepli(null), calculerRepli(mesures(0))]) {
      expect(r).toMatchObject({ niveau: 0, titreReplie: false, replies: [], masquee: false })
      expect(r.visibles).toEqual([...BOUTONS_BARRE])
    }
  })

  it('le titre part le premier, puis les boutons de droite à gauche, jamais plus que nécessaire', () => {
    const r = (l: number) => calculerRepli(mesures(l))
    expect(r(645)).toMatchObject({ niveau: 1, titreReplie: true, replies: [] })
    expect(r(534)).toMatchObject({ niveau: 1, titreReplie: true, replies: [] })
    expect(r(533)).toMatchObject({ niveau: 2, titreReplie: true, replies: ['tache'] })
    expect(r(499).replies).toEqual(['etiquette', 'tache'])
    expect(r(465).replies).toEqual(['zone', 'etiquette', 'tache'])
    expect(r(431).replies).toEqual(['limite', 'zone', 'etiquette', 'tache'])
    expect(r(397).replies).toEqual(['resume', 'limite', 'zone', 'etiquette', 'tache'])
    expect(r(363)).toMatchObject({ niveau: 7, replies: [...BOUTONS_BARRE], visibles: [], masquee: false })
    expect(r(330).masquee).toBe(false)
  })

  it('un seul seuil par niveau, dans les deux sens : pas d’hystérésis', () => {
    for (let l = 700; l >= 300; l -= 7) expect(calculerRepli(mesures(l)).niveau).toBeGreaterThanOrEqual(calculerRepli(mesures(l + 7)).niveau)
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const seuil = largeurRequise(mesures(0), n)
      expect(calculerRepli(mesures(seuil)).niveau).toBeLessThanOrEqual(n)
      if (n > 0) expect(calculerRepli(mesures(seuil - 1)).niveau).toBeGreaterThan(n - 1)
    }
  })

  it('même le « + » seul ne tient pas : la barre se retire', () => {
    expect(calculerRepli(mesures(329))).toMatchObject({ niveau: 7, masquee: true })
  })

  it('le titre plus long, ou un panneau plus large à droite, déplace les seuils d’autant', () => {
    expect(calculerRepli(mesures(646, { titre: 260 })).niveau).toBeGreaterThan(0)
    expect(calculerRepli(mesures(806, { titre: 260 })).niveau).toBe(0)
    expect(calculerRepli(mesures(646, { droite: 200 })).niveau).toBeGreaterThan(0)
  })

  it('un panneau de côté ouvert rétrécit la zone : la barre replie, fermé elle rouvre', () => {
    const fenetre = 900
    const cote = 268 + 16
    expect(calculerRepli(mesures(fenetre)).niveau).toBe(0)
    expect(calculerRepli(mesures(fenetre - cote)).niveau).toBeGreaterThan(0)
    expect(calculerRepli(mesures(fenetre)).niveau).toBe(0)
  })
})

describe('la place de la barre', () => {
  it('centrée sur la zone quand il y a de la place', () => {
    const m = mesures(1200)
    expect(placerBarre(m, calculerRepli(m))).toBe((1200 - 260) / 2)
  })

  it('poussée vers le côté libre quand le titre ou les pastilles gênent, avec 16 de vide au moins', () => {
    // Un long titre : la zone assez large pour tout garder, mais la barre centrée toucherait le titre.
    const long = mesures(806, { titre: 260 })
    const r = calculerRepli(long)
    expect(r.niveau).toBe(0)
    const x = placerBarre(long, r)
    expect(x).toBeGreaterThanOrEqual(116 + 260 + 16)
    expect(x).toBeGreaterThan((806 - 260) / 2)
    expect(x + largeurPilule(6)).toBeLessThanOrEqual(806 - 138 - 16)
  })

  it('à chaque largeur, la barre ne recouvre ni le titre ni le bloc de droite', () => {
    for (let largeur = 330; largeur <= 1300; largeur += 13) {
      for (const titre of [100, 180, 260]) {
        const m = mesures(largeur, { titre })
        const r = calculerRepli(m)
        const x = placerBarre(m, r)
        const finGauche = r.titreReplie ? m.debutTitre - 12 : m.debutTitre + m.titre
        expect(x, `${largeur} / ${titre}`).toBeGreaterThanOrEqual(finGauche + 16)
        expect(x + largeurPilule(r.visibles.length), `${largeur} / ${titre}`).toBeLessThanOrEqual(largeur - m.droite - 16)
      }
    }
  })
})
