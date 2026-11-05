/**
 * Un morceau de l'application qui ne se charge pas : le plus souvent, une page d'avant le dernier déploiement, gardée par
 * le navigateur, qui réclame des fichiers qui n'existent plus (le serveur dit 404). Sans rattrapage, l'écran d'attente
 * reste là pour toujours ; dans l'app d'iPhone, la coque finit par dire que le serveur n'a pas répondu.
 *
 * On recharge la page, une fois : le navigateur revérifie la page, qui arrive à jour avec les bons fichiers. Si ça
 * manque encore peu après, on n'insiste pas (une boucle de rechargements) : l'écran le dit, avec de quoi réessayer.
 *
 * Ce module reste à part et sans dépendance : il sert quand le reste de l'app n'a pas pu venir. Ses deux phrases sont
 * donc ici, et non dans `langue.ts`, qui tire la toile avec lui.
 */

const CLE = 'notak:rechargement-apres-echec'
/** Un second échec dans ce délai après le rechargement : ce n'était pas une page périmée, on s'arrête là. */
export const DELAI_MS = 60_000

const TEXTES = {
  fr: { titre: 'Notak n’a pas pu se charger', aide: 'Vérifiez votre connexion, puis réessayez.', bouton: 'Réessayer' },
  en: { titre: 'Notak couldn’t load', aide: 'Check your connection, then try again.', bouton: 'Try again' },
}

type Depot = Pick<Storage, 'getItem' | 'setItem'>

function depot(fenetre: Window): Depot | null {
  try {
    return fenetre.sessionStorage
  } catch {
    return null
  }
}

/** Vrai si un rechargement de rattrapage vient d'avoir lieu (dans `DELAI_MS`). */
export function dejaRecharge(d: Depot | null, maintenant: number): boolean {
  try {
    const quand = Number(d?.getItem(CLE))
    return Number.isFinite(quand) && quand > 0 && maintenant - quand < DELAI_MS
  } catch {
    return false
  }
}

let rattrape = false

/** Le chargement a échoué : on recharge une fois, sinon on le dit. Rien de plus si c'est déjà fait pour cette page. */
export function rattraperChargement(fenetre: Window = window, maintenant = Date.now()): void {
  if (rattrape) return
  rattrape = true
  const d = depot(fenetre)
  // Sans stockage, pas de garde contre une boucle : on montre l'écran plutôt que de recharger sans fin.
  if (d && !dejaRecharge(d, maintenant)) {
    try {
      d.setItem(CLE, String(maintenant))
      fenetre.location.reload()
      return
    } catch {
      // Le stockage refuse d'écrire : même chose.
    }
  }
  montrerEchec(fenetre)
}

/** L'écran d'échec, à la place de l'écran d'attente, au même fond. */
export function montrerEchec(fenetre: Window): void {
  const document = fenetre.document
  const langue = (document.documentElement.lang || fenetre.navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const textes = TEXTES[langue]
  const sombre = document.querySelector('.ecran-attente')?.getAttribute('data-theme') === 'sombre'
  const ecran = document.createElement('div')
  ecran.setAttribute('role', 'alert')
  ecran.className = 'ecran-echec'
  ecran.style.cssText = `position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;font:16px/1.4 system-ui,sans-serif;background:${sombre ? '#1b1e23' : '#ebedee'};color:${sombre ? '#e3e5e9' : '#323b4a'}`
  const titre = document.createElement('strong')
  titre.textContent = textes.titre
  const aide = document.createElement('span')
  aide.textContent = textes.aide
  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.textContent = textes.bouton
  bouton.style.cssText = `margin-top:8px;min-height:44px;padding:0 20px;border:0;border-radius:22px;font:inherit;font-weight:600;background:${sombre ? '#e3e5e9' : '#323b4a'};color:${sombre ? '#1b1e23' : '#fff'}`
  bouton.addEventListener('click', () => fenetre.location.reload())
  ecran.append(titre, aide, bouton)
  const racine = document.getElementById('racine') ?? document.body
  racine.replaceChildren(ecran)
}

/**
 * Le rattrapage branché sur la page : un `import()` refusé le demande (`main.tsx`), et Vite signale de lui-même un
 * fichier préchargé qui manque (`vite:preloadError`), qu'on empêche alors de lever une erreur que personne n'attrape.
 */
export function brancherRattrapage(fenetre: Window = window): void {
  fenetre.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    rattraperChargement(fenetre)
  })
}
