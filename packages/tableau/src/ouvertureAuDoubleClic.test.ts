// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { champSous, clicEcrit, doubleToucherOuvre, ouvreAutreChose, ouvreMalgreEdition } from './ouvertureAuDoubleClic'

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

describe('au doigt, le second toucher d’un double toucher sur un champ', () => {
  const croquis = { ouvreAuDoubleClic: true, editable: true }
  const toile = { ouvrir }
  const note = { editable: true }
  const c = carte('<p data-ecrire="legende">Plan</p><textarea></textarea><span data-ecrire="titre">Projets</span><svg></svg>')
  const legende = c.querySelector('p')
  const champ = c.querySelector('textarea')

  it('ouvre l’élément depuis une légende ou un titre affichés', () => {
    expect(doubleToucherOuvre(surPlace, { enEdition: false, cible: legende, champAvant: legende, appuisDepuis: 5 })).toBe(true)
    expect(doubleToucherOuvre(croquis, { enEdition: false, cible: legende, champAvant: null, appuisDepuis: 5 })).toBe(true)
    expect(doubleToucherOuvre(toile, { enEdition: false, cible: c.querySelector('span'), champAvant: null, appuisDepuis: 5 })).toBe(true)
  })

  it('ouvre l’élément depuis le champ que le premier toucher vient d’ouvrir, pas depuis celui où l’on écrivait', () => {
    expect(doubleToucherOuvre(croquis, { enEdition: false, cible: champ, champAvant: legende, appuisDepuis: 5 })).toBe(true)
    expect(doubleToucherOuvre(croquis, { enEdition: false, cible: champ, champAvant: champ, appuisDepuis: 5 })).toBe(false)
  })

  it('laisse le reste à la toile : hors d’un champ, ou une note, dont ouvrir veut dire écrire', () => {
    expect(doubleToucherOuvre(croquis, { enEdition: false, cible: c.querySelector('svg'), champAvant: null, appuisDepuis: 5 })).toBe(false)
    expect(doubleToucherOuvre(note, { enEdition: false, cible: legende, champAvant: null, appuisDepuis: 5 })).toBe(false)
  })

  it('dans l’écriture de la toile, suit la règle du double-clic', () => {
    expect(doubleToucherOuvre(surPlace, { enEdition: true, cible: champ, champAvant: legende, appuisDepuis: 1 })).toBe(true)
    expect(doubleToucherOuvre(surPlace, { enEdition: true, cible: champ, champAvant: champ, appuisDepuis: 4 })).toBe(false)
    expect(doubleToucherOuvre(croquis, { enEdition: true, cible: champ, champAvant: legende, appuisDepuis: 1 })).toBe(false)
  })

  it('reconnaît ce qui ouvre autre chose que son texte', () => {
    expect(ouvreAutreChose(surPlace)).toBe(true)
    expect(ouvreAutreChose(croquis)).toBe(true)
    expect(ouvreAutreChose(toile)).toBe(true)
    expect(ouvreAutreChose(note)).toBe(false)
    expect(ouvreAutreChose({ ouvrir, editable: true })).toBe(false)
  })
})
