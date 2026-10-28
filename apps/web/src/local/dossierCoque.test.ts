// @vitest-environment jsdom
import { ErreurDossier } from '@notak/tableau'
import { verifierContrat } from '@notak/tableau/essais/contrat'
import { afterEach, describe, expect, it } from 'vitest'
import { dossierCoque } from './dossierCoque'

/**
 * Une fausse coque qui répond comme `apps/bureau/src-tauri/src/nuage.rs` : des fichiers en mémoire, les erreurs en
 * `{ code }`, le chemin d'une écriture dans l'en-tête `x-notak-chemin`. Les fichiers eux-mêmes sont essayés côté Rust.
 */
function fausseCoque() {
  const fichiers = new Map<string, Uint8Array>()
  const fantomes = new Set<string>()
  const echecs: { code: string }[] = []
  const net = (c: string) => c.split('/').filter(Boolean).join('/')
  const invoke = async (commande: string, a?: unknown, o?: { headers?: Record<string, string> }) => {
    const echec = echecs.shift()
    if (echec) throw echec
    const chemin = net((a as { chemin?: string } | undefined)?.chemin ?? '')
    switch (commande) {
      case 'nuage_lister': {
        const entrees = new Map<string, { nom: string; genre: string; taille?: number; fantome?: boolean }>()
        for (const [c, o] of fichiers) {
          const reste = chemin ? (c.startsWith(`${chemin}/`) ? c.slice(chemin.length + 1) : null) : c
          if (!reste) continue
          const [nom, ...plus] = reste.split('/')
          entrees.set(nom!, plus.length ? { nom: nom!, genre: 'dossier' } : { nom: nom!, genre: 'fichier', taille: o.length })
        }
        for (const c of fantomes) if (c.startsWith(`${chemin}/`)) entrees.set(c.slice(chemin.length + 1), { nom: c.slice(chemin.length + 1), genre: 'fichier', fantome: true })
        return [...entrees.values()]
      }
      case 'nuage_lire': {
        if (fantomes.has(chemin)) throw { code: 'fantome' }
        const o = fichiers.get(chemin)
        if (!o) throw { code: 'absent' }
        return o.slice().buffer
      }
      case 'nuage_ecrire':
        fichiers.set(net(decodeURIComponent(o!.headers!['x-notak-chemin']!)), (a as Uint8Array).slice())
        return null
      case 'nuage_supprimer':
        fichiers.delete(chemin)
        return null
      case 'nuage_telecharger':
        return null
    }
    throw new Error(commande)
  }
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
  return { fichiers, fantomes, echecs }
}

afterEach(() => {
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
})

verifierContrat('dossier iCloud par la coque', async () => {
  fausseCoque()
  return dossierCoque()
})

describe('dossier iCloud par la coque', () => {
  it('dit « fantôme » pour un fichier resté dans le nuage', async () => {
    const c = fausseCoque()
    c.fantomes.add('appareils/x/base-1.nmb')
    const d = dossierCoque()
    expect(await d.lire('appareils/x/base-1.nmb')).toBe('fantome')
    expect(await d.lister('appareils/x')).toEqual([{ nom: 'base-1.nmb', genre: 'fichier', fantome: true }])
  })

  it('traduit les refus de la coque dans la langue du moteur', async () => {
    const c = fausseCoque()
    const d = dossierCoque()
    c.echecs.push({ code: 'lecture-seule' })
    await expect(d.ecrireAtomique('a.json', new Uint8Array([1]))).rejects.toMatchObject({ cause: 'lecture-seule' })
    c.echecs.push({ code: 'plein' })
    await expect(d.ecrireAtomique('a.json', new Uint8Array([1]))).rejects.toMatchObject({ cause: 'plein' })
    c.echecs.push({ code: 'indisponible' })
    const e = await d.lister('appareils').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ErreurDossier)
    expect((e as ErreurDossier).cause).toBe('indisponible')
  })
})
