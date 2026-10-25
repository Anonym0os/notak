// Un PDF fait d'images JPEG, une par page : de quoi rendre une capture ou un document imprimable ou envoyable,
// sans bibliothèque. Une page PDF se compte en points (1/72 pouce) : un pixel d'écran vaut 0,75 point.

const encodeur = new TextEncoder()

/** Une page A4, en points. */
export const A4 = { l: 595.28, h: 841.89 }

/** Les octets d'un JPEG à partir d'une adresse `data:image/jpeg;base64,…`. */
export function octetsDeDataUrl(adresse: string): Uint8Array {
  const virgule = adresse.indexOf(',')
  const binaire = atob(adresse.slice(virgule + 1))
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0))
}

export interface PagePdf {
  jpeg: Uint8Array
  /** La taille de l'image, en pixels. */
  largeur: number
  hauteur: number
  /** La taille de la page, en points ; absente, celle de l'image (96 ppp). L'image la remplit. */
  page?: { l: number; h: number }
}

/**
 * Le PDF d'une page de `largeur` × `hauteur` pixels qui montre ce JPEG en plein.
 * Le JPEG est rangé tel quel (DCTDecode) : aucun recodage.
 */
export function pdfDepuisJpeg(jpeg: Uint8Array, largeur: number, hauteur: number): Uint8Array {
  return pdfDePages([{ jpeg, largeur, hauteur }])
}

/** Le PDF de ces pages, dans l'ordre : chacune montre son JPEG en plein. */
export function pdfDePages(pages: readonly PagePdf[]): Uint8Array {
  const texte = (s: string) => encodeur.encode(s)
  const n = pages.length
  // 1 : le catalogue, 2 : l'arbre des pages, puis trois objets par page (la page, son contenu, son image).
  const objets: Uint8Array[][] = [
    [texte('<< /Type /Catalog /Pages 2 0 R >>')],
    [texte(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${n} >>`)],
  ]
  pages.forEach((p, i) => {
    const l = Math.max(1, Math.round(p.largeur))
    const h = Math.max(1, Math.round(p.hauteur))
    const pl = +(p.page?.l ?? l * 0.75).toFixed(2)
    const ph = +(p.page?.h ?? h * 0.75).toFixed(2)
    const contenu = `q ${pl} 0 0 ${ph} 0 0 cm /Im0 Do Q`
    const [flux, image] = [4 + i * 3, 5 + i * 3]
    objets.push(
      [texte(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pl} ${ph}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${flux} 0 R >>`)],
      [texte(`<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`)],
      [
        texte(`<< /Type /XObject /Subtype /Image /Width ${l} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`),
        p.jpeg,
        texte('\nendstream'),
      ],
    )
  })
  // Le dernier objet dit d'où vient le fichier, dans ses propriétés seulement : rien ne s'ajoute à la page.
  objets.push([texte('<< /Producer (Notak) /Creator (Notak) >>')])

  const morceaux: Uint8Array[] = []
  let position = 0
  const ecrire = (...bouts: Uint8Array[]) => {
    for (const b of bouts) {
      morceaux.push(b)
      position += b.length
    }
  }
  ecrire(texte('%PDF-1.4\n'))
  const decalages: number[] = []
  objets.forEach((parties, i) => {
    decalages.push(position)
    ecrire(texte(`${i + 1} 0 obj\n`), ...parties, texte('\nendobj\n'))
  })
  const debutXref = position
  const ligne = (n: number) => `${String(n).padStart(10, '0')} 00000 n \n`
  ecrire(
    texte(`xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${decalages.map(ligne).join('')}`),
    texte(`trailer\n<< /Size ${objets.length + 1} /Root 1 0 R /Info ${objets.length} 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`),
  )

  const sortie = new Uint8Array(position)
  let curseur = 0
  for (const m of morceaux) {
    sortie.set(m, curseur)
    curseur += m.length
  }
  return sortie
}
