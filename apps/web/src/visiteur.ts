import { type Element, type Id, type Magasin, type Operation, type Tableau, creerMagasin } from '@notak/tableau'
import type { ChangementVisiteur } from './api'

// Le magasin d'un visiteur qui commente, par un lien qui le permet. La toile y écrit comme ailleurs : la règle du
// commentateur (`filtrerMagasin`, posée par la toile d'après `droits`) ne laisse passer que ses fils, ses réponses et
// ses réactions. Ce qui change part ensuite au serveur, qui le juge à son tour et rend la vue à jour. Comme pour un
// membre, le message qu'on écrit se voit venir : la toile l'écrit pendant la saisie (`appliquerSeulement`), et il part
// après une courte pause ; un geste fini (`faire`, `inscrire`) part tout de suite. Un fil neuf encore vide reste sur
// l'appareil, le temps qu'on y écrive. Annuler n'existe pas : ce qui est parti appartient au serveur.

/** Le temps d'une pause dans la saisie, avant que le brouillon parte. */
export const PAUSE_MS = 800

/** Les éléments que touchent ces pas. */
const touches = (pas: readonly Operation[]): Id[] => [
  ...new Set(pas.flatMap((op) => (op.type === 'creer' || op.type === 'supprimer' ? [op.element.id] : op.type === 'etiquettes' || op.type === 'fond' ? [] : [op.id]))),
]

const filVide = (e: Element | undefined) => e?.contenu.type === 'commentaire' && e.contenu.messages.length === 0

export interface MagasinVisiteur {
  magasin: Magasin
  /** La vue du serveur, relue ou rendue par un envoi ; ce qu'on n'a pas encore porté, et les fils vides, restent. */
  recevoir(t: Tableau): void
  /** Un envoi est en route ou attend : une relecture attendrait. */
  occupe(): boolean
  /** Porte tout de suite ce qui attend la fin d'une pause : la page se cache, on la quitte peut-être. */
  vider(): void
}

/**
 * `envoyer` porte les éléments changés au serveur et rend sa vue à jour ; s'il échoue, `refus` le dit, et la vue
 * revient à ce que le serveur sait (`relire`).
 */
export function magasinVisiteur(
  initial: Tableau,
  envoyer: (changements: ChangementVisiteur[]) => Promise<Tableau>,
  refus: (e: unknown) => void,
  relire: () => void,
  pause = PAUSE_MS,
): MagasinVisiteur {
  const base = creerMagasin(initial)
  /** Ce que le serveur connaît : un élément qu'il n'a jamais vu ne lui est pas retiré. */
  let connus = new Set(initial.elements.map((e) => e.id))
  let envois = 0
  /** Ce qu'il reste à porter, élément par élément : un geste rapide après un autre attend le premier envoi. */
  const enAttente = new Set<Id>()
  let file: Promise<void> = Promise.resolve()
  let minuterie: ReturnType<typeof setTimeout> | null = null

  const recevoir = (t: Tableau) => {
    connus = new Set(t.elements.map((e) => e.id))
    const locaux = new Map(base.lire().elements.map((e) => [e.id, e]))
    // Ce qui n'est pas encore parti garde sa version d'ici : la saisie en cours ne recule pas.
    const elements = t.elements.flatMap((e) => (enAttente.has(e.id) ? (locaux.has(e.id) ? [locaux.get(e.id)!] : []) : [e]))
    const restes = [...locaux.values()].filter((e) => !connus.has(e.id) && (filVide(e) || enAttente.has(e.id)))
    base.remplacer({ ...t, elements: [...elements, ...restes] })
  }

  const porter = () => {
    if (minuterie) clearTimeout(minuterie)
    minuterie = null
    file = file.then(async () => {
      const ids = [...enAttente]
      enAttente.clear()
      const elements = new Map(base.lire().elements.map((e) => [e.id, e]))
      const changements = ids.flatMap((id): ChangementVisiteur[] => {
        const e = elements.get(id)
        // Un fil neuf sans message, ou retiré avant d'avoir rien dit : rien à porter.
        if (!e) return connus.has(id) ? [{ id, apres: null }] : []
        if (filVide(e) && !connus.has(id)) return []
        return [{ id, apres: e }]
      })
      if (changements.length === 0) return
      envois++
      try {
        recevoir(await envoyer(changements))
      } catch (e) {
        refus(e)
        relire()
      } finally {
        envois--
      }
    })
  }

  const apres = (pas: Operation[], tout: boolean) => {
    for (const id of touches(pas)) enAttente.add(id)
    if (enAttente.size === 0) return
    if (tout) return porter()
    if (minuterie) clearTimeout(minuterie)
    minuterie = setTimeout(porter, pause)
  }

  const magasin: Magasin = {
    ...base,
    faire(pas) {
      base.faire(pas)
      apres(pas, true)
    },
    inscrire(pas) {
      base.inscrire(pas)
      apres(pas, true)
    },
    corriger(pas) {
      base.corriger(pas)
      apres(pas, true)
    },
    // Ce qu'on écrit, ou un glisser en cours : il part après une pause, ou à la fin du geste.
    appliquerSeulement(pas) {
      base.appliquerSeulement(pas)
      apres(pas, false)
    },
    annuler: () => false,
    retablir: () => false,
    peutAnnuler: () => false,
    peutRetablir: () => false,
  }
  return {
    magasin,
    recevoir,
    occupe: () => envois > 0 || enAttente.size > 0,
    vider: () => {
      if (enAttente.size > 0) porter()
    },
  }
}
