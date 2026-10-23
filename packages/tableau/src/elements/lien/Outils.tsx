import type { Lien } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { adresseAEditer } from './Lien'

export function OutilsLien({ elements, contexte }: PropsOutils<Lien>) {
  const urls = elements.map((e) => e.contenu.url).filter(Boolean)
  if (urls.length === 0) return null
  return (
    <>
      {urls.length === 1 && (
        <button title="Ouvrir dans un nouvel onglet" onClick={() => window.open(urls[0], '_blank', 'noopener,noreferrer')}>
          Ouvrir
        </button>
      )}
      {elements.length === 1 && !contexte.services.lectureSeule && (
        <button
          title="Changer l’adresse du lien"
          onClick={() => {
            adresseAEditer.add(elements[0]!.id)
            contexte.commencerEdition(elements[0]!.id)
          }}
        >
          Adresse
        </button>
      )}
      <button title="Copier l’adresse" onClick={() => void navigator.clipboard.writeText(urls.join('\n'))}>
        Copier
      </button>
    </>
  )
}
