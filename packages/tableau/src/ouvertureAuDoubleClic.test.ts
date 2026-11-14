// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { champSous, clicEcrit, ouvreMalgreEdition } from './ouvertureAuDoubleClic'

const ouvrir = () => {}
const surPlace = { ecritSurPlace: true, ouvrir }

function carte(html: string) {
  const n = document.createElement('div')
  n.innerHTML = html
  return n
}

describe('un clic sur un élément choisi', () => {
  it('écrit une note où qu’il tombe', () => {
    expect(clicEcrit({}, carte('<p>texte</p>').querySelector('p'))).toBe(true)
    expect(clicEcrit(undefined, null)).toBe(true)
  })

  it('n’écrit une image, un fichier, un lien que sur un de leurs champs', () => {
    const c = carte('<img><span data-ecrire="nom">devis.pdf</span><div data-ecrire="legende"><b>Signé</b></div>')
    expect(clicEcrit(surPlace, c.querySelector('img'))).toBe(false)
    expect(clicEcrit(surPlace, c.querySelector('span'))).toBe(true)
    // Un nœud dans le champ compte pour le champ.
    expect(clicEcrit(surPlace, c.querySelector('b'))).toBe(true)
    expect(clicEcrit(surPlace, null)).toBe(false)
  })
})

describe('un double-clic dans l’élément qu’on écrit', () => {
  const c = carte('<img><input class="nom"><textarea></textarea><div data-ecrire="legende">x</div>')
  const image = c.querySelector('img')
  const champ = c.querySelector('textarea')

  it('n’ouvre jamais une note ni un texte : il y choisit un mot', () => {
    expect(ouvreMalgreEdition({}, champ, 0)).toBe(false)
    expect(ouvreMalgreEdition({ ouvrir }, image, 0)).toBe(false)
    expect(ouvreMalgreEdition(undefined, image, 0)).toBe(false)
  })

  it('ouvre un élément qui s’écrit sur place, hors de ses champs, même pendant qu’on écrit depuis longtemps', () => {
    expect(ouvreMalgreEdition(surPlace, image, 7)).toBe(true)
  })

  it('l’ouvre aussi dans le champ que son premier clic vient d’ouvrir', () => {
    // L'écriture s'est ouverte au premier clic : seul l'appui du second a suivi.
    expect(ouvreMalgreEdition(surPlace, champ, 1)).toBe(true)
    expect(ouvreMalgreEdition(surPlace, c.querySelector('.nom'), 0)).toBe(true)
  })

  it('laisse le mot au champ où le curseur était déjà', () => {
    expect(ouvreMalgreEdition(surPlace, champ, 2)).toBe(false)
    expect(ouvreMalgreEdition(surPlace, c.querySelector('[data-ecrire]'), 3)).toBe(false)
  })

  it('sans ouverture, rien ne s’ouvre', () => {
    expect(ouvreMalgreEdition({ ecritSurPlace: true }, image, 0)).toBe(false)
  })

  it('reconnaît les champs : saisies, textes modifiables et champs marqués', () => {
    const d = carte('<div contenteditable="true"><i>a</i></div><span data-ecrire="titre">t</span><p>rien</p>')
    expect(champSous(d.querySelector('i'))).not.toBeNull()
    expect(champSous(d.querySelector('span'))).not.toBeNull()
    expect(champSous(d.querySelector('p'))).toBeNull()
  })
})
