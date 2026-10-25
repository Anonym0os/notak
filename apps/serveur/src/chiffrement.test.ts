import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ouvrirBase } from './base.ts'
import { type Cle, ErreurChiffrement, chiffrer, cleDepuisTexte, dechiffrer, duDisque, estChiffre, lireCle, pourLeDisque } from './chiffrement.ts'
import { chiffrerTout } from './chiffrerTout.ts'

const nouvelleCle = (): Cle => ({ id: 1, secret: randomBytes(32) })
const octets = (texte: string) => new TextEncoder().encode(texte)
const contient = (meule: Uint8Array, aiguille: string) => Buffer.from(meule).includes(Buffer.from(aiguille))

const dossiers: string[] = []
const dossierNeuf = () => {
  const d = mkdtempSync(join(tmpdir(), 'notak-chiffrement-'))
  dossiers.push(d)
  return d
}
afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('l’enveloppe', () => {
  it('aller-retour : ce qu’on chiffre se relit à l’identique, et n’apparaît plus en clair', () => {
    const cle = nouvelleCle()
    const donnees = octets('Pamplemousses et clémentines')
    const enveloppe = chiffrer(cle, donnees)
    expect(enveloppe.subarray(0, 4).toString('ascii')).toBe('NKC1')
    expect(enveloppe[4]).toBe(1)
    expect(enveloppe.length).toBe(5 + 12 + 16 + donnees.length)
    expect(contient(enveloppe, 'Pamplemousses')).toBe(false)
    expect(estChiffre(enveloppe)).toBe(true)
    expect(new Uint8Array(dechiffrer(cle, enveloppe))).toEqual(donnees)
    // Un nonce neuf à chaque fois : la même donnée ne se chiffre jamais deux fois pareil.
    expect(chiffrer(cle, donnees).equals(enveloppe)).toBe(false)
  })

  it('une donnée vide fait aussi l’aller-retour', () => {
    const cle = nouvelleCle()
    expect(dechiffrer(cle, chiffrer(cle, new Uint8Array())).length).toBe(0)
  })

  it('clé fausse : refus', () => {
    const enveloppe = chiffrer(nouvelleCle(), octets('secret'))
    expect(() => dechiffrer(nouvelleCle(), enveloppe)).toThrow(ErreurChiffrement)
  })

  it('une autre clé désignée par son numéro : refus, sans même essayer', () => {
    const cle = nouvelleCle()
    expect(() => dechiffrer({ ...cle, id: 2 }, chiffrer(cle, octets('secret')))).toThrow(/clé n° 1/)
  })

  it('un octet changé, dans les données ou dans l’en-tête : refus', () => {
    const cle = nouvelleCle()
    const enveloppe = chiffrer(cle, octets('secret'))
    const abimee = Buffer.from(enveloppe)
    abimee[abimee.length - 1]! ^= 1
    expect(() => dechiffrer(cle, abimee)).toThrow(ErreurChiffrement)
    expect(() => dechiffrer(cle, enveloppe.subarray(0, 20))).toThrow(ErreurChiffrement)
  })

  it('ancien format en clair : lu tel quel, avec ou sans clé', () => {
    const clair = octets('écrit avant le chiffrement')
    expect(estChiffre(clair)).toBe(false)
    expect(new Uint8Array(duDisque(nouvelleCle(), clair))).toEqual(clair)
    expect(new Uint8Array(duDisque(null, clair))).toEqual(clair)
  })

  it('sans clé, rien ne change à l’écriture, et une donnée chiffrée ne se lit pas', () => {
    const donnees = octets('tel quel')
    expect(pourLeDisque(null, donnees)).toBe(donnees)
    expect(() => duDisque(null, chiffrer(nouvelleCle(), donnees))).toThrow(/aucune clé/)
  })
})

describe('la clé', () => {
  const texte = randomBytes(32).toString('base64')

  it('se lit dans NOTAK_CLE ou dans le fichier de NOTAK_CLE_FICHIER', () => {
    expect(lireCle({})).toBeNull()
    expect(lireCle({ cle: texte })?.secret.toString('base64')).toBe(texte)
    const fichier = join(dossierNeuf(), 'cle')
    writeFileSync(fichier, `${texte}\n`)
    expect(lireCle({ fichier })?.secret.toString('base64')).toBe(texte)
  })

  it('refuse une clé qui ne fait pas 32 octets, un fichier absent, ou les deux variables à la fois', () => {
    expect(() => cleDepuisTexte(randomBytes(16).toString('base64'))).toThrow(ErreurChiffrement)
    expect(() => cleDepuisTexte('pas du base64 du tout, mais assez long pour tromper')).toThrow(ErreurChiffrement)
    expect(() => lireCle({ fichier: join(dossierNeuf(), 'absent') })).toThrow(/ne se lit pas/)
    expect(() => lireCle({ cle: texte, fichier: '/tmp/cle' })).toThrow(/toutes les deux/)
  })
})

