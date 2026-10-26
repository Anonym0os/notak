import type { Id, IndexEspace } from '@notak/tableau'
import { useState, useSyncExternalStore } from 'react'
import { t } from '../langue'

/**
 * Le tableau ouvert vient d'une copie reçue : ses lecteurs et ses images d'autres sites attendent la permission de la
 * personne (`Services.contenuExterne`, voir `copie.ts`). « Tout afficher » efface la marque pour de bon, sur cet
 * appareil ; « Masquer » ne fait que taire le bandeau pour cette visite, rien ne se charge pour autant.
 */
export function BandeauRecu({ index, tableau }: { index: IndexEspace; tableau: Id }) {
  const recu = useSyncExternalStore(index.ecouterRecus, () => index.recu(tableau))
  const [tus, setTus] = useState<ReadonlySet<Id>>(new Set())
  if (!recu || tus.has(tableau)) return null
  return (
    <aside className="bandeau bandeau-recu" role="status">
      <span>{t('externe.bandeau')}</span>
      <button type="button" className="bouton bouton-plein" onClick={() => index.retirerRecu(tableau)}>
        {t('externe.toutAfficher')}
      </button>
      <button type="button" className="bouton-lien" onClick={() => setTus(new Set(tus).add(tableau))}>
        {t('externe.masquer')}
      </button>
    </aside>
  )
}
