// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demanderAMontrer, filDemande, montrerDemande } from '@notak/tableau'
import type { GenreNotification, Notification } from './api'
import { elementDuFilDemande, suivreNotification, texteDe } from './Cloche'

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

  it('une réaction mène au fil du message, comme un commentaire', () => {
    const ouvrir = vi.fn()
    suivreNotification(notification('reaction', 'carte', 's1'), ouvrir)
    expect(ouvrir).toHaveBeenCalledWith('tableau-voyage')
    expect(filDemande('carte')).toBe('s1')
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

describe('ce que dit une notification', () => {
  it('une réaction dit qui a réagi, de quels émojis, à votre commentaire, et dans quel tableau', () => {
    expect(texteDe({ ...notification('reaction', 'epingle'), emojis: ['👍', '🎉'] })).toBe('Bob a réagi 👍 🎉 à votre commentaire dans « Voyage »')
  })

  it('un genre que l’app ne sait pas dire, d’un serveur plus récent, ne se montre pas', () => {
    expect(texteDe({ ...notification('commentaire', 'note'), genre: 'echeance' as GenreNotification })).toBeNull()
    expect(texteDe(notification('commentaire', 'note'))).toBe('Bob a commenté dans « Voyage »')
  })
})