describe('la base chiffrée', () => {
  it('l’état des documents est chiffré sur le disque et se relit', () => {
    const cle = nouvelleCle()
    const chemin = join(dossierNeuf(), 'notak.db')
    const base = ouvrirBase(chemin, cle)
    base.enregistrerDocument('tableau:a', octets('Pamplemousses'))
    expect(new Uint8Array(base.document('tableau:a')!)).toEqual(octets('Pamplemousses'))
    base.fermer()

    const brut = new DatabaseSync(chemin)
    const { etat } = brut.prepare('SELECT etat FROM documents').get() as { etat: Uint8Array }
    brut.close()
    expect(estChiffre(etat)).toBe(true)
    expect(contient(etat, 'Pamplemousses')).toBe(false)
  })

  it('un document d’avant, en clair, se lit, puis repart chiffré à sa prochaine écriture', () => {
    const chemin = join(dossierNeuf(), 'notak.db')
    const avant = ouvrirBase(chemin)
    avant.enregistrerDocument('tableau:a', octets('ancien'))
    avant.fermer()

    const cle = nouvelleCle()
    const base = ouvrirBase(chemin, cle)
    expect(new Uint8Array(base.document('tableau:a')!)).toEqual(octets('ancien'))
    base.enregistrerDocument('tableau:a', octets('nouveau'))
    base.fermer()
    const brut = new DatabaseSync(chemin)
    expect(estChiffre((brut.prepare('SELECT etat FROM documents').get() as { etat: Uint8Array }).etat)).toBe(true)
    brut.close()
  })

  it('refuse de s’ouvrir avec une clé fausse, ou sans clé devant des documents chiffrés', () => {
    const chemin = join(dossierNeuf(), 'notak.db')
    const base = ouvrirBase(chemin, nouvelleCle())
    base.enregistrerDocument('tableau:a', octets('secret'))
    base.fermer()
    expect(() => ouvrirBase(chemin, nouvelleCle())).toThrow(ErreurChiffrement)
    expect(() => ouvrirBase(chemin)).toThrow(/aucune clé/)
  })

  it('une base neuve, ou toute en clair, s’ouvre avec n’importe quelle clé', () => {
    const chemin = join(dossierNeuf(), 'notak.db')
    ouvrirBase(chemin, nouvelleCle()).fermer()
    const clair = ouvrirBase(chemin)
    clair.enregistrerDocument('tableau:a', octets('clair'))
    clair.fermer()
    ouvrirBase(chemin, nouvelleCle()).fermer()
  })
})

describe('la migration de l’existant', () => {
  /** Un dossier de serveur écrit sans clé : deux documents, un fichier, une copie réduite et un provisoire abandonné. */
  const existant = () => {
    const dossier = dossierNeuf()
    const base = ouvrirBase(join(dossier, 'notak.db'))
    base.enregistrerDocument('tableau:a', octets('Pamplemousses'))
    base.enregistrerDocument('tableau:b', octets('Clémentines'))
    base.fermer()
    mkdirSync(join(dossier, 'fichiers'))
    writeFileSync(join(dossier, 'fichiers', 'f1'), 'une image')
    writeFileSync(join(dossier, 'fichiers', 'f1.400'), 'sa copie réduite')
    writeFileSync(join(dossier, 'fichiers', 'f1.400.abc.tmp'), 'abandonné')
    return dossier
  }

  it('chiffre documents et fichiers d’un coup, et le serveur les relit', () => {
    const dossier = existant()
    const cle = nouvelleCle()
    expect(chiffrerTout(dossier, cle)).toEqual({ documents: 2, fichiers: 2, dejaChiffres: 0 })

    // Plus rien en clair dans le fichier de la base, ni dans son journal.
    for (const nom of readdirSync(dossier).filter((n) => n.startsWith('notak.db'))) {
      const brut = readFileSync(join(dossier, nom))
      expect(contient(brut, 'Pamplemousses')).toBe(false)
      expect(contient(brut, 'Clémentines')).toBe(false)
    }
    for (const nom of ['f1', 'f1.400']) expect(estChiffre(readFileSync(join(dossier, 'fichiers', nom)))).toBe(true)
    expect(readFileSync(join(dossier, 'fichiers', 'f1.400.abc.tmp'), 'utf8')).toBe('abandonné')
    expect(readdirSync(join(dossier, 'fichiers')).filter((n) => n.endsWith('.tmp'))).toHaveLength(1)

    const base = ouvrirBase(join(dossier, 'notak.db'), cle)
    expect(new TextDecoder().decode(base.document('tableau:b')!)).toBe('Clémentines')
    base.fermer()
    expect(duDisque(cle, readFileSync(join(dossier, 'fichiers', 'f1'))).toString()).toBe('une image')
  })

  it('repassée, elle ne rechiffre rien', () => {
    const dossier = existant()
    const cle = nouvelleCle()
    chiffrerTout(dossier, cle)
    expect(chiffrerTout(dossier, cle)).toEqual({ documents: 0, fichiers: 0, dejaChiffres: 4 })
  })

  it('avec une autre clé que celle déjà employée : refus, la base reste comme elle était', () => {
    const dossier = existant()
    const base = ouvrirBase(join(dossier, 'notak.db'), nouvelleCle())
    base.enregistrerDocument('tableau:c', octets('chiffré par une première clé'))
    base.fermer()
    expect(() => chiffrerTout(dossier, nouvelleCle())).toThrow(/autre clé/)
    const brut = new DatabaseSync(join(dossier, 'notak.db'))
    const etats = brut.prepare("SELECT etat FROM documents WHERE nom != 'tableau:c'").all() as { etat: Uint8Array }[]
    brut.close()
    expect(etats.every((l) => !estChiffre(l.etat))).toBe(true)
  })
})
