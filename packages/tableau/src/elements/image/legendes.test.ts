import { describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Image } from '../../coeur/tableau'
import { t } from '../../langue'
import { toutesLesEntreesMenu } from '../registre'
import type { ContexteToile } from '../types'
import './index'
import { afficherLegendes, gestesLegende, retirerLegendes } from './legendes'

const image = (id: string, contenu: Partial<Image> = {}, largeur = 20): Element<Image> => ({
  id,
  x: 0,
  y: 0,
  largeur,
  contenu: { type: 'image', fichier: `f-${id}`, largeurOrigine: 300, hauteurOrigine: 200, ...contenu },
})

const contexte = (elements: Element[], lectureSeule = false) => {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements })
  return {
    magasin,
    services: { lectureSeule },
    commencerEdition: vi.fn(),
    finirEdition: vi.fn(),
  } as unknown as ContexteToile & { commencerEdition: ReturnType<typeof vi.fn>; finirEdition: ReturnType<typeof vi.fn> }
}

const entree = (cle: string) => toutesLesEntreesMenu().find((e) => e.libelle === t(cle))
const visibles = (els: Element[], c: ContexteToile) => toutesLesEntreesMenu().filter((e) => e.visible(els, c)).map((e) => e.libelle)

describe('les gestes de la légende d’une image', () => {
  it('ajouter à une image sans légende, modifier et retirer celle qui en a une', () => {
    expect(gestesLegende([image('a')])).toEqual({ ajouter: true, modifier: false, retirer: false })
    expect(gestesLegende([image('a', { legende: 'Un port' })])).toEqual({ ajouter: false, modifier: true, retirer: true })
    // L'invite vide demandée par la tuile : on y ajoute encore son texte, ou on la retire.
    expect(gestesLegende([image('a', { legendeAffichee: true })])).toEqual({ ajouter: true, modifier: false, retirer: true })
  })

  it('rien à ajouter sous 8 UG de large, où la légende ne se montre pas ; plusieurs images ne se modifient pas d’un coup', () => {
    expect(gestesLegende([image('a', {}, 6)]).ajouter).toBe(false)
    expect(gestesLegende([image('a', { legende: 'x' }), image('b')])).toEqual({ ajouter: true, modifier: false, retirer: true })
  })

  it('montre l’invite des images qui n’en ont pas, et retire texte et invite d’un seul pas', () => {
    const ops = afficherLegendes([image('a'), image('b', { legende: 'x' })])
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ id: 'a', apres: { legendeAffichee: true } })
    const sans = retirerLegendes([image('a', { legende: 'x', legendeAffichee: true }), image('b')])
    expect(sans).toHaveLength(1)
    expect(sans[0]!.type === 'contenu' && sans[0]!.apres).not.toHaveProperty('legende')
    expect(sans[0]!.type === 'contenu' && sans[0]!.apres).not.toHaveProperty('legendeAffichee')
  })
})

describe('la légende au clic droit d’une image', () => {
  it('« Ajouter une légende » la montre et l’ouvre à l’écriture', () => {
    const el = image('a')
    const c = contexte([el])
    expect(visibles([el], c)).toContain(t('image.ajouterLegende'))
    entree('image.ajouterLegende')!.faire([el], c)
    expect((c.magasin.lire().elements[0]!.contenu as Image).legendeAffichee).toBe(true)
    expect(c.commencerEdition).toHaveBeenCalledWith('a')
  })

  it('« Modifier la légende » et « Retirer la légende » quand elle existe', () => {
    const el = image('a', { legende: 'Un port' })
    const c = contexte([el])
    const libelles = visibles([el], c)
    expect(libelles).toContain(t('image.modifierLegende'))
    expect(libelles).toContain(t('image.retirerLegende'))
    expect(libelles).not.toContain(t('image.ajouterLegende'))
    entree('image.modifierLegende')!.faire([el], c)
    expect(c.commencerEdition).toHaveBeenCalledWith('a')
    entree('image.retirerLegende')!.faire([el], c)
    // L'écriture en cours se referme d'abord : son brouillon ne la ferait pas revenir.
    expect(c.finirEdition).toHaveBeenCalled()
    expect((c.magasin.lire().elements[0]!.contenu as Image).legende).toBeUndefined()
  })

  it('pour plusieurs images, ajouter ou retirer pour toutes ; rien en lecture seule', () => {
    const els = [image('a'), image('b', { legende: 'x' })]
    const c = contexte(els)
    const libelles = visibles(els, c)
    expect(libelles).toContain(t('image.ajouterLegendes'))
    expect(libelles).toContain(t('image.retirerLegendes'))
    expect(libelles).not.toContain(t('image.modifierLegende'))
    entree('image.retirerLegendes')!.faire(els, c)
    expect(c.magasin.lire().elements.every((e) => !(e.contenu as Image).legende)).toBe(true)
    const lecture = contexte(els, true)
    expect(visibles(els, lecture).filter((l) => /gende/.test(l))).toEqual([])
  })

  it('a sa tuile dans la barre : le tiroir « ••• » ne la répète pas, le clic droit et la feuille la montrent', () => {
    for (const cle of ['image.ajouterLegende', 'image.ajouterLegendes', 'image.modifierLegende', 'image.retirerLegende', 'image.retirerLegendes']) {
      expect(entree(cle)?.tuile, cle).toBe(true)
    }
  })
})
