import { useRef } from 'react'

/**
 * Un champ qu'un clic vient d'ouvrir sur la carte (le titre d'une toile ou d'un document, une légende) : le double-clic
 * dont ce clic était le premier n'y choisit pas un mot. Le champ se referme (sa sortie valide ce qu'il porte) et le
 * double-clic passe à la carte, puis à la toile, qui ouvrent l'élément. Une fois qu'on y a appuyé deux fois, le
 * curseur y est : le double-clic y reste et choisit un mot, comme dans tout texte.
 *
 * Ses appuis ne lancent pas de glisser. `ouvert` remet le compte à zéro quand le même champ se rouvre sans être
 * redessiné.
 */
export function useChampOuvert() {
  const appuis = useRef(0)
  return {
    ouvert: () => {
      appuis.current = 0
    },
    proprietes: {
      onPointerDown: (e: React.PointerEvent) => {
        appuis.current++
        e.stopPropagation()
      },
      onDoubleClick: (e: React.MouseEvent<HTMLElement>) => {
        if (appuis.current > 1) return e.stopPropagation()
        e.currentTarget.blur()
      },
    },
  }
}
