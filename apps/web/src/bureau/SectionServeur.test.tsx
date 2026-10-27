// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fabriquerCopie } from '../local/copie'
import type { EspaceLocal } from '../local/espace'
import { DEPART_MS, lireEtatServeur, oublierEchecServeur } from './emporter'
import { SERVEUR, acces, appelsDe, bouton, coque, dialoguesDeJsdom, invoke, poserCoque, retirerCoque } from './essai'
import { fermerDialogueAcces } from './etat'
import { DialogueAcces } from './FormulaireAcces'
import { SectionServeur } from './SectionServeur'

vi.mock('../local/copie', () => ({ fabriquerCopie: vi.fn(async () => new Uint8Array([9, 8, 7])) }))

dialoguesDeJsdom()

const el = { espace: 'el' } as unknown as EspaceLocal

let racine: Root
let hote: HTMLElement

beforeEach(() => {
  definirLangue('fr')
  vi.mocked(fabriquerCopie).mockClear()
  poserCoque({ acces: () => acces() })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(async () => {
  vi.useRealTimers()
  act(() => {
    fermerDialogueAcces()
    racine.unmount()
  })
  hote.remove()
  document.querySelectorAll('dialog').forEach((d) => d.remove())
  retirerCoque()
  oublierEchecServeur()
  vi.restoreAllMocks()
})

const monter = async (fermer = vi.fn()) => {
  await act(async () => racine.render(<><SectionServeur el={el} fermer={fermer} /><DialogueAcces /></>))
  return fermer
}

describe('« Travailler à plusieurs », dans « Où sont mes toiles ? » de l’app de bureau', () => {
  it('sans serveur retenu : une phrase, de quoi se connecter, et le guide pour installer le sien', async () => {
    await monter()
    expect(document.querySelector('h3')?.textContent).toBe('Travailler à plusieurs, en temps réel')
    expect(document.body.textContent).toContain('Vos toiles de cet ordinateur restent ici ; celles du serveur restent sur le serveur.')
    expect(bouton('Se connecter à un serveur Notak…')).toBeTruthy()
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Se connecter à un serveur Notak…'])
    const guide = [...document.querySelectorAll('a')].find((a) => a.href.includes('AUTO-HEBERGER'))!
    expect(guide.target).toBe('_blank')
    expect(guide.rel).toContain('noopener')
  })

  it('« Se connecter… » referme le panneau et ouvre la fenêtre d’accès', async () => {
    const fermer = await monter()
    await act(async () => bouton('Se connecter à un serveur Notak…')!.click())
    expect(fermer).toHaveBeenCalledOnce()
    expect(document.querySelector<HTMLDialogElement>('dialog')?.open).toBe(true)
  })

  describe('avec un serveur retenu', () => {
    beforeEach(() => {
      coque.acces = () => acces({ serveur: SERVEUR })
    })

    it('propose d’y revenir et d’y copier ses toiles, en disant ce qui arrive aux copies', async () => {
      await monter()
      expect(bouton('Revenir sur notak.exemple.fr')).toBeTruthy()
      expect(bouton('Copier mes toiles sur notak.exemple.fr')).toBeTruthy()
      expect(document.body.textContent).toContain('Une copie de vos toiles sera proposée à l’import sur notak.exemple.fr. Rien n’est supprimé ici.')
    })

    it('« Revenir sur » joint le serveur en le retenant, sans copie', async () => {
      vi.useFakeTimers()
      let partir: (v: unknown) => void = () => {}
      coque.joindre_serveur = () => new Promise((fin) => (partir = fin))
      await monter()
      await act(async () => bouton('Revenir sur notak.exemple.fr')!.click())
      expect(appelsDe('joindre_serveur')).toEqual([{ adresse: SERVEUR, garder: true }])
      expect(appelsDe('confier_copie')).toHaveLength(0)
      expect(fabriquerCopie).not.toHaveBeenCalled()
      expect(document.querySelector('[role="status"]')?.textContent).toBe('Connexion à notak.exemple.fr…')
      expect([...document.querySelectorAll('button')].every((b) => b.disabled)).toBe(true)
      expect(lireEtatServeur()).toEqual({ type: 'cours', quoi: 'revenir' })
      // La fenêtre part chez le serveur ; si elle ne part pas, les boutons se rendent.
      partir(null)
      await act(async () => void vi.advanceTimersByTimeAsync(DEPART_MS))
      expect(lireEtatServeur()).toEqual({ type: 'repos' })
    })

    it('« Copier » : une copie complète, un temps pour qu’IndexedDB écrive, la copie confiée à la coque, puis le serveur', async () => {
      vi.useFakeTimers()
      let partir: (v: unknown) => void = () => {}
      coque.confier_copie = () => undefined
      coque.joindre_serveur = () => new Promise((fin) => (partir = fin))
      await monter()
      await act(async () => bouton('Copier mes toiles sur notak.exemple.fr')!.click())
      expect(fabriquerCopie).toHaveBeenCalledWith(el)
      expect(document.querySelector('[role="status"]')?.textContent).toBe('Préparation de la copie de vos toiles…')
      expect(appelsDe('confier_copie')).toHaveLength(0)
      await act(async () => void vi.advanceTimersByTimeAsync(400))
      expect(invoke.mock.calls.map((c) => c[0]).filter((c) => c === 'confier_copie' || c === 'joindre_serveur')).toEqual(['confier_copie', 'joindre_serveur'])
      expect(invoke.mock.calls.find((c) => c[0] === 'confier_copie')![1]).toEqual(new Uint8Array([9, 8, 7]))
      expect(appelsDe('joindre_serveur')).toEqual([{ adresse: SERVEUR, garder: true }])
      partir(null)
      await act(async () => void vi.advanceTimersByTimeAsync(DEPART_MS))
    })

    it('une copie que la coque trouve trop lourde se dit, avec quoi faire ; rien n’est parti', async () => {
      vi.useFakeTimers()
      coque.confier_copie = () => {
        throw { code: 'trop_gros' }
      }
      await monter()
      await act(async () => bouton('Copier mes toiles sur notak.exemple.fr')!.click())
      await act(async () => void vi.advanceTimersByTimeAsync(400))
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        'Vos toiles sont trop volumineuses pour être copiées ainsi. Enregistrez-en une copie (.notak), puis importez-la sur notak.exemple.fr.',
      )
      expect(appelsDe('joindre_serveur')).toHaveLength(0)
      expect(bouton('Copier mes toiles sur notak.exemple.fr')!.disabled).toBe(false)
    })

    it('une file pleine de copies ouvertes depuis le système : ce n’est pas que les toiles sont trop lourdes', async () => {
      vi.useFakeTimers()
      coque.confier_copie = () => {
        throw { code: 'file_pleine' }
      }
      await monter()
      await act(async () => bouton('Copier mes toiles sur notak.exemple.fr')!.click())
      await act(async () => void vi.advanceTimersByTimeAsync(400))
      expect(document.querySelector('[role="alert"]')?.textContent).toBe('Trop de fichiers attendent déjà d’être ouverts dans Notak. Redémarrez l’app, puis réessayez.')
      expect(appelsDe('joindre_serveur')).toHaveLength(0)
    })

    it('un serveur qui ne répond pas, une fois la copie confiée : l’erreur se dit comme à l’écran d’accès', async () => {
      vi.useFakeTimers()
      coque.confier_copie = () => undefined
      coque.joindre_serveur = () => {
        throw { code: 'certificat' }
      }
      await monter()
      await act(async () => bouton('Copier mes toiles sur notak.exemple.fr')!.click())
      await act(async () => void vi.advanceTimersByTimeAsync(400))
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('certificat')
    })

    it('rouvrir le panneau ne remontre pas une erreur d’un essai d’avant', async () => {
      coque.joindre_serveur = () => {
        throw { code: 'delai' }
      }
      await monter()
      await act(async () => bouton('Revenir sur notak.exemple.fr')!.click())
      expect(document.querySelector('[role="alert"]')).not.toBeNull()
      act(() => racine.render(null))
      await monter()
      expect(document.querySelector('[role="alert"]')).toBeNull()
    })
  })
})
