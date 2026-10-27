import { describe, expect, it } from 'vitest'
import { annonce, empreintes, notesDe, paquets, versionSignee } from './publication'

const NOUVEAUTES = `# Nouveautés

## À venir

## 0.2.0 — 25/10/2026

- L'app se met à jour toute seule.
- Les liens s'ouvrent dans le navigateur.

## 0.1.0 — 01/09/2026

- Première version.
`

describe('les notes d’une version', () => {
  it('sa section, sans son titre ni la suivante', () => {
    expect(notesDe(NOUVEAUTES, '0.2.0')).toBe("- L'app se met à jour toute seule.\n- Les liens s'ouvrent dans le navigateur.")
    expect(notesDe(NOUVEAUTES, '0.1.0')).toBe('- Première version.')
  })
  it('rien pour une version absente, ou une section vide', () => {
    expect(notesDe(NOUVEAUTES, '0.3.0')).toBeNull()
    expect(notesDe(NOUVEAUTES, '0.2')).toBeNull()
    expect(notesDe('## 0.4.0\n\n## 0.3.0\n- x', '0.4.0')).toBeNull()
  })
})

describe('les paquets d’une plateforme', () => {
  it('prennent un nom stable, avec leur signature', () => {
    const p = paquets({ dmg: ['Notak_0.2.0_aarch64.dmg'], macos: ['Notak.app', 'Notak.app.tar.gz', 'Notak.app.tar.gz.sig'] }, 'macos-aarch64', '0.2.0')
    expect(p).toEqual([
      { source: 'dmg/Notak_0.2.0_aarch64.dmg', nom: 'Notak_0.2.0_macos_aarch64.dmg' },
      { source: 'macos/Notak.app.tar.gz', nom: 'Notak_0.2.0_macos_aarch64.app.tar.gz' },
      { source: 'macos/Notak.app.tar.gz.sig', nom: 'Notak_0.2.0_macos_aarch64.app.tar.gz.sig' },
    ])
  })
  it('un paquet d’une autre version, resté d’une construction d’avant, n’est jamais pris', () => {
    const p = paquets(
      { appimage: ['Notak_0.2.0_amd64.AppImage', 'Notak_0.2.0_amd64.AppImage.sig'], deb: ['Notak_0.1.0_amd64.deb', 'Notak_0.1.0_amd64.deb.sig'], rpm: ['Notak-0.2.0-1.x86_64.rpm'] },
      'linux-x86_64',
      '0.2.0',
    )
    expect(p.map((x) => x.source)).toEqual(['appimage/Notak_0.2.0_amd64.AppImage', 'appimage/Notak_0.2.0_amd64.AppImage.sig', 'rpm/Notak-0.2.0-1.x86_64.rpm'])
    // 0.2.0 n'est pas 0.2.01 ni 10.2.0.
    expect(paquets({ nsis: ['Notak_10.2.0_x64-setup.exe'] }, 'windows-x86_64', '0.2.0')).toEqual([])
  })

  it('refusent l’ambiguïté : deux paquets de la même sorte', () => {
    expect(() => paquets({ macos: ['Notak.app.tar.gz', 'Autre.app.tar.gz'] }, 'macos-aarch64', '0.2.0')).toThrow(/Plusieurs/)
  })
})

