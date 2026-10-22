import { describe, expect, it } from 'vitest'
import { cookieSession, empreinteDe, lireCookie, nouveauJeton } from './sessions.ts'

describe('lireCookie', () => {
  it('trouve le cookie parmi d’autres', () => {
    expect(lireCookie('a=1; notak_session=abc123; b=2', 'notak_session')).toBe('abc123')
  })
  it('rend null sans en-tête ou sans ce cookie', () => {
    expect(lireCookie(null, 'notak_session')).toBeNull()
    expect(lireCookie('a=1', 'notak_session')).toBeNull()
    expect(lireCookie('xnotak_session=1', 'notak_session')).toBeNull()
  })
  it('garde un « = » dans la valeur et ignore une valeur illisible', () => {
    expect(lireCookie('notak_session=a=b', 'notak_session')).toBe('a=b')
    expect(lireCookie('notak_session=%E0%A4%A', 'notak_session')).toBeNull()
  })
})

describe('jetons', () => {
  it('32 octets aléatoires, dont seule l’empreinte est gardée', () => {
    const a = nouveauJeton()
    const b = nouveauJeton()
    expect(Buffer.from(a.jeton, 'base64url')).toHaveLength(32)
    expect(a.jeton).not.toBe(b.jeton)
    expect(a.empreinte).toBe(empreinteDe(a.jeton))
    expect(a.empreinte).not.toContain(a.jeton)
  })
  it('le cookie est HttpOnly, Lax, valable 30 jours', () => {
    const c = cookieSession('xyz', false)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Path=/')
    expect(c).toContain('Max-Age=2592000')
    expect(c).not.toContain('Secure')
    expect(cookieSession('xyz', true)).toContain('Secure')
  })
})
