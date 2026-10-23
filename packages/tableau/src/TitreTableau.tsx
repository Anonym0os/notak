import { useEffect, useRef, useState } from 'react'
import { t } from './langue'
import { TITRE_MAX, titreValide } from './titreValide'

/**
 * Le titre du tableau, au centre de la seconde rangée de l'en-tête, modifiable en place d'un clic. Entrée et Échap
 * valident, quitter le champ aussi ; un titre vide rend l'ancien ; 100 caractères au plus. Sans `renommer`
 * (l'accueil, la lecture seule), il se lit et se sélectionne seulement.
 */
export function TitreTableau({ titre, renommer }: { titre: string; renommer?(titre: string): void }) {
  const [saisie, setSaisie] = useState(titre)
  const champ = useRef<HTMLInputElement>(null)
  const enSaisie = useRef(false)
  // Un autre tableau, ou un titre changé ailleurs : le champ le reprend, sauf pendant qu'on y écrit.
  useEffect(() => {
    if (!enSaisie.current) setSaisie(titre)
  }, [titre])

  const valider = () => {
    enSaisie.current = false
    const neuf = titreValide(saisie, titre)
    if (neuf !== null && renommer) {
      renommer(neuf)
      setSaisie(neuf)
    } else setSaisie(titre)
  }
  return (
    <h1 className="notak-titre" data-valeur={saisie || t('commun.sansTitre')}>
      <input
        ref={champ}
        className="notak-titre-champ"
        aria-label={t('espace.titreTableau')}
        value={saisie}
        placeholder={t('commun.sansTitre')}
        maxLength={TITRE_MAX}
        readOnly={!renommer}
        spellCheck={false}
        onFocus={(e) => {
          enSaisie.current = true
          e.currentTarget.select()
        }}
        onChange={(e) => setSaisie(e.currentTarget.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          // Le clavier appartient au champ : la toile et les raccourcis de l'espace n'y touchent pas.
          e.stopPropagation()
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
    </h1>
  )
}
