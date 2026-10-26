import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { avecNotes, avecVersion, suit } from './nouvelle-version'

describe('le numéro de la version suivante', () => {
  it('doit venir après', () => {
    expect(suit('0.2.0', '0.1.0')).toBe(true)
    expect(suit('0.10.0', '0.9.9')).toBe(true)
    expect(suit('1.0.0', '0.99.99')).toBe(true)
    expect(suit('0.1.0', '0.1.0')).toBe(false)
    expect(suit('0.1.0', '0.2.0')).toBe(false)
  })

  it('se pose à sa place dans chaque fichier, sans rien toucher d’autre', () => {
    const conf = '{\n  "productName": "Notak",\n  "version": "0.1.0",\n  "identifier": "app.notak.bureau",\n  "plugins": { "x": { "version": "9" } }\n}\n'
    expect(avecVersion('conf', conf, '0.2.0')).toBe(conf.replace('"version": "0.1.0"', '"version": "0.2.0"'))
    const cargo = '[package]\nname = "notak-bureau"\nversion = "0.1.0"\n\n[dependencies]\ntauri = { version = "2" }\n'
    expect(avecVersion('cargo', cargo, '0.2.0')).toBe(cargo.replace('version = "0.1.0"', 'version = "0.2.0"'))
    const verrou = '[[package]]\nname = "notak-bureau"\nversion = "0.1.0"\n\n[[package]]\nname = "tauri"\nversion = "2.12.5"\n'
    expect(avecVersion('verrou', verrou, '0.2.0')).toBe(verrou.replace('0.1.0', '0.2.0'))
    expect(() => avecVersion('verrou', 'rien', '0.2.0')).toThrow()
  })

  it('le même numéro pour la toile : son package.json et VERSION_NOTAK', () => {
    const paquet = '{\n  "name": "@notak/tableau",\n  "version": "0.1.0",\n  "dependencies": {\n    "animejs": "4.5.0"\n  }\n}\n'
    expect(avecVersion('paquet', paquet, '0.2.0')).toBe(paquet.replace('"version": "0.1.0"', '"version": "0.2.0"'))
    const ts = "/** La version de Notak. */\nexport const VERSION_NOTAK = '0.1.0'\n"
    expect(avecVersion('tableau', ts, '0.2.0')).toBe("/** La version de Notak. */\nexport const VERSION_NOTAK = '0.2.0'\n")
    expect(() => avecVersion('tableau', 'export const AUTRE = "0.1.0"', '0.2.0')).toThrow()
  })

  it('les vrais fichiers du dépôt ont tous un numéro à remplacer, et le même', () => {
    const racine = new URL('..', import.meta.url).pathname
    const lus = {
      conf: 'apps/bureau/src-tauri/tauri.conf.json',
      cargo: 'apps/bureau/src-tauri/Cargo.toml',
      verrou: 'apps/bureau/src-tauri/Cargo.lock',
      paquet: 'packages/tableau/package.json',
      tableau: 'packages/tableau/src/version.ts',
    } as const
    const actuelle = (JSON.parse(readFileSync(join(racine, lus.conf), 'utf8')) as { version: string }).version
    for (const [fichier, chemin] of Object.entries(lus) as [keyof typeof lus, string][]) {
      const texte = readFileSync(join(racine, chemin), 'utf8')
      const apres = avecVersion(fichier, texte, '99.0.0')
      expect(apres, chemin).toContain('99.0.0')
      // Rien d'autre ne bouge : remettre l'ancien numéro rend le fichier tel quel.
      expect(avecVersion(fichier, apres, actuelle), chemin).toBe(texte)
    }
  })
})

describe('les notes de la version', () => {
  it('« À venir » prend le numéro et la date, et repart vide en tête', () => {
    const { md, notes } = avecNotes('# Nouveautés\n\n## À venir\n\n- Une chose.\n\n## 0.1.0 — 01/09/2026\n\n- Première.\n', '0.2.0', '25/10/2026', '- commits')
    expect(notes).toBe('- Une chose.')
    expect(md).toBe('# Nouveautés\n\n## À venir\n\n## 0.2.0 — 25/10/2026\n\n- Une chose.\n\n## 0.1.0 — 01/09/2026\n\n- Première.\n')
  })

  it('sans notes écrites, les commits depuis la version d’avant', () => {
    const { md, notes } = avecNotes('# Nouveautés\n\n## À venir\n\n## 0.1.0 — 01/09/2026\n\n- Première.\n', '0.2.0', '25/10/2026', '- Toile : un geste')
    expect(notes).toBe('- Toile : un geste')
    expect(md).toContain('## 0.2.0 — 25/10/2026\n\n- Toile : un geste\n\n## 0.1.0')
  })

  it('refuse une version déjà décrite', () => {
    expect(() => avecNotes('## À venir\n\n## 0.2.0 — x\n', '0.2.0', 'd', '')).toThrow()
  })
})
