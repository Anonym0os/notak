import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Apercu, CauseEchec, GenreLien, Id, Lien } from '../../coeur/tableau'
import type { PropsRendu } from '../types'
import { INVITES, adresseAffichee, avecAdresse, domaineDe, lireAdresse } from './adresse'
import { lireCause, messageEchec } from './echec'
import { lecteurDe } from './lecteurs'
import { Media } from './Media'
import { convertirEnImage, estAdresseImage } from './versImage'
import { affichage, mediaSeul } from './affichage'
import { dimensionsApercu } from './imageApercu'
import { t } from '../../langue'
import { Icone, type NomIcone } from '../../icones'
import { FOND_NOTE } from '../note/couleurs'

const DELAI_APERCU = 15_000
const REL = 'noopener noreferrer nofollow'
/** Un message passager (adresse invalide, aperçu manqué) reste 2 secondes, puis le champ revient. */
const DUREE_MESSAGE = 2000

/** Les liens dont la prochaine édition porte sur la légende (l'outil « Légende » vient de l'allumer, ou un caractère tapé). */
export const legendeAEditer = new Set<Id>()

/** Le caractère tapé sur un lien choisi : il devient le début de sa légende (voir `surFrappe`). */
let amorce = ''
export const amorcerLegendeLien = (caractere: string) => {
  amorce = caractere
}
const prendreAmorce = () => {
  const a = amorce
  amorce = ''
  return a
}

export function RenduLien(props: PropsRendu<Lien>) {
  useChargementApercu(props)
  useSuppressionSiVide(props)
  const { element, enEdition } = props
  const { url, statut } = element.contenu
  // Sans aperçu, la carte est une ligne de saisie : l'adresse à taper, l'aperçu en lecture (la roue), ou l'aperçu
  // manqué (le message, puis l'adresse tapée de nouveau modifiable).
  const saisie = !url || statut === 'echec' || statut === 'attente'
  useEffect(() => {
    if (!enEdition) legendeAEditer.delete(element.id)
  }, [enEdition, element.id])
  return saisie ? <Saisie {...props} /> : <Carte {...props} />
}

/** Le titre affiché : celui qu'on a donné, sinon celui de l'aperçu, sinon l'adresse si l'aperçu a échoué. */
export const titreDuLien = (c: Lien) => c.titre || (c.statut === 'echec' ? c.url : c.apercu?.titre)

/** Va chercher l'aperçu, une seule fois par adresse (React rejoue les effets en mode strict). */
function useChargementApercu({ element, contexte }: PropsRendu<Lien>) {
  const { url, statut } = element.contenu
  const id = element.id
  const marque = useRef<string | null>(null)
  useEffect(() => {
    // Un aperçu rendu (ou manqué) libère la marque : la même adresse, retapée, se cherche de nouveau.
    if (statut !== 'attente') marque.current = null
    if (statut !== 'attente' || !url || marque.current === `${id}|${url}`) return
    marque.current = `${id}|${url}`
    const chercheur = contexte.services.apercu
    // Une adresse d'image devient une image tout de suite, sans attendre la page (si l'aperçu arrive avant, il gagne).
    const direct = estAdresseImage(url)
    if (direct) void convertirEnImage(id, url, contexte, true)
    const terminer = (statutFinal: 'pret' | 'echec', apercu?: Apercu, cause?: CauseEchec) => {
      const actuel = contexte.magasin.lire().elements.find((e) => e.id === id)?.contenu
      // L'élément a disparu ou changé d'adresse entre-temps : ce résultat ne le concerne plus.
      if (!actuel || actuel.type !== 'lien' || actuel.url !== url || actuel.statut !== 'attente') return
      const { echec: _, ...sans } = actuel
      const apres: Lien = { ...sans, statut: statutFinal, apercu, ...(cause ? { echec: cause } : {}) }
      contexte.magasin.corriger([{ type: 'contenu', id, avant: actuel, apres }])
    }
    if (!chercheur) return terminer('echec', undefined, 'injoignable')
    let minuteur: ReturnType<typeof setTimeout>
    const limite = new Promise<never>((_, rejeter) => {
      minuteur = setTimeout(() => rejeter(new Error('délai', { cause: 'delai' })), DELAI_APERCU)
    })
    Promise.race([chercheur(url), limite])
      .then(async (a) => {
        // L'adresse mène à une image : on la rapatrie et la carte devient une image ; sinon elle garde l'aperçu.
        if (a.estImage && !direct && (await convertirEnImage(id, url, contexte))) return
        terminer('pret', a)
      })
      .catch((e: unknown) => terminer('echec', undefined, lireCause(e)))
      .finally(() => clearTimeout(minuteur))
  }, [id, url, statut, contexte])
}

