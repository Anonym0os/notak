import { describe, expect, it } from 'vitest'
import { disponibles, habillageActif } from './bibliotheque'
import { lireHabillage } from './format'

const h = (id: string, nom = id) => lireHabillage({ notak: 'habillage', version: 1, id, nom })

describe('les habillages disponibles', () => {
  it('met ceux du serveur d’abord, et le serveur l’emporte sur un import du même identifiant', () => {
    const liste = disponibles({ fournis: [h('silak', 'Silak (serveur)')] }, [h('silak', 'Silak (importé)'), h('nuit')])
    expect(liste.map((d) => [d.habillage.nom, d.origine])).toEqual([
      ['Silak (serveur)', 'fourni'],
      ['nuit', 'importe'],
    ])
  })
})

describe('l’habillage actif', () => {
  const liste = disponibles({ fournis: [h('silak')] }, [h('nuit')])

  it('suit l’imposé, puis le choix de l’appareil, puis le défaut du serveur', () => {
    expect(habillageActif(liste, { impose: 'silak' }, 'nuit')?.id).toBe('silak')
    expect(habillageActif(liste, { parDefaut: 'silak' }, 'nuit')?.id).toBe('nuit')
    expect(habillageActif(liste, { parDefaut: 'silak' }, undefined)?.id).toBe('silak')
  })

  it('rend celui de Notak quand on l’a choisi, même si le serveur en propose un', () => {
    expect(habillageActif(liste, { parDefaut: 'silak' }, 'notak')).toBeNull()
  })

  it('ne suit pas un choix qui ne désigne plus rien', () => {
    expect(habillageActif(liste, undefined, 'retire')).toBeNull()
    expect(habillageActif(liste, { parDefaut: 'silak' }, 'retire')?.id).toBe('silak')
    expect(habillageActif(liste, { impose: 'absent' }, 'nuit')?.id).toBe('nuit')
  })
})
