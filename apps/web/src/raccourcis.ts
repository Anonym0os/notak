// Ce que la page « Envoyer vers Notak » dit et fabrique : l'adresse d'arrivée, les étapes d'un Raccourci iOS et le
// favori du bureau. Du texte et du code, sans écran : les essais s'y tiennent.

/** Ce que la page montre à la place du jeton tant qu'aucun n'a été créé ici. */
export const JETON_A_REMPLACER = 'VOTRE_JETON'

export const adresseArrivee = (origine: string) => `${origine}/api/arrivee`

/** La valeur de l'en-tête `Authorization`, avec son espace. */
export const enteteAutorisation = (jeton: string) => `Bearer ${jeton}`

const reglagesCommuns = (origine: string, jeton: string, types: string): string[] => [
  `Ouvrez l’app Raccourcis, touchez + pour créer un raccourci, puis touchez son nom en haut pour le renommer : « Envoyer vers Notak ».`,
  `Touchez le bouton de réglages (ⓘ) : activez « Afficher dans la feuille de partage », puis, dans « Types acceptés », ne gardez que ${types}. Touchez OK.`,
  `Ajoutez l’action « Obtenir le contenu de l’URL » (cherchez-la dans la barre de recherche des actions).`,
  `Dans son champ URL, saisissez \`${adresseArrivee(origine)}\`.`,
  `Touchez « Afficher plus » sur l’action, puis réglez « Méthode » sur POST.`,
  `Dans « En-têtes », touchez « Ajouter un nouvel en-tête » : Clé \`Authorization\`, Texte \`${enteteAutorisation(jeton)}\` (le mot Bearer, une espace, puis le jeton).`,
]

/** Un raccourci pour une page, un lien ou un texte partagé depuis Safari ou une autre app. */
export function etapesRaccourciTexte(origine: string, jeton: string): string[] {
  return [
    ...reglagesCommuns(origine, jeton, '« Pages Safari », « URL » et « Texte »'),
    `Dans « Corps de la requête », choisissez JSON, puis touchez « Ajouter un nouveau champ » : choisissez Texte, Clé \`texte\`, et pour la valeur touchez le champ puis choisissez la variable « Entrée du raccourci ».`,
    `Pour savoir que c’est parti, ajoutez à la suite l’action « Afficher la notification » avec le texte « Envoyé vers Notak ». Touchez OK.`,
    `Pour l’utiliser : dans Safari, touchez Partager, faites défiler jusqu’à « Envoyer vers Notak » et touchez-le. S’il n’y est pas, touchez « Modifier les actions » tout en bas de la feuille et ajoutez-le aux favoris.`,
  ]
}

/** Un raccourci pour une photo ou une image partagée depuis Photos ou une autre app. */
export function etapesRaccourciImage(origine: string, jeton: string): string[] {
  const [renommer, reglages, ...suite] = reglagesCommuns(origine, jeton, '« Images »')
  return [
    renommer!.replace('« Envoyer vers Notak »', '« Envoyer une image vers Notak »'),
    reglages!,
    `Ajoutez d’abord l’action « Convertir l’image » et réglez-la sur JPEG : les photos de l’iPhone sont en HEIC, un format que Notak ne lit pas.`,
    ...suite,
    `Dans « Corps de la requête », choisissez Formulaire, puis touchez « Ajouter un nouveau champ » : choisissez Fichier, Clé \`image\`, et pour la valeur touchez le champ puis choisissez la variable « Image convertie ».`,
    `Ajoutez l’action « Afficher la notification » avec le texte « Image envoyée vers Notak », puis touchez OK.`,
    `Pour l’utiliser : dans Photos, ouvrez une photo, touchez Partager, puis « Envoyer une image vers Notak ».`,
  ]
}

/**
 * Le favori du bureau : un lien `javascript:` qui envoie la page ouverte (son adresse, son titre, et le texte
 * sélectionné s'il y en a). Quand le site de la page interdit l'appel (certains le font), il ouvre à la place la page
 * de partage de Notak, qui utilise la session du navigateur.
 */
export function favori(origine: string, jeton: string): string {
  const code = `(() => {
  const o = ${JSON.stringify(origine)};
  const donnees = { url: location.href, titre: document.title, texte: String(getSelection() || '') };
  const dire = (m) => {
    const d = document.createElement('div');
    d.textContent = m;
    d.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;padding:10px 14px;border-radius:8px;background:#1d2733;color:#fff;font:14px system-ui,sans-serif';
    document.body.append(d);
    setTimeout(() => d.remove(), 2500);
  };
  fetch(o + '/api/arrivee', { method: 'POST', headers: { Authorization: ${JSON.stringify(enteteAutorisation(jeton))}, 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); dire('Envoyé vers Notak'); })
    .catch(() => open(o + '/partage?' + new URLSearchParams({ titre: donnees.titre, adresse: donnees.url, texte: donnees.texte }), '_blank', 'width=480,height=360'));
})()`
  return 'javascript:' + code.replace(/\s*\n\s*/g, ' ')
}
