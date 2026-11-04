import { type GenreNeuf, Icone, type NomIcone } from '@notak/tableau'
import { useRef } from 'react'
import { t } from '../langue'
import { ICONE_GENRE } from './AuDoigt'

/**
 * Le premier écran d'une bibliothèque où il n'y a encore rien : pas de toile déjà remplie qu'on ne comprend pas, mais
 * de quoi commencer. Une toile, une page ou une carte mentale, qui s'ouvre aussitôt ; des fichiers à importer ; et,
 * pour qui veut voir les gestes, « Découvrir Notak », le guide, créé à la demande. Dans l'app qui rejoint iCloud, on
 * attend d'avoir lu ce qu'il y a là-bas (`attente`) : un appareil neuf y retrouve ses toiles plutôt que d'en créer.
 */
export function PremierPas({
  creer,
  occupe = false,
  importer,
  decouvrir,
  attente = false,
}: {
  creer(genre: GenreNeuf): void
  occupe?: boolean
  /** Des fichiers de la machine, posés sur l'accueil. */
  importer?(fichiers: File[]): void
  /** Le guide : une toile qui montre les gestes. */
  decouvrir?(): void
  /** La première lecture d'iCloud n'est pas finie. */
  attente?: boolean
}) {
  const champ = useRef<HTMLInputElement>(null)
  if (attente)
    return (
      <div className="biblio-premiers biblio-premiers-attente" role="status">
        <span className="biblio-premiers-roue" aria-hidden />
        <p>{t('biblio.premiers.nuage')}</p>
      </div>
    )
  const ligne = (cle: string, icone: NomIcone, libelle: string, aide: string, faire: () => void, genre?: GenreNeuf) => (
    <li key={cle}>
      <button type="button" className="biblio-premiers-choix" data-genre={genre} disabled={occupe} onClick={faire}>
        <span className="biblio-premiers-pastille" data-genre={genre} aria-hidden>
          <Icone nom={icone} taille={20} />
        </span>
        <span className="biblio-premiers-libelle">
          <span>{libelle}</span>
          <small>{aide}</small>
        </span>
      </button>
    </li>
  )
  return (
    <section className="biblio-premiers" aria-labelledby="biblio-premiers-titre">
      <h2 id="biblio-premiers-titre">{t('biblio.premiers.titre')}</h2>
      <p>{t('biblio.premiers.texte')}</p>
      <ul>
        {(['toile', 'document', 'arbre'] as const).map((g) => ligne(g, ICONE_GENRE[g], t(`biblio.genre.${g}`), t(`biblio.neufAide.${g}`), () => creer(g), g))}
      </ul>
      {(importer || decouvrir) && (
        <ul className="biblio-premiers-autres">
          {importer && ligne('importer', 'importer', t('biblio.premiers.importer'), t('biblio.premiers.importer.aide'), () => champ.current?.click())}
          {decouvrir && ligne('decouvrir', 'modele', t('biblio.premiers.decouvrir'), t('biblio.premiers.decouvrir.aide'), decouvrir)}
        </ul>
      )}
      {importer && (
        <input
          ref={champ}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const fichiers = [...(e.target.files ?? [])]
            e.target.value = ''
            if (fichiers.length > 0) importer(fichiers)
          }}
        />
      )}
    </section>
  )
}
