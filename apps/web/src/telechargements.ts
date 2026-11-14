/**
 * Où vont les téléchargements de la page (l'original d'une image ou d'un fichier, un export de la toile), d'après
 * l'endroit où elle tourne. La toile télécharge toujours de la même façon (`telechargerFichier`, `@notak/tableau`) ;
 * ici, on lui dit une fois ce qui change :
 * - dans un navigateur, et dans l'app de Mac : un lien de téléchargement, comme partout. L'app range le fichier dans
 *   Téléchargements (`apps/bureau/src-tauri/src/telechargements.rs`) et le dit ici : la toile l'annonce, avec de quoi
 *   le montrer dans le Finder ;
 * - dans l'app d'un iPhone ou d'un iPad : la feuille de partage (Enregistrer dans Fichiers, AirDrop…), la webview n'y
 *   ayant pas de Téléchargements à montrer ;
 * - dans une app de Mac d'avant ses téléchargements (la page d'un serveur plus récent qu'elle) : « Enregistrer sous ».
 *
 * Ce module n'est chargé que dans la coque (`main.tsx`) : le navigateur garde le lien, sans rien de plus.
 */
import { annoncer, reglerTelechargement } from '@notak/tableau'
import { type FenetreAvecCoque, partagerFichier, peutPartager, plateforme } from './appareil'
import { coqueTelecharge, dansCoque, ecouter, enregistrerSous, invoquer } from './bureau'
import { t } from './langue'

/** L'événement de la coque à la fin d'un téléchargement (`telechargements::EVENEMENT`). */
export const TELECHARGEMENT_FINI = 'notak://telechargement'

export type VoieTelechargement = 'lien' | 'partage' | 'enregistrer-sous'

/** Par où passe un téléchargement, ici. */
export function voieDesTelechargements(fenetre: Window = window): VoieTelechargement {
  if (!dansCoque(fenetre)) return 'lien'
  if (peutPartager(fenetre as unknown as FenetreAvecCoque)) return 'partage'
  return coqueTelecharge(fenetre) ? 'lien' : 'enregistrer-sous'
}

/** Ce que la coque dit d'un téléchargement fini (`telechargements::Issue`). */
export interface IssueTelechargement {
  /** De quoi le montrer dans le Finder ; seulement s'il a réussi. */
  id: number | null
  /** Son nom dans Téléchargements, « photo (1).jpg » si « photo.jpg » y était déjà. */
  nom: string
  reussi: boolean
}

function lireIssue(charge: unknown): IssueTelechargement | null {
  const c = charge as Partial<IssueTelechargement> | null
  if (!c || typeof c !== 'object' || typeof c.reussi !== 'boolean' || typeof c.nom !== 'string') return null
  return { id: typeof c.id === 'number' ? c.id : null, nom: c.nom, reussi: c.reussi }
}

/** L'annonce de la fin d'un téléchargement : « Enregistré dans Téléchargements », et le bouton qui montre le fichier. */
export function annoncerTelechargement(charge: unknown, fenetre: Window = window): void {
  const issue = lireIssue(charge)
  if (!issue) return
  if (!issue.reussi) return annoncer({ texte: t('telechargement.echec', { nom: issue.nom }) })
  const id = issue.id
  annoncer({
    texte: t('telechargement.fini'),
    ...(id !== null
      ? {
          action: {
            libelle: t(plateforme(fenetre as unknown as FenetreAvecCoque) === 'macos' ? 'telechargement.finder' : 'telechargement.dossier'),
            faire: () => void invoquer('montrer_telechargement', { id }).catch(() => annoncer({ texte: t('telechargement.introuvable') })),
          },
        }
      : {}),
  })
}

/** Règle les téléchargements de la toile pour cette page, et, dans l'app de Mac, écoute leur fin. Rend de quoi cesser. */
export function brancherTelechargements(fenetre: Window = window): () => void {
  const voie = voieDesTelechargements(fenetre)
  const f = fenetre as unknown as FenetreAvecCoque
  reglerTelechargement({
    remise:
      voie === 'partage'
        ? (fichier, nom) => partagerFichier(fichier, nom, f)
        : voie === 'enregistrer-sous'
          ? async (fichier, nom) => enregistrerSous(new Uint8Array(await fichier.arrayBuffer()), nom)
          : null,
  })
  if (!coqueTelecharge(fenetre)) return () => {}
  let cesser: (() => void) | null = null
  let fini = false
  ecouter(TELECHARGEMENT_FINI, (charge) => annoncerTelechargement(charge, fenetre), fenetre)
    .then((c) => (fini ? c() : (cesser = c)))
    .catch((e: unknown) => console.warn('Notak : la fin des téléchargements ne se dira pas', e))
  return () => {
    fini = true
    cesser?.()
  }
}
