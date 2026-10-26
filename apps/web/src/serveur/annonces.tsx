import { useEffect, useSyncExternalStore } from 'react'
import { t } from '../langue'
import { useBandeau } from '../bandeaux'

/** Combien de temps une annonce reste en bas de la page. */
const DUREE_MS = 6000

let courante: { n: number; texte: string } | null = null
let compte = 0
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((f) => f())
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => void abonnes.delete(f)
}

export function annoncerBureau(texte: string): void {
  courante = { n: ++compte, texte }
  prevenir()
}

const retirer = () => {
  if (!courante) return
  courante = null
  prevenir()
}

/**
 * Un mot court quand un geste de l'app de bureau échoue (un fichier qui ne s'ouvre pas, un retour impossible) : un
 * bandeau du bas, qui part seul. Un seul à la fois, le suivant remplace le précédent. La toile a son propre avis
 * (`annoncer`), mais il n'est pas offert aux pages de l'application, et il n'existe que sous la toile.
 *
 * C'est une alerte, pas un statut : le bandeau est inséré avec son texte déjà dedans (et remonté à chaque annonce), et
 * seule une alerte s'annonce de façon fiable à l'insertion. C'est un échec du geste qu'on vient de faire.
 */
export function AnnoncesServeur() {
  const bandeau = useBandeau<HTMLElement>()
  const annonce = useSyncExternalStore(ecouter, () => courante)
  useEffect(() => {
    if (!annonce) return
    const n = annonce.n
    const minuteur = setTimeout(() => courante?.n === n && retirer(), DUREE_MS)
    return () => clearTimeout(minuteur)
  }, [annonce])
  if (!annonce) return null
  return (
    <aside ref={bandeau} className="bandeau bandeau-annonce" role="alert" key={annonce.n}>
      <span>{annonce.texte}</span>
      <button type="button" className="bouton-lien" onClick={retirer}>
        {t('commun.fermer')}
      </button>
    </aside>
  )
}
