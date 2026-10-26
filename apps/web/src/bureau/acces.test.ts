import { definirLangue, textesEn, textesFr } from '@notak/tableau'
import { afterEach, describe, expect, it } from 'vitest'
import type { Acces } from '../bureau'
import { type Echec, concerneAdresse, decidePorte, detailErreur, echecDe, hoteDe, hoteSaisi, serveurMuet, texteErreur } from './acces'

afterEach(() => definirLangue('fr'))

const acces = (o: Partial<Acces> = {}): Acces => ({ ouvrir: 'local', serveur: null, majAuto: true, version: '0.1.0', ...o })
const SERVEUR = 'https://notak.exemple.fr'

describe('la porte de l’app de bureau', () => {
  it('ouvre les toiles de cet ordinateur par défaut, avec ou sans serveur retenu', () => {
    expect(decidePorte(acces(), '')).toBe('local')
    expect(decidePorte(acces({ serveur: SERVEUR, ouvrir: 'local' }), '')).toBe('local')
  })

  it('va au serveur retenu seulement s’il doit s’ouvrir d’office', () => {
    expect(decidePorte(acces({ ouvrir: 'serveur', serveur: SERVEUR }), '')).toBe('connecter')
    // Un serveur à ouvrir sans adresse n’a rien à joindre.
    expect(decidePorte(acces({ ouvrir: 'serveur', serveur: null }), '')).toBe('local')
  })

  it('« ?acces » ouvre l’écran d’accès, même avec un serveur à ouvrir : jamais de connexion d’office', () => {
    expect(decidePorte(acces({ ouvrir: 'serveur', serveur: SERVEUR }), '?acces')).toBe('ecran')
    expect(decidePorte(acces({ ouvrir: 'serveur', serveur: SERVEUR }), '?acces&erreur=muette')).toBe('ecran')
    expect(decidePorte(acces(), '?acces')).toBe('ecran')
    expect(decidePorte(null, '?acces')).toBe('ecran')
  })

  it('une coque d’avant les serveurs (réglages illisibles) : les toiles de cet ordinateur', () => {
    expect(decidePorte(null, '')).toBe('local')
    expect(decidePorte(null, '?autre=1')).toBe('local')
  })

  it('un paramètre d’adresse ne désigne jamais un serveur : rien d’autre que « acces » ne compte', () => {
    expect(decidePorte(acces(), '?serveur=https://mechant.exemple')).toBe('local')
    expect(decidePorte(acces(), '?joindre=https://mechant.exemple&acces2')).toBe('local')
  })

  it('ne reconnaît que « muette » parmi les erreurs de l’adresse', () => {
    expect(serveurMuet('?acces&erreur=muette')).toBe(true)
    expect(serveurMuet('?erreur=muette')).toBe(true)
    expect(serveurMuet('?acces&erreur=<script>')).toBe(false)
    expect(serveurMuet('?acces')).toBe(false)
  })
})

describe('les mots des refus', () => {
  const CODES = ['adresse_invalide', 'https_requis', 'chemin', 'injoignable', 'certificat', 'delai', 'pas_notak', 'trop_ancien'] as const
  const AUTRES = ['type_refuse', 'trop_gros', 'trop_vite', 'introuvable', 'illisible', 'interdit'] as const

  /** Tous les refus que la coque sait rendre, et le silence du serveur. */
  const tous: Echec[] = [
    ...CODES.map((code) => ({ code }) as Echec),
    { code: 'redirige', vers: 'https://autre.exemple.fr' },
    { code: 'muette' },
    ...AUTRES.map((code) => ({ code }) as Echec),
    { code: 'echec', message: 'boom' },
  ]

  it('chaque code a son texte, en français comme en anglais, et jamais la clé nue', () => {
    for (const e of tous) {
      for (const langue of ['fr', 'en'] as const) {
        definirLangue(langue)
        const texte = texteErreur(e, 'notak.exemple.fr')
        expect(texte, `${e.code} (${langue})`).toBeTruthy()
        expect(texte, `${e.code} (${langue})`).not.toMatch(/^bureau\./)
        expect(texte, `${e.code} (${langue})`).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it('les codes propres à la connexion ont un texte à eux, qui dit quoi faire', () => {
    for (const code of [...CODES, 'muette', 'interdit'] as const) expect(textesFr[`bureau.erreur.${code}`], code).toBeTruthy()
    for (const code of [...CODES, 'muette', 'interdit'] as const) expect(textesEn[`bureau.erreur.${code}`], code).toBeTruthy()
    expect(texteErreur({ code: 'https_requis' })).toContain('localhost')
    expect(texteErreur({ code: 'chemin' })).toContain('racine')
    expect(texteErreur({ code: 'certificat' })).toContain('Let’s Encrypt')
    expect(texteErreur({ code: 'trop_ancien' })).toContain('docker compose pull && docker compose up -d')
    expect(texteErreur({ code: 'injoignable' })).toContain('démarré')
  })

  it('un serveur qui se dit ailleurs donne son adresse ; un serveur muet son nom', () => {
    expect(texteErreur({ code: 'redirige', vers: 'https://notak.exemple.fr' })).toBe('Ce serveur se trouve à https://notak.exemple.fr.')
    expect(texteErreur({ code: 'muette' }, 'notak.exemple.fr')).toContain('notak.exemple.fr n’a pas répondu')
  })

  it('une erreur qui n’est pas un refus de la coque se dit comme un échec, sans détail', () => {
    for (const e of [new Error('boum'), 'Command joindre_serveur not found', null, undefined, { code: 'inconnu' }, { code: 'redirige' }]) {
      const echec = echecDe(e)
      expect(echec.code).toBe('echec')
      expect(detailErreur(echec)).toBeNull()
      expect(texteErreur(echec)).toBe(textesFr['bureau.erreur.echec'])
    }
    expect(echecDe({ code: 'certificat' })).toEqual({ code: 'certificat' })
  })

  it('le détail d’un échec de la coque se lit en clair et en court', () => {
    expect(detailErreur({ code: 'echec', message: 'erreur\u0000 de   disque\n' })).toBe('erreur  de   disque')
    expect(detailErreur({ code: 'echec', message: 'x'.repeat(500) })?.length).toBe(200)
    expect(detailErreur({ code: 'injoignable' })).toBeNull()
  })

  it('seules les erreurs d’adresse se corrigent dans son champ', () => {
    expect(tous.filter(concerneAdresse).map((e) => e.code)).toEqual(['adresse_invalide', 'https_requis', 'chemin'])
  })
})

describe('les noms de serveurs', () => {
  it('l’hôte d’une origine, port compris', () => {
    expect(hoteDe('https://notak.exemple.fr')).toBe('notak.exemple.fr')
    expect(hoteDe('https://notak.exemple.fr:8443')).toBe('notak.exemple.fr:8443')
    expect(hoteDe('pas une adresse')).toBe('pas une adresse')
  })

  it('l’hôte de ce qu’on tape, avec ou sans le protocole', () => {
    expect(hoteSaisi('notak.exemple.fr')).toBe('notak.exemple.fr')
    expect(hoteSaisi('  https://notak.exemple.fr/ ')).toBe('notak.exemple.fr')
    expect(hoteSaisi('http://localhost:3005')).toBe('localhost:3005')
  })
})
