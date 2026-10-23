// Un PDF d'une seule page, faite d'une seule image JPEG : de quoi rendre une capture imprimable ou envoyable,
// sans bibliothèque. Une page PDF se compte en points (1/72 pouce) : un pixel d'écran vaut 0,75 point.

const encodeur = new TextEncoder()

/** Les octets d'un JPEG à partir d'une adresse `data:image/jpeg;base64,…`. */
export function octetsDeDataUrl(adresse: string): Uint8Array {
  const virgule = adresse.indexOf(',')
  const binaire = atob(adresse.slice(virgule + 1))
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0))
}

/**
 * Le PDF d'une page de `largeur` × `hauteur` pixels qui montre ce JPEG en plein.
 * Le JPEG est rangé tel quel (DCTDecode) : aucun recodage.
 */
export function pdfDepuisJpeg(jpeg: Uint8Array, largeur: number, hauteur: number): Uint8Array {
  const l = Math.max(1, Math.round(largeur))
  const h = Math.max(1, Math.round(hauteur))
  const pl = +(l * 0.75).toFixed(2)
  const ph = +(h * 0.75).toFixed(2)
  const texte = (s: string) => encodeur.encode(s)
  const contenu = `q ${pl} 0 0 ${ph} 0 0 cm /Im0 Do Q`

  const objets: Uint8Array[][] = [
    [texte('<< /Type /Catalog /Pages 2 0 R >>')],
    [texte('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')],
    [texte(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pl} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`)],
    [texte(`<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`)],
    [
      texte(`<< /Type /XObject /Subtype /Image /Width ${l} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      texte('\nendstream'),
    ],
  ]

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
    texte(`trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`),
  )

  const sortie = new Uint8Array(position)
  let curseur = 0
  for (const m of morceaux) {
    sortie.set(m, curseur)
    curseur += m.length
  }
  return sortie
}
