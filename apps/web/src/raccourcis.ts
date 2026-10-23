// Ce que la page « Envoyer vers Notak » dit et fabrique : l'adresse d'arrivée, les étapes d'un Raccourci iOS et le
// favori du bureau. Du texte et du code, sans écran : les essais s'y tiennent.
import { t } from './langue'

/** Ce que la page montre à la place du jeton tant qu'aucun n'a été créé ici. */
export const JETON_A_REMPLACER = 'VOTRE_JETON'

export const adresseArrivee = (origine: string) => `${origine}/api/arrivee`

/** La valeur de l'en-tête `Authorization`, avec son espace. */
export const enteteAutorisation = (jeton: string) => `Bearer ${jeton}`

const reglagesCommuns = (origine: string, jeton: string, nom: string, types: string): string[] => [
  t('ios.renommer', { nom }),
  t('ios.reglages', { types }),
  t('ios.obtenir'),
  t('ios.url', { adresse: adresseArrivee(origine) }),
  t('ios.methode'),
  t('ios.entetes', { entete: enteteAutorisation(jeton) }),
]

/** Un raccourci pour une page, un lien ou un texte partagé depuis Safari ou une autre app. */
export function etapesRaccourciTexte(origine: string, jeton: string): string[] {
  return [
    ...reglagesCommuns(origine, jeton, t('ios.nomTexte'), t('ios.typesTexte')),
    t('ios.corpsJson'),
    t('ios.notifTexte'),
    t('ios.usageTexte'),
  ]
}

/** Un raccourci pour une photo ou une image partagée depuis Photos ou une autre app. */
export function etapesRaccourciImage(origine: string, jeton: string): string[] {
  const [renommer, reglages, ...suite] = reglagesCommuns(origine, jeton, t('ios.nomImage'), t('ios.typesImage'))
  return [renommer!, reglages!, t('ios.convertir'), ...suite, t('ios.corpsFormulaire'), t('ios.notifImage'), t('ios.usageImage')]
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
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); dire(${JSON.stringify(t('ios.favoriEnvoye'))}); })
    .catch(() => open(o + '/partage?' + new URLSearchParams({ titre: donnees.titre, adresse: donnees.url, texte: donnees.texte }), '_blank', 'width=480,height=360'));
})()`
  return 'javascript:' + code.replace(/\s*\n\s*/g, ' ')
}
