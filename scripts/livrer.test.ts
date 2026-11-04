import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { identifiants, identiteInstalleur, jeton, numeroDeBuild } from './livrer.ts'

describe('la clé App Store Connect', () => {
  it('vient de l’environnement, sinon du fichier, sinon manque', () => {
    expect(identifiants({ APPLE_API_KEY: ' K1 ', APPLE_API_ISSUER: 'E1' }, null, '/m')).toEqual({ cle: 'K1', emetteur: 'E1', chemin: '/m/.appstoreconnect/private_keys/AuthKey_K1.p8' })
    expect(identifiants({}, JSON.stringify({ cle: 'K2', emetteur: 'E2' }), '/m')?.cle).toBe('K2')
    expect(identifiants({ APPLE_API_KEY_PATH: '/ailleurs.p8' }, JSON.stringify({ cle: 'K2', emetteur: 'E2' }), '/m')?.chemin).toBe('/ailleurs.p8')
    expect(identifiants({}, 'pas du json', '/m')).toBeNull()
    expect(identifiants({ APPLE_API_KEY: 'K' }, null, '/m')).toBeNull()
  })
})

describe('le numéro de build', () => {
  it('est l’heure UTC, AAAAMMJJHHMM, et ne fait que croître', () => {
    expect(numeroDeBuild(new Date(Date.UTC(2026, 10, 4, 9, 5)))).toBe('202611040905')
    expect(Number(numeroDeBuild(new Date(Date.UTC(2027, 0, 1))))).toBeGreaterThan(Number(numeroDeBuild(new Date(Date.UTC(2026, 11, 31, 23, 59)))))
  })
})

describe('le certificat de l’installeur du Mac', () => {
  it('se lit dans security find-identity, pour l’équipe seulement', () => {
    const sortie = `  1) AAA "Apple Distribution: Silak (2MLG399MFA)"
  2) BBB "3rd Party Mac Developer Installer: Silak (2MLG399MFA)"
  3) CCC "Mac Installer Distribution: Autre (XXXXXXXXXX)"`
    expect(identiteInstalleur(sortie)).toBe('3rd Party Mac Developer Installer: Silak (2MLG399MFA)')
    expect(identiteInstalleur(sortie, 'XXXXXXXXXX')).toBe('Mac Installer Distribution: Autre (XXXXXXXXXX)')
    expect(identiteInstalleur('  1) AAA "Apple Distribution: Silak (2MLG399MFA)"')).toBeNull()
  })
})

describe('le jeton', () => {
  it('est un JWT ES256 de vingt minutes, que vérifie la clé publique', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const j = jeton({ cle: 'K', emetteur: 'E', chemin: '' }, pem, 1_000_000_000)
    const [tete, corps, signature] = j.split('.')
    expect(JSON.parse(Buffer.from(tete, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'K', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(corps, 'base64url').toString())).toEqual({ iss: 'E', iat: 1_000_000, exp: 1_001_200, aud: 'appstoreconnect-v1' })
    expect(verify('sha256', Buffer.from(`${tete}.${corps}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true)
  })
})