describe('latest.json', () => {
  const v = '0.2.0'
  const tous = [
    `Notak_${v}_macos_aarch64.app.tar.gz`,
    `Notak_${v}_macos_x86_64.app.tar.gz`,
    `Notak_${v}_linux_x86_64.AppImage`,
    `Notak_${v}_windows_x64-setup.exe`,
    `Notak_${v}_windows_x64.msi`,
    `Notak_${v}_linux_amd64.deb`,
  ]
  const signes = (noms: string[]) => [...noms, ...noms.map((n) => `${n}.sig`)]
  /** Un `.sig` comme l'écrit Tauri : le fichier de minisign en base64, avec son commentaire de confiance. */
  const sig = (commentaire: string) =>
    Buffer.from(`untrusted comment: signature from tauri secret key\nRUQ=\ntrusted comment: ${commentaire}\nAAAA==`).toString('base64') + '\n'
  const signee = (nom: string) => sig(`timestamp:1791649051\tfile:${nom.replace(/\.sig$/, '')}\tversion:${v}`)
  const faire = (noms: string[], signature: (nom: string) => string = signee) =>
    annonce({
      version: v,
      notes: '- Du neuf.',
      date: new Date('2026-10-25T20:00:00.123Z'),
      noms,
      signature,
      adresse: (nom) => `https://github.com/Anonym0os/notak/releases/download/v${v}/${nom}`,
    })

  it('une entrée par plateforme et par sorte d’installation, avec sa signature et son adresse', () => {
    const a = faire(signes(tous))
    expect(a.version).toBe('0.2.0')
    expect(a.pub_date).toBe('2026-10-25T20:00:00Z')
    expect(Object.keys(a.platforms).sort()).toEqual(
      [
        'darwin-aarch64',
        'darwin-aarch64-app',
        'darwin-x86_64',
        'darwin-x86_64-app',
        'linux-x86_64',
        'linux-x86_64-appimage',
        'linux-x86_64-deb',
        'windows-x86_64',
        'windows-x86_64-msi',
        'windows-x86_64-nsis',
      ].sort(),
    )
    expect(a.platforms['darwin-aarch64']).toEqual({
      signature: signee(`Notak_${v}_macos_aarch64.app.tar.gz.sig`).trim(),
      url: `https://github.com/Anonym0os/notak/releases/download/v${v}/Notak_${v}_macos_aarch64.app.tar.gz`,
    })
    expect(a.platforms['windows-x86_64']!.url).toContain('x64-setup.exe')
  })

  it('ne s’écrit pas s’il manque une plateforme : une version à moitié publiée ne se propose à personne', () => {
    expect(() => faire(signes(tous.filter((n) => !n.includes('macos_x86_64'))))).toThrow(/darwin-x86_64/)
  })

  it('ne s’écrit pas si un paquet de mise à jour n’a pas sa signature', () => {
    expect(() => faire([...signes(tous.slice(1)), tous[0]!])).toThrow(/signature/)
  })

  it('ne s’écrit pas si une signature ne porte pas ce numéro : chaque app la refuserait (requireSignedVersion)', () => {
    const macos = `Notak_${v}_macos_aarch64.app.tar.gz.sig`
    // Sans numéro (une CLI qui ne l'écrit pas), ou celui d'une autre version.
    expect(() => faire(signes(tous), (nom) => (nom === macos ? sig(`timestamp:1791649051\tfile:Notak.app.tar.gz`) : signee(nom)))).toThrow(
      /macos_aarch64.*ne porte pas de numéro/,
    )
    expect(() => faire(signes(tous), (nom) => (nom === macos ? sig(`timestamp:1791649051\tversion:0.1.9`) : signee(nom)))).toThrow(/signé pour 0\.1\.9, pas pour 0\.2\.0/)
    // Un paquet facultatif aussi : son app le refuserait tout autant.
    const msi = `Notak_${v}_windows_x64.msi.sig`
    expect(() => faire(signes(tous), (nom) => (nom === msi ? sig('timestamp:1791649051\tversion:0.2.01') : signee(nom)))).toThrow(/msi/)
  })

  it('le numéro signé se lit comme le lit l’app', () => {
    expect(versionSignee(sig('timestamp:1\tfile:a.tar.gz\tversion:0.2.0'))).toBe('0.2.0')
    // Le commentaire qui ne fait pas foi (« untrusted ») ne compte pas.
    expect(versionSignee(Buffer.from('untrusted comment: version:0.2.0\nRUQ=\ntrusted comment: timestamp:1\nAAAA==').toString('base64'))).toBeNull()
    expect(versionSignee('pas du base64 de minisign')).toBeNull()
    expect(versionSignee('')).toBeNull()
  })

  it('un paquet facultatif sans signature n’est pas annoncé, sans rien bloquer', () => {
    const a = faire([...signes(tous.filter((n) => !n.endsWith('.deb'))), `Notak_${v}_linux_amd64.deb`])
    expect(a.platforms['linux-x86_64-deb']).toBeUndefined()
  })

  it('les empreintes, triées par nom, au format de shasum', () => {
    expect(empreintes([{ nom: 'b', octets: new Uint8Array() }, { nom: 'a', octets: new TextEncoder().encode('abc') }])).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  a\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  b\n',
    )
  })
})
