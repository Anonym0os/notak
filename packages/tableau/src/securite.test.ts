import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { urlCarteIntegree } from './elements/lieu/adresse'
import { lecteurDe } from './elements/lien/lecteurs'
import { ORIGINES_LECTEURS, entetesSecurite, politiqueContenu } from './securite'

const depot = (chemin: string) => readFileSync(new URL(`../../../${chemin}`, import.meta.url), 'utf8')

/** Une adresse publique par fournisseur : chacun doit pouvoir s'afficher dans son cadre. */
const UNE_PAR_LECTEUR = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://vimeo.com/76979871',
  'https://www.loom.com/share/0123456789abcdef0123456789abcdef',
  'https://www.dailymotion.com/video/x8abcd1',
  'https://fast.wistia.net/medias/abc123def4',
  'https://www.tiktok.com/@quelquun/video/7212345678901234567',
  'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  'https://soundcloud.com/artiste/un-morceau',
  'https://music.apple.com/fr/album/un-album/1440818839',
  'https://www.deezer.com/fr/track/3135556',
  'https://www.google.com/maps/place/Tour+Eiffel/@48.8583701,2.2944813,17z',
  'https://www.openstreetmap.org/#map=15/48.85837/2.29448',
  'https://www.figma.com/design/AbCdEf123/Maquette',
  'https://miro.com/app/board/uXjVO1234=/',
  'https://codepen.io/quelquun/pen/abcdEF',
  'https://docs.google.com/presentation/d/1AbC_dEf/edit',
]

describe('les origines permises', () => {
  it('chaque lecteur intégré vient d’une origine que la CSP laisse entrer en cadre', () => {
    for (const url of UNE_PAR_LECTEUR) {
      const l = lecteurDe(url)
      expect(l, url).not.toBeNull()
      expect(ORIGINES_LECTEURS, url).toContain(new URL(l!.src).origin)
    }
    expect(ORIGINES_LECTEURS).toContain(new URL(urlCarteIntegree({ lat: 48.85, lon: 2.29 })).origin)
  })

  it('aucune origine en trop : chacune sert un lecteur (ou la redirection de Google Maps)', () => {
    const servies = new Set(UNE_PAR_LECTEUR.map((u) => new URL(lecteurDe(u)!.src).origin))
    servies.add(new URL(urlCarteIntegree({ lat: 0, lon: 0 })).origin)
    servies.add('https://www.google.com')
    expect([...ORIGINES_LECTEURS].sort()).toEqual([...servies].sort())
  })
})

describe('politiqueContenu', () => {
  it('ne laisse partir les requêtes que vers soi et le géocodeur, jamais vers un serveur à nous', () => {
    const connexions = /connect-src ([^;]+)/.exec(politiqueContenu('site'))![1]!.split(' ')
    expect(connexions).toEqual(["'self'", 'blob:', 'data:', 'https://nominatim.openstreetmap.org'])
  })

  it('aucun script d’ailleurs, ni évalué, ni en ligne', () => {
    for (const cible of ['site', 'bureau', 'serveur'] as const) {
      const p = politiqueContenu(cible, 'https://notak.exemple.fr')
      expect(/script-src ([^;]+)/.exec(p)![1]).toBe("'self'")
      expect(p).toContain("object-src 'none'")
      expect(p).toContain("frame-ancestors 'none'")
      expect(p).not.toContain('unsafe-eval')
    }
  })

  it('la coque de bureau parle à la page par son canal, le serveur par sa synchro', () => {
    expect(politiqueContenu('bureau')).toContain('ipc: http://ipc.localhost')
    expect(politiqueContenu('site')).not.toContain('ipc:')
    expect(politiqueContenu('serveur', 'https://notak.exemple.fr:8443')).toContain('wss://notak.exemple.fr:8443')
    expect(politiqueContenu('serveur', 'http://localhost:3005')).toContain('ws://localhost:3005')
  })

  it('HSTS seulement en HTTPS', () => {
    expect(entetesSecurite('site', { https: true })['strict-transport-security']).toBeDefined()
    expect(entetesSecurite('serveur', { https: false, origineServeur: 'http://localhost:3005' })['strict-transport-security']).toBeUndefined()
  })
})

describe('chaque cible porte la même politique', () => {
  it('notak.app (nginx)', () => {
    const csp = /add_header Content-Security-Policy "([^"]+)" always;/.exec(depot('apps/site/csp.conf'))?.[1]
    expect(csp, 'la CSP de apps/site/csp.conf : à recopier de politiqueContenu("site")').toBe(politiqueContenu('site'))
    const entetes = depot('apps/site/entetes.conf')
    for (const [nom, valeur] of Object.entries(entetesSecurite('site', { https: true }))) {
      if (nom === 'content-security-policy') continue
      expect(entetes, nom).toContain(`add_header ${nom} "${valeur}" always;`)
    }
    // nginx oublie les `add_header` du niveau du dessus dès qu'un `location` en pose un : chacun les reprend.
    const conf = depot('apps/site/nginx.conf')
    const blocs = conf.split(/\n\s*location /).slice(1)
    expect(blocs.length).toBeGreaterThan(0)
    for (const b of blocs) expect(b, `location ${b.split('\n')[0]}`).toContain('include /etc/nginx/notak/entetes.conf;')
  })

  it('l’app de bureau (Tauri)', () => {
    const conf = JSON.parse(depot('apps/bureau/src-tauri/tauri.conf.json')) as { app: { security: { csp: string; dangerousDisableAssetCspModification: string[] } } }
    expect(conf.app.security.csp, 'la CSP de tauri.conf.json : à recopier de politiqueContenu("bureau")').toBe(politiqueContenu('bureau'))
    // Tauri ajouterait ses empreintes à `style-src`, et un navigateur ignore alors `'unsafe-inline'` : plus aucun style posé par l'éditeur.
    expect(conf.app.security.dangerousDisableAssetCspModification).toEqual(['style-src'])
  })
})
