// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demanderAMontrer, filDemande, montrerDemande } from '@notak/tableau'
import type { GenreNotification, Notification } from './api'
import { elementDuFilDemande, suivreNotification } from './Cloche'

const notification = (genre: GenreNotification, element: string, fil?: string): Notification => ({
  id: 1,
  genre,
  tableau: 'tableau-voyage',
  titreTableau: 'Voyage',
  element,
  ...(fil !== undefined ? { fil } : {}),
  extrait: 'Et le dimanche ?',
  instant: 0,
  lu: false,
  auteur: { id: 'bob', nom: 'Bob', couleur: '#336699' },
})

afterEach(() => demanderAMontrer(null))

describe('où mène une notification', () => {
  it('un commentaire ou une mention mènent à leur fil, sur leur tableau', () => {
    const ouvrir = vi.fn()
    suivreNotification(notification('mention', 'doc', 'f1'), ouvrir)
    expect(ouvrir).toHaveBeenCalledWith('tableau-voyage')
    expect(montrerDemande()).toBe('doc')
    expect(filDemande('doc')).toBe('f1')
    // Le fil de l'élément même, ou celui que nomme un serveur d'avant, qui n'en disait rien : celui de l'élément.
    suivreNotification(notification('commentaire', 'epingle'), ouvrir)
    expect(filDemande('epingle')).toBe('')
  })

  it('une modification ou un partage ouvrent leur tableau, sans rien viser dedans', () => {
    const ouvrir = vi.fn()
    suivreNotification(notification('modification', 'note'), ouvrir)
    suivreNotification(notification('partage', ''), ouvrir)
    expect(ouvrir).toHaveBeenCalledTimes(2)
    expect(montrerDemande()).toBeNull()
  })

  it('un dossier, qui s’ouvre en liste, reçoit la page dont on suit le fil ; rien d’autre', () => {
    suivreNotification(notification('commentaire', 'page', 'f1'), () => {})
    expect(elementDuFilDemande()).toBe('page')
    // « Afficher dans sa toile », la recherche : une demande de montrer sans fil ne passe pas par là.
    demanderAMontrer('note')
    expect(elementDuFilDemande()).toBeNull()
  })
})
