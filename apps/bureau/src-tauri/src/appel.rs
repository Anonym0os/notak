/// Ce qu'un appel de la page apporte à la coque, et ce qu'elle lui répond quand elle refuse. Rien de ce qui vient de
/// la page n'est cru sur parole : qui appelle se lit à l'adresse de la page, et les octets comme le nom d'un fichier
/// sont relus ici avant de servir.
use std::borrow::Cow;

use serde::Serialize;
use tauri::http::HeaderMap;
use tauri::ipc::InvokeBody;
use tauri::Webview;

use crate::navigation::{Appelant, Origines};

/// Une erreur que la page sait lire : `{ code }`, et l'adresse proposée pour `redirige` (`apps/web/src/bureau.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum Erreur {
    /// Ce n'est pas une adresse, ou pas celle d'un serveur (identifiants, paramètres, IPv6…).
    AdresseInvalide,
    /// Du HTTP simple ailleurs que sur cet ordinateur.
    HttpsRequis,
    /// Une adresse avec un chemin : un serveur Notak se joint à sa racine.
    Chemin,
    Injoignable,
    Certificat,
    Delai,
    /// Il répond, mais ce n'est pas Notak.
    PasNotak,
    /// Un serveur Notak d'avant l'app de bureau (`/api/instance` sans `/api/sante`).
    TropAncien,
    /// Le serveur se dit ailleurs : on propose son adresse, on n'y va pas seul.
    Redirige { vers: String },
    /// Une sorte de fichier que la coque n'ouvre pas dans une autre application.
    TypeRefuse,
    TropGros,
    /// Trop de fichiers ouverts coup sur coup.
    TropVite,
    /// Un fichier ouvert qui n'est plus (ou pas pour cette page).
    Introuvable,
    /// Des octets ou des arguments que la coque ne sait pas lire.
    Illisible,
    /// Cette page n'a pas le droit de demander cela.
    Interdit,
    /// Le système a refusé (un disque plein, un dossier interdit).
    Echec { message: String },
}

impl Erreur {
    pub fn echec(e: impl std::fmt::Display) -> Self {
        Erreur::Echec { message: e.to_string() }
    }
}

/// Qui appelle, s'il est de ceux que la commande sert ; sinon `Interdit`. La capacité de Tauri a déjà filtré par
/// origine ; ceci écarte en plus un serveur joint plus tôt, qui garde la sienne jusqu'au redémarrage.
pub fn exiger(webview: &Webview, garde: &Origines, permis: &[Appelant]) -> Result<Appelant, Erreur> {
    let appelant = webview.url().map(|u| garde.appelant(&u)).unwrap_or(Appelant::Autre);
    if appelant != Appelant::Autre && permis.contains(&appelant) {
        Ok(appelant)
    } else {
        Err(Erreur::Interdit)
    }
}

/// La réponse des commandes plus anciennes, dont les erreurs sont des phrases, à une page qu'elles ne servent pas.
pub const REFUSE: &str = "appel refusé : cette page n'est ni Notak ni le serveur choisi";

/// Les deux pages que la coque sert : l'application et le serveur choisi.
pub const LOCALE_OU_SERVEUR: &[Appelant] = &[Appelant::Locale, Appelant::Serveur];
pub const LOCALE: &[Appelant] = &[Appelant::Locale];
/// La photo de la fenêtre, pour un signalement (macOS seulement).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const SERVEUR: &[Appelant] = &[Appelant::Serveur];

/// Les octets d'un appel. Ils viennent bruts par le canal de Tauri ; mais une page dont la CSP le bloque (ou une
/// webview qui le refuse) passe par `postMessage`, et ses octets arrivent en tableau JSON de nombres.
pub fn octets(corps: &InvokeBody) -> Result<Cow<'_, [u8]>, Erreur> {
    match corps {
        InvokeBody::Raw(o) => Ok(Cow::Borrowed(o)),
        InvokeBody::Json(serde_json::Value::Array(nombres)) => nombres
            .iter()
            .map(|n| n.as_u64().and_then(|n| u8::try_from(n).ok()).ok_or(Erreur::Illisible))
            .collect::<Result<Vec<u8>, _>>()
            .map(Cow::Owned),
        InvokeBody::Json(_) => Err(Erreur::Illisible),
    }
}

/// Le nom d'un fichier, tel que la page l'envoie (`x-notak-nom`, en `encodeURIComponent`) : décodé, pas encore
/// nettoyé (`fichiers::nom_sur`). Illisible, il est vide.
pub fn nom_envoye(entetes: &HeaderMap) -> String {
    entetes
        .get("x-notak-nom")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| percent_encoding::percent_decode_str(v).decode_utf8().ok().map(Cow::into_owned))
        .unwrap_or_default()
}

#[cfg(test)]
mod essais {
    use super::*;
    use serde_json::json;

    #[test]
    fn une_erreur_se_lit_a_son_code() {
        assert_eq!(serde_json::to_value(Erreur::AdresseInvalide).unwrap(), json!({ "code": "adresse_invalide" }));
        assert_eq!(serde_json::to_value(Erreur::PasNotak).unwrap(), json!({ "code": "pas_notak" }));
        assert_eq!(serde_json::to_value(Erreur::TypeRefuse).unwrap(), json!({ "code": "type_refuse" }));
        assert_eq!(
            serde_json::to_value(Erreur::Redirige { vers: "https://notak.exemple.fr".into() }).unwrap(),
            json!({ "code": "redirige", "vers": "https://notak.exemple.fr" })
        );
        assert_eq!(serde_json::to_value(Erreur::echec("disque plein")).unwrap(), json!({ "code": "echec", "message": "disque plein" }));
    }

    #[test]
    fn des_octets_bruts_ou_en_tableau() {
        assert_eq!(&*octets(&InvokeBody::Raw(vec![1, 2, 255])).unwrap(), &[1, 2, 255]);
        assert_eq!(&*octets(&InvokeBody::Json(json!([0, 128, 255]))).unwrap(), &[0, 128, 255]);
        assert_eq!(&*octets(&InvokeBody::Json(json!([]))).unwrap(), &[] as &[u8]);
        for mauvais in [json!([256]), json!([-1]), json!([1.5]), json!(["1"]), json!({ "0": 1 }), json!(null), json!("abc")] {
            assert_eq!(octets(&InvokeBody::Json(mauvais.clone())), Err(Erreur::Illisible), "{mauvais}");
        }
    }

    #[test]
    fn le_nom_envoye_est_decode() {
        let mut e = HeaderMap::new();
        assert_eq!(nom_envoye(&e), "");
        e.insert("x-notak-nom", "Re%CC%81union%20%C3%A9t%C3%A9.pdf".parse().unwrap());
        assert_eq!(nom_envoye(&e), "Re\u{301}union été.pdf");
        e.insert("x-notak-nom", "%FF%FE.pdf".parse().unwrap());
        assert_eq!(nom_envoye(&e), "");
        e.insert("x-notak-nom", "..%2F..%2Fetc%2Fpasswd".parse().unwrap());
        assert_eq!(nom_envoye(&e), "../../etc/passwd");
    }
}