/** Un lien resté vide à la sortie de l'édition n'a plus de raison d'être. */
function useSuppressionSiVide({ element, enEdition, contexte }: PropsRendu<Lien>) {
  const etaitEnEdition = useRef(false)
  useEffect(() => {
    if (etaitEnEdition.current && !enEdition) {
      const actuel = contexte.magasin.lire().elements.find((e) => e.id === element.id)
      if (actuel && actuel.contenu.type === 'lien' && actuel.contenu.url === '') {
        contexte.magasin.faire([{ type: 'supprimer', element: actuel }])
      }
    }
    etaitEnEdition.current = enEdition
  }, [enEdition, element.id, contexte])
}

const ICONE_GENRE: Record<GenreLien | 'lien', NomIcone> = { lien: 'lien', video: 'lecture', audio: 'audio', carte: 'carte' }

/**
 * La carte sans aperçu : une ligne, l'icône d'état à gauche (le genre, la roue pendant la lecture, l'échec) et le champ
 * d'adresse sans cadre. L'adresse se lit en quittant le champ (Entrée, Échap, un clic ailleurs) ; un message (adresse
 * invalide, aperçu manqué) prend la place du champ pendant 2 secondes.
 */
function Saisie({ element, enEdition, contexte }: PropsRendu<Lien>) {
  const { contenu } = element
  const etat = contenu.statut === 'attente' && contenu.url ? 'chargement' : contenu.statut === 'echec' ? 'echec' : 'saisie'
  const [texte, setTexte] = useState(contenu.url)
  const [message, setMessage] = useState<string | null>(etat === 'echec' ? messageEchec(contenu.echec) : null)
  const champ = useRef<HTMLInputElement>(null)
  const dernier = useRef(texte)
  const depart = useRef(contenu.url)
  const fait = useRef(false)

  // L'aperçu qui vient de manquer : sa cause remplace le champ un instant.
  useEffect(() => {
    if (contenu.statut === 'echec') setMessage(messageEchec(contenu.echec))
  }, [contenu.statut, contenu.echec])
  useEffect(() => {
    if (!message) return
    const minuteur = setTimeout(() => setMessage(null), DUREE_MESSAGE)
    return () => clearTimeout(minuteur)
  }, [message])
  useEffect(() => {
    if (enEdition && etat === 'saisie') champ.current?.focus()
  }, [enEdition, etat])

  /** Pose l'adresse tapée sur la carte, qui en cherche l'aperçu. Faux si ce n'est pas une adresse. */
  const enregistrer = () => {
    const url = lireAdresse(dernier.current)
    if (!url) return false
    fait.current = true
    const actuel = contexte.magasin.lire().elements.find((e) => e.id === element.id)?.contenu
    if (actuel?.type === 'lien' && (actuel.url !== url || actuel.statut === 'echec')) {
      contexte.magasin.faire([{ type: 'contenu', id: element.id, avant: actuel, apres: avecAdresse(actuel, url) }])
    }
    return true
  }
  // Quitter la carte (un clic ailleurs) vaut valider : l'adresse tapée n'est pas perdue.
  useEffect(
    () => () => {
      if (!fait.current && dernier.current.trim() !== depart.current) enregistrer()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const valider = () => {
    if (enregistrer() || dernier.current.trim() === '') return contexte.finirEdition()
    setMessage(t('lien.invalide'))
  }

  return (
    <div className="notak-lien notak-lien-saisie" data-etat={etat}>
      <span className="notak-lien-icone" aria-hidden="true">
        {etat === 'chargement' ? (
          <span className="notak-lien-chargement" role="status" aria-label={t('lien.chargement')} />
        ) : (
          <Icone nom={etat === 'echec' ? 'attention' : ICONE_GENRE[contenu.genre ?? 'lien']} taille={16} />
        )}
      </span>
      {message && (
        <div className="notak-lien-message" role="status">
          {message}
        </div>
      )}
      <input
        ref={champ}
        className="notak-lien-champ"
        type="url"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={etat === 'chargement'}
        readOnly={!!contexte.services.lectureSeule}
        style={message ? { opacity: 0 } : undefined}
        placeholder={INVITES[contenu.genre ?? 'lien']}
        value={texte}
        onChange={(e) => {
          dernier.current = e.target.value
          setTexte(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            valider()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            valider()
          } else if ((e.key === 'Backspace' || e.key === 'Delete') && texte === '' && !contenu.url) {
            // Un champ d'adresse vide : le geste jette la carte tout de suite.
            e.preventDefault()
            e.stopPropagation()
            fait.current = true
            contexte.jeter([element.id])
          }
        }}
      />
    </div>
  )
}

/** L'adresse affichable d'un fichier du tableau (l'image qu'on a donnée à un lien) ; `undefined` tant qu'elle n'est pas là. */
function useAdresseFichier(fichier: Id | undefined, contexte: PropsRendu<Lien>['contexte']): string | undefined {
  const [adresse, setAdresse] = useState<string>()
  const depot = contexte.services.fichiers
  useEffect(() => {
    setAdresse(undefined)
    if (!fichier || !depot) return
    let vivant = true
    depot.adresse(fichier).then(
      (a) => vivant && setAdresse(a ?? undefined),
      () => {},
    )
    return () => {
      vivant = false
    }
  }, [fichier, depot])
  return adresse
}

/** L'image d'aperçu vient de se charger : on garde sa taille avec le lien, pour réserver sa place la fois suivante. */
function retenirDimensions(id: Id, image: string | undefined, largeur: number, hauteur: number, contexte: PropsRendu<Lien>['contexte']) {
  if (contexte.services.lectureSeule || !image || largeur <= 0 || hauteur <= 0) return
  const actuel = contexte.magasin.lire().elements.find((e) => e.id === id)?.contenu
  if (!actuel || actuel.type !== 'lien' || actuel.statut !== 'pret' || actuel.image || actuel.apercu?.image !== image || actuel.apercu.largeur) return
  contexte.magasin.corriger([{ type: 'contenu', id, avant: actuel, apres: { ...actuel, apercu: { ...actuel.apercu, largeur, hauteur } } }])
}

/** Le titre se termine par une espace insécable : jamais un mot seul sur la dernière ligne. */
const sansOrphelin = (titre: string) => titre.replace(/ (\S+)\s*$/, ' $1')

function Carte({ element, choisie, seule, enEdition, contexte, brouillon }: PropsRendu<Lien>) {
  const { contenu } = element
  const { url, statut, apercu } = contenu
  const domaine = domaineDe(url)
  const lecteur = lecteurDe(url)
  // L'image qu'on a donnée à la carte prime sur celle de la page.
  const perso = useAdresseFichier(contenu.image?.fichier, contexte)
  const image = contenu.image ? perso : statut === 'pret' ? apercu?.image : undefined
  // Dans une colonne, la largeur de la carte n'est pas la sienne : le média seul ne s'y décide pas par la largeur.
  const aff = affichage(contenu, element.parent ? undefined : element.largeur)
  const seulMedia = mediaSeul(contenu, element.parent ? undefined : element.largeur)
  const titre = titreDuLien(contenu)
  const legende = contenu.legende ?? (statut === 'pret' && !lecteur ? apercu?.description : undefined)
  const fond = contenu.couleur && contenu.couleur !== 'transparent' ? FOND_NOTE[contenu.couleur] : undefined
  // Entré en édition par un clic sur la légende, on l'écrit ; sinon on renomme. Le choix se fait une fois
  // par édition (le mode strict rejoue l'effet, et le point d'édition ne se lit qu'une fois).
  const [partie, setPartie] = useState<'titre' | 'legende' | null>(null)
  const [debut, setDebut] = useState('')
  const choix = useRef<'titre' | 'legende' | null>(null)
  useLayoutEffect(() => {
    if (!enEdition) {
      choix.current = null
      setDebut('')
      return setPartie(null)
    }
    if (choix.current) return
    const ou = contexte.prendrePointEdition()
    const sous = ou && document.elementFromPoint(ou.x, ou.y)
    choix.current = legendeAEditer.has(element.id) || sous?.closest('.notak-lien-description') || !aff.infos ? 'legende' : 'titre'
    setPartie(choix.current)
    // Un caractère tapé sur la carte choisie ouvre la légende, et en est le premier mot.
    if (choix.current === 'legende') setDebut(prendreAmorce())
  }, [enEdition, contexte, aff.infos, element.id])
  const ecrire = (champ: 'titre' | 'legende', v: string) => brouillon({ ...contenu, [champ]: v })

  // Le domaine ouvre toujours le lien ; le titre tant que la carte n'est pas choisie seule (alors, on le renomme).
  // L'appui va à la toile, qui glisse ou choisit la carte : seul un clic sans mouvement ouvre la page.
  const appui = useRef<{ x: number; y: number } | null>(null)
  const renomme = choisie && !!seule
  const lien = (children: React.ReactNode, classe: string, toujours: boolean) => (
    <a
      className={classe}
      href={url}
      target="_blank"
      rel={REL}
      draggable={false}
      onPointerDown={(e) => void (appui.current = { x: e.clientX, y: e.clientY })}
      onClick={(e) => {
        const a = appui.current
        const glisse = !!a && Math.hypot(e.clientX - a.x, e.clientY - a.y) > 4
        if (glisse || (!toujours && renomme)) e.preventDefault()
        e.stopPropagation()
      }}
    >
      {children}
    </a>
  )

  const montreLegende = partie === 'legende' || (aff.legende && !!legende)
  return (
    <div className="notak-lien">
      {fond && <div className="notak-lien-barre" style={{ background: fond }} />}
      {aff.apercu && (
        <Media
          lecteur={lecteur}
          image={image}
          titre={titre ?? domaine}
          lien={contenu}
          actif={choisie && !!seule}
          bouton={!seulMedia}
          largeur={element.parent ? undefined : element.largeur}
          dimensions={dimensionsApercu(contenu)}
          presentation={!!contexte.services.presentation}
          surDimensions={(largeur, hauteur) => retenirDimensions(element.id, image, largeur, hauteur, contexte)}
        />
      )}
      {(aff.infos || aff.legende || partie) && (
        <div className="notak-lien-texte" data-legende={montreLegende ? '' : undefined}>
          {aff.infos &&
            lien(
              <>
                {apercu?.favicon && statut === 'pret' ? (
                  <img className="notak-lien-favicon" src={apercu.favicon} alt="" draggable={false} referrerPolicy="no-referrer" />
                ) : (
                  <Icone nom="lien" taille={16} />
                )}
                <span>{adresseAffichee(url)}</span>
              </>,
              'notak-lien-domaine',
              true,
            )}
          {partie === 'titre' ? (
            <Champ classe="notak-lien-titre" valeur={titre ?? ''} max={500} toutChoisir ligne ecrire={(v) => ecrire('titre', v)} finir={contexte.finirEdition} />
          ) : (
            aff.infos && titre && lien(sansOrphelin(titre), 'notak-lien-titre', false)
          )}
          {partie === 'legende' ? (
            <Champ classe="notak-lien-description" valeur={legende ?? ''} debut={debut} ecrire={(v) => ecrire('legende', v)} finir={contexte.finirEdition} />
          ) : (
            aff.legende && legende && <div className="notak-lien-description">{legende}</div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Un champ de texte posé à la place du titre ou de la légende, à sa taille, écrit à chaque frappe.
 * Un titre vidé est refusé : l'ancien reste.
 */
function Champ(props: { classe: string; valeur: string; debut?: string; max?: number; toutChoisir?: boolean; ligne?: boolean; ecrire(v: string): void; finir(): void }) {
  const { classe, valeur, debut, max, toutChoisir, ligne, ecrire, finir } = props
  const [texte, setTexte] = useState(valeur + (debut ?? ''))
  // Le caractère qui a ouvert la légende en est déjà écrit.
  useEffect(() => {
    if (debut) ecrire(valeur + debut)
    // Une fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const champ = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const c = champ.current
    if (!c) return
    c.focus()
    if (toutChoisir) c.select()
    else c.setSelectionRange(c.value.length, c.value.length)
  }, [toutChoisir])
  return (
    <textarea
      ref={champ}
      className={`${classe} notak-lien-edition`}
      value={texte}
      maxLength={max}
      rows={1}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = ligne ? e.target.value.replace(/\n/g, ' ') : e.target.value
        setTexte(v)
        ecrire(ligne && !v.trim() ? valeur : v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (ligne || e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          finir()
        }
      }}
    />
  )
}
