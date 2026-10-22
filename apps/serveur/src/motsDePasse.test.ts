import { describe, expect, it } from 'vitest'
import { hacher, verifier } from './motsDePasse.ts'

describe('mots de passe', () => {
  it('hache en argon2id, avec un sel différent à chaque fois', async () => {
    const a = await hacher('un mot de passe')
    const b = await hacher('un mot de passe')
    expect(a.startsWith('$argon2id$')).toBe(true)
    expect(a).not.toBe(b)
  })
  it('vérifie le bon mot de passe et refuse les autres', async () => {
    const h = await hacher('un mot de passe')
    expect(await verifier(h, 'un mot de passe')).toBe(true)
    expect(await verifier(h, 'un autre')).toBe(false)
  })
  it('une empreinte illisible ne passe pas', async () => {
    expect(await verifier('pas une empreinte', 'x')).toBe(false)
  })
})
