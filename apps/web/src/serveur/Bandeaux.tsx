import type { Moi } from '../api'
import { BandeauMiseAJour, BandeauNouvelleVersion } from '../MiseAJour'
import { AnnoncesServeur } from './annonces'
import { BandeauAdmin } from './BandeauAdmin'

/**
 * Les bandeaux du bas de l'édition serveur, sur la bibliothèque comme sur une toile : la mise à jour de l'app de bureau,
 * la version web qui attend un rechargement, la nouvelle version du serveur (pour ses admins), et le mot d'un geste de
 * l'app qui a échoué. Frères dans la page, ils s'empilent (`.bandeau ~ .bandeau`).
 */
export function BandeauxServeur({ moi }: { moi: Moi }) {
  return (
    <>
      <BandeauMiseAJour />
      <BandeauNouvelleVersion />
      <BandeauAdmin moi={moi} />
      <AnnoncesServeur />
    </>
  )
}
