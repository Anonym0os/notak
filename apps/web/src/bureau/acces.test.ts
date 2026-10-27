import { definirLangue, textesEn, textesFr } from '@notak/tableau'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Acces } from '../bureau'
import { type Echec, concerneAdresse, decidePorte, echecDe, hoteDe, hoteSaisi, serveurMuet, texteErreur } from './acces'

afterEach(() => {
  definirLangue('fr')
  vi.restoreAllMocks()
})

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

  it('« ?ici » (un coup d’œil depuis un serveur) : les toiles d’ici, même avec un serveur à ouvrir', () => {
    expect(decidePorte(acces({ ouvrir: 'serveur', serveur: SERVEUR }), '?ici')).toBe('local')
    expect(decidePorte(acces({ ouvrir: 'serveur', serveur: SERVEUR }), '?x=1&ici')).toBe('local')
    expect(decidePorte(null, '?ici')).toBe('local')
    // L'écran d'accès l'emporte : ni l'un ni l'autre ne connecte.
    expect(decidePorte(acces({ ouvrir: 'serveur', serveur: SERVEUR }), '?ici&acces')).toBe('ecran')
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
  const CODES = ['adresse_invalide', 'https_requis', 'chemin', 'injoignable', 'certificat', 'delai', 'pas_notak', 'trop_ancien', 'mal_regle'] as const
  const AUTRES = ['type_refuse', 'trop_gros', 'trop_vite', 'introuvable', 'illisible', 'interdit', 'file_pleine', 'annule'] as const

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
    for (const code of [...CODES, 'muette', 'interdit', 'file_pleine'] as const) expect(textesFr[`bureau.erreur.${code}`], code).toBeTruthy()
    for (const code of [...CODES, 'muette', 'interdit', 'file_pleine'] as const) expect(textesEn[`bureau.erreur.${code}`], code).toBeTruthy()
    expect(texteErreur({ code: 'https_requis' })).toContain('localhost')
    expect(texteErreur({ code: 'chemin' })).toContain('racine')
    expect(texteErreur({ code: 'certificat' })).toContain('Let’s Encrypt')
    // Un serveur d'avant `/api/sante` a été construit depuis les sources : le guide dit comment le mettre à jour, pas
    // une commande qui ne vaut que pour l'image publiée.
    expect(texteErreur({ code: 'trop_ancien' })).toContain('« Mettre à jour »')
    expect(texteErreur({ code: 'trop_ancien' })).not.toContain('docker')
    // Qui se connecte n'a pas la main sur le serveur : on lui dit à qui s'adresser.
    expect(texteErreur({ code: 'trop_ancien' })).toContain('administrateur')
    // Un serveur resté à sa valeur par défaut : la variable à régler, sans proposer d'adresse de cet ordinateur.
    expect(texteErreur({ code: 'mal_regle' })).toContain('NOTAK_ORIGINE=https://')
    expect(texteErreur({ code: 'mal_regle' })).not.toContain('http://localhost')
    expect(texteErreur({ code: 'injoignable' })).toContain('démarré')
    expect(texteErreur({ code: 'file_pleine' })).toContain('Redémarrez')
  })

  it('un serveur qui se dit ailleurs donne son adresse ; un serveur muet son nom', () => {
    expect(texteErreur({ code: 'redirige', vers: 'https://notak.exemple.fr' })).toBe('Ce serveur se trouve à https://notak.exemple.fr.')
    expect(texteErreur({ code: 'muette' }, 'notak.exemple.fr')).toContain('notak.exemple.fr n’a pas répondu')
  })

  it('une erreur qui n’est pas un refus de la coque se dit comme un échec, son détail dans la console seulement', () => {
    const console_ = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pannes = [new Error('boum'), 'Command joindre_serveur not found', null, undefined, { code: 'inconnu' }, { code: 'redirige' }, { code: 'echec', message: 'Permission denied (os error 13)' }]
    for (const e of pannes) {
      const echec = echecDe(e)
      expect(echec).toEqual({ code: 'echec', message: '' })
      expect(texteErreur(echec)).toBe(textesFr['bureau.erreur.echec'])
    }
    expect(console_).toHaveBeenCalledTimes(pannes.length)
    expect(console_).toHaveBeenLastCalledWith('Notak :', { code: 'echec', message: 'Permission denied (os error 13)' })
    expect(echecDe({ code: 'certificat' })).toEqual({ code: 'certificat' })
    expect(console_).toHaveBeenCalledTimes(pannes.length)
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

describe('le lieu, dans les mots', () => {
  it('sur un iPhone, chaque texte qui nomme l’ordinateur a sa variante, en français et en anglais, sans lui', () => {
    const cles = [
      'bureau.acces.deuxLieux',
      'bureau.acces.local',
      'bureau.acces.localAide',
      'bureau.acces.oublierConfirme',
      'bureau.porte.ouvrirLocal',
      'serveur.connexion.local',
      'serveur.compte.toilesLocales',
    ]
    for (const cle of cles) {
      const variante = `${cle}.appareil`
      expect(textesFr[variante], cle).toBeTruthy()
      expect(textesEn[variante], cle).toBeTruthy()
      expect(textesFr[variante], cle).not.toMatch(/ordinateur/)
      expect(textesEn[variante], cle).not.toMatch(/computer/)
    }
  })
})
