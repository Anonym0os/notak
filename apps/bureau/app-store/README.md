# La fiche App Store de Notak

Tout ce qu'App Store Connect demande, en fichiers, dans la disposition que lit `fastlane deliver`
(`metadata/<langue>/<champ>.txt`) : on relit et on corrige ici, un essai vérifie les longueurs
(`scripts/app-store.test.ts`), et une commande envoie le tout. Les captures vont dans `screenshots/<langue>/`
(phase 6 de `docs/IOS.md` : `scripts/captures-ios.ts` les fabrique sur les simulateurs).

| Fichier | Limite | Note |
|---|---|---|
| `name.txt` | 30 | « Notak » : vérifier la disponibilité dans App Store Connect avant tout |
| `subtitle.txt` | 30 | |
| `promotional_text.txt` | 170 | se change sans nouvelle version : la nouveauté du moment |
| `description.txt` | 4 000 | |
| `keywords.txt` | 100 octets | séparés par des virgules, sans espace après |
| `release_notes.txt` | 4 000 | « Nouveautés » : la section de la version dans `docs/NOUVEAUTES.md` |
| `support_url.txt`, `marketing_url.txt`, `privacy_url.txt` | | pages d'`apps/site/public` (`/aide`, `/`, `/confidentialite`) |
| `primary_category.txt`, `secondary_category.txt` | | Productivité, Graphisme et design |
| `copyright.txt` | | |
| `review_information/` | | notes au relecteur ; `demo_user.txt` et `demo_password.txt` restent vides dans le dépôt et se remplissent au moment d'envoyer |

## Ce qu'on répond au questionnaire « App Privacy »

**« Non, nous ne collectons pas de données depuis cette app. »** Nous n'exploitons aucun serveur : les toiles restent
sur l'appareil ; une copie `.notak` va où la personne la met ; un dossier iCloud Drive est le sien ; un serveur Notak
est celui qu'elle configure (comme un client mail). Ce qui sort de l'appareil, à sa demande, est dit dans
`docs/PUBLIER.md` et sur `/confidentialite` : OpenStreetMap pour la carte d'un lieu, l'éditeur d'un lien collé pour
son lecteur, le site d'une image posée par son adresse. Aucune de ces requêtes ne passe par nous ; Apple tient pour
« non collectée » une donnée qui n'est traitée que sur l'appareil ou envoyée à un service que la personne choisit.

## Classification, prix, droits

- Classification par âge : 4+ (rien dans le questionnaire ne s'applique).
- Prix : gratuit, sans achat intégré.
- `ITSAppUsesNonExemptEncryption = NO` (déjà dans `Info.ios.plist`) : rien d'autre que le HTTPS du système.
- Disponibilité : tous les pays.

## Envoyer

```sh
# depuis apps/bureau/app-store, sur le Mac, avec une clé App Store Connect (APP_STORE_CONNECT_API_KEY_*) :
fastlane deliver --metadata_path metadata --screenshots_path screenshots --skip_binary_upload --force
```

L'IPA, lui, part de la CI (`publier-bureau.yml`, tâche `ios`) par `xcrun altool --upload-app`.
