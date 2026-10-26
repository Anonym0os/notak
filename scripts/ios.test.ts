import { describe, expect, it } from 'vitest'
import { equipeApple, manques } from './ios.ts'

describe('l’équipe Apple', () => {
  it('vient de l’environnement, sinon de tauri.ios.conf.json, sinon manque', () => {
    expect(equipeApple({ APPLE_DEVELOPMENT_TEAM: ' ABC123 ' }, '{}')).toBe('ABC123')
    expect(equipeApple({}, JSON.stringify({ bundle: { iOS: { developmentTeam: 'DEF456' } } }))).toBe('DEF456')
    expect(equipeApple({}, JSON.stringify({ bundle: { iOS: { developmentTeam: '' } } }))).toBeNull()
    expect(equipeApple({}, 'pas du json')).toBeNull()
  })
})

describe('ce qui manque', () => {
  it('rien sur un Mac équipé ; sinon, chaque chose nommée', () => {
    expect(manques({ plateforme: 'darwin', xcode: true, equipe: 'ABC' })).toEqual([])
    const m = manques({ plateforme: 'linux', xcode: false, equipe: null })
    expect(m).toHaveLength(3)
    expect(m[0]).toMatch(/un Mac/)
  })
})
