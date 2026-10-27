/// Ce qu'un appel de la page apporte à la coque, et ce qu'elle lui répond quand elle refuse. Rien de ce qui vient de
/// la page n'est cru sur parole : qui appelle se lit à l'adresse de la page, et les octets comme le nom d'un fichier
/// sont relus ici avant de servir.
use std::borrow::Cow;
use std::collections::VecDeque;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::http::HeaderMap;
use tauri::ipc::InvokeBody;
use tauri::{Manager, Webview};

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
    /// Joint par son adresse publique, le serveur se dit sur cet ordinateur (`http://localhost:3005`) : son
    /// administrateur n'a pas réglé `NOTAK_ORIGINE`.
    MalRegle,
    /// Une sorte de fichier que la coque n'ouvre pas dans une autre application.
    TypeRefuse,
    TropGros,
    /// Trop de fichiers ouverts coup sur coup, ou une question déjà posée à la personne.
    TropVite,
    /// La file des fichiers qui attendent la page est pleine (`fichiers::FILE_MAX`).
    FilePleine,
    /// Un fichier ouvert qui n'est plus (ou pas pour cette page).
    Introuvable,
    /// Des octets ou des arguments que la coque ne sait pas lire.
    Illisible,
    /// Cette page n'a pas le droit de demander cela.
    Interdit,
    /// La personne a choisi autre chose pendant qu'on joignait le serveur (`annuler_jonction`), ou a refusé d'ouvrir un
    /// fichier venu d'un serveur.
    Annule,
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
#[cfg(desktop)]
pub fn exiger(webview: &Webview, garde: &Origines, permis: &[Appelant]) -> Result<Appelant, Erreur> {
    // Entre deux pages (`acces::Passage`), personne n'appelle : ce qui arrive là est une requête de la page d'avant,
    // rejouée par Tauri et prise pour celle d'après.
    if webview.app_handle().state::<crate::acces::Passage>().en_cours() {
        return Err(Erreur::Interdit);
    }
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
/// La photo de la fenêtre pour un signalement (macOS), et les pages du serveur ouvertes dans le navigateur.
pub const SERVEUR: &[Appelant] = &[Appelant::Serveur];

/// Combien de fois une chose se fait coup sur coup : `max` au plus dans toute fenêtre de `duree`. Une personne qui
/// clique n'en fait pas plus ; une page qui s'emballe (ou un serveur malveillant) ne va pas au-delà.
pub struct Cadence {
    max: usize,
    duree: Duration,
    recentes: Mutex<VecDeque<Instant>>,
}

impl Cadence {
    pub const fn new(max: usize, duree: Duration) -> Self {
        Self { max, duree, recentes: Mutex::new(VecDeque::new()) }
    }

    /// Encore une, maintenant ? Celle qui passe compte.
    pub fn permise(&self, maintenant: Instant) -> bool {
        let mut recentes = self.recentes.lock().unwrap_or_else(PoisonError::into_inner);
        while recentes.front().is_some_and(|t| maintenant.duration_since(*t) >= self.duree) {
            recentes.pop_front();
        }
        if recentes.len() >= self.max {
            return false;
        }
        recentes.push_back(maintenant);
        true
    }
}

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
        assert_eq!(serde_json::to_value(Erreur::FilePleine).unwrap(), json!({ "code": "file_pleine" }));
        assert_eq!(serde_json::to_value(Erreur::MalRegle).unwrap(), json!({ "code": "mal_regle" }));
        assert_eq!(
            serde_json::to_value(Erreur::Redirige { vers: "https://notak.exemple.fr".into() }).unwrap(),
            json!({ "code": "redirige", "vers": "https://notak.exemple.fr" })
        );
        assert_eq!(serde_json::to_value(Erreur::echec("disque plein")).unwrap(), json!({ "code": "echec", "message": "disque plein" }));
    }

    #[test]
    fn coup_sur_coup_mais_pas_sans_fin() {
        let c = Cadence::new(3, Duration::from_secs(10));
        let t = Instant::now();
        for i in 0..3 {
            assert!(c.permise(t + Duration::from_millis(i)), "{i}");
        }
        assert!(!c.permise(t + Duration::from_secs(1)));
        // La plus ancienne passée, une place se libère, une seule.
        assert!(c.permise(t + Duration::from_secs(10)));
        assert!(!c.permise(t + Duration::from_secs(10)));
        // Un refus ne compte pas : la fenêtre ne se prolonge pas d'elle-même.
        assert!(c.permise(t + Duration::from_secs(20)));
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
