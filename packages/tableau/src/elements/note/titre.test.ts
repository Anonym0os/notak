// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import { EXTENSIONS_NOTE, centreParDefaut } from './extensions'
import { sansLignesVidesEnFin } from './Note'

const titre = (texte: string): NoeudTexte => ({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [{ type: 'text', text: texte }] }] })

describe('un titre', () => {
  it('ne prend pas de paragraphe vide d’office sous lui', () => {
    const e = new Editor({ extensions: EXTENSIONS_NOTE, content: titre('Ceci') })
    expect(e.getJSON().content).toHaveLength(1)
    e.destroy()
  })

  it('reste centré quand on y ajoute une ligne, ou qu’on la repasse en titre', () => {
    const e = new Editor({ extensions: centreParDefaut(EXTENSIONS_NOTE), content: titre('Ceci') })
    e.chain().focus('end').splitBlock().setHeading({ level: 1 }).run()
    expect(e.getJSON().content?.map((n) => n.attrs?.textAlign)).toEqual(['center', 'center'])
    e.destroy()
  })

  it('perd les lignes vides qui le terminent, jamais son premier bloc', () => {
    const vide = { type: 'paragraph' }
    expect(sansLignesVidesEnFin({ type: 'doc', content: [...titre('A').content!, vide, vide] }).content).toHaveLength(1)
    expect(sansLignesVidesEnFin({ type: 'doc', content: [vide] }).content).toHaveLength(1)
    const intact = titre('A')
    expect(sansLignesVidesEnFin(intact)).toBe(intact)
  })
})
