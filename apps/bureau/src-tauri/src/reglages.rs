/// Les réglages de la coque, dans `bureau.json` (le dossier de configuration de l'app) : où s'ouvre Notak, le
/// serveur retenu, et la recherche automatique des mises à jour. Ils sont à la coque, pas à une page : la page
/// embarquée et celle d'un serveur n'ont pas le même stockage.
///
/// Le fichier est relu sans confiance : illisible, trop gros ou abîmé, il vaut les réglages par défaut ; un serveur
/// qui n'est pas une adresse permise (`acces::normaliser`) est oublié. Il s'écrit par un fichier voisin posé d'un
/// coup, une écriture à la fois : une coupure en route ne laisse jamais un fichier à moitié écrit, et deux changements
/// rapprochés ne se marchent pas dessus.
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::acces::normaliser;

/// Au-delà, ce n'est pas un fichier de réglages.
const TAILLE_MAX: u64 = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ouvrir {
    /// Les toiles de cet ordinateur, l'édition embarquée.
    Local,
    /// Le serveur retenu.
    Serveur,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reglages {
    pub ouvrir: Ouvrir,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serveur: Option<String>,
    pub maj_auto: bool,
}

impl Default for Reglages {
    fn default() -> Self {
        Self { ouvrir: Ouvrir::Local, serveur: None, maj_auto: true }
    }
}

impl Reglages {
    /// Relit un fichier de réglages : chaque valeur absente ou douteuse prend sa valeur par défaut.
    pub fn lire(texte: &str) -> Self {
        let Ok(Value::Object(v)) = serde_json::from_str::<Value>(texte) else { return Self::default() };
        let serveur = v.get("serveur").and_then(Value::as_str).and_then(|s| normaliser(s).ok());
        let ouvrir = match v.get("ouvrir").and_then(Value::as_str) {
            Some("serveur") if serveur.is_some() => Ouvrir::Serveur,
            _ => Ouvrir::Local,
        };
        Self { ouvrir, serveur, maj_auto: v.get("majAuto").and_then(Value::as_bool).unwrap_or(true) }
    }

    pub fn texte(&self) -> String {
        serde_json::to_string_pretty(self).expect("des réglages se sérialisent toujours") + "\n"
    }
}

/// Lit le fichier, s'il existe et reste raisonnable.
pub fn charger(chemin: &Path) -> Reglages {
    let mut texte = String::new();
    match std::fs::File::open(chemin) {
        Ok(f) if f.metadata().is_ok_and(|m| m.is_file() && m.len() <= TAILLE_MAX) => {
            if f.take(TAILLE_MAX).read_to_string(&mut texte).is_err() {
                return Reglages::default();
            }
            Reglages::lire(&texte)
        }
        _ => Reglages::default(),
    }
}

/// Écrit le fichier d'un coup : un voisin provisoire, puis renommé à sa place.
pub fn ecrire(chemin: &Path, reglages: &Reglages) -> std::io::Result<()> {
    if let Some(dossier) = chemin.parent() {
        std::fs::create_dir_all(dossier)?;
    }
    let mut provisoire = chemin.as_os_str().to_owned();
    provisoire.push(".tmp");
    let provisoire = PathBuf::from(provisoire);
    std::fs::write(&provisoire, reglages.texte()).and_then(|_| std::fs::rename(&provisoire, chemin)).inspect_err(|_| {
        let _ = std::fs::remove_file(&provisoire);
    })
}

/// Les réglages en mémoire, et le fichier où ils vivent (aucun si le système ne donne pas de dossier de configuration :
/// ils valent alors le temps de la session).
pub struct Reglage {
    chemin: Option<PathBuf>,
    courant: Mutex<Reglages>,
    /// Tenu de la retouche jusqu'au fichier posé : les écritures passent dans l'ordre des changements, et la dernière
    /// sur le disque est toujours la plus récente (elles partagent leur fichier provisoire).
    ecriture: Mutex<()>,
}

impl Reglage {
    pub fn new(chemin: Option<PathBuf>) -> Self {
        let courant = chemin.as_deref().map(charger).unwrap_or_default();
        Self { chemin, courant: Mutex::new(courant), ecriture: Mutex::new(()) }
    }

    pub fn lire(&self) -> Reglages {
        self.courant.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    /// Change les réglages, en mémoire tout de suite, puis sur le disque.
    pub fn changer(&self, f: impl FnOnce(&mut Reglages)) -> std::io::Result<()> {
        let _ecriture = self.ecriture.lock().unwrap_or_else(PoisonError::into_inner);
        let nouveaux = {
            let mut r = self.courant.lock().unwrap_or_else(PoisonError::into_inner);
            f(&mut r);
            r.clone()
        };
        match &self.chemin {
            Some(c) => ecrire(c, &nouveaux),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn par_defaut_les_toiles_de_cet_ordinateur() {
        let d = Reglages::default();
        assert_eq!((d.ouvrir, d.serveur.as_deref(), d.maj_auto), (Ouvrir::Local, None, true));
        for texte in ["", "pas du json", "[]", "null", "42", "{\"ouvrir\": 3}", "{\"majAuto\": \"non\"}"] {
            assert_eq!(Reglages::lire(texte), d, "{texte}");
        }
    }

    #[test]
    fn un_fichier_abime_ne_garde_que_ce_qui_tient() {
        let r = Reglages::lire(r#"{ "ouvrir": "serveur", "serveur": "https://notak.exemple.fr", "majAuto": false, "autre": 1 }"#);
        assert_eq!(r, Reglages { ouvrir: Ouvrir::Serveur, serveur: Some("https://notak.exemple.fr".into()), maj_auto: false });
        // Une adresse normalisée à la lecture : on ne fait confiance qu'à ce qu'on aurait accepté.
        assert_eq!(Reglages::lire(r#"{ "serveur": "NOTAK.exemple.fr" }"#).serveur.as_deref(), Some("https://notak.exemple.fr"));
        for douteux in ["http://notak.exemple.fr", "https://notak.exemple.fr/chemin", "javascript:alert(1)", "https://moi:secret@notak.exemple.fr"] {
            let r = Reglages::lire(&format!(r#"{{ "ouvrir": "serveur", "serveur": "{douteux}" }}"#));
            assert_eq!((r.ouvrir, r.serveur), (Ouvrir::Local, None), "{douteux}");
        }
        // Ouvrir sur un serveur, sans serveur : chez soi.
        assert_eq!(Reglages::lire(r#"{ "ouvrir": "serveur" }"#).ouvrir, Ouvrir::Local);
        assert_eq!(Reglages::lire(r#"{ "ouvrir": "ailleurs", "serveur": "https://notak.exemple.fr" }"#).ouvrir, Ouvrir::Local);
    }

    #[test]
    fn ecrire_puis_relire() {
        let dossier = std::env::temp_dir().join(format!("notak-reglages-{}", std::process::id()));
        let chemin = dossier.join("sous").join("bureau.json");
        let r = Reglages { ouvrir: Ouvrir::Serveur, serveur: Some("https://notak.exemple.fr:8443".into()), maj_auto: false };
        ecrire(&chemin, &r).unwrap();
        assert_eq!(charger(&chemin), r);
        let texte = std::fs::read_to_string(&chemin).unwrap();
        assert!(texte.contains("\"majAuto\": false"), "{texte}");
        assert!(!dossier.join("sous").join("bureau.json.tmp").exists());

        let reglage = Reglage::new(Some(chemin.clone()));
        assert_eq!(reglage.lire(), r);
        reglage.changer(|r| {
            r.ouvrir = Ouvrir::Local;
            r.serveur = None;
        })
        .unwrap();
        assert_eq!(std::fs::read_to_string(&chemin).unwrap(), "{\n  \"ouvrir\": \"local\",\n  \"majAuto\": false\n}\n");

        // Trop gros : ce n'est pas un fichier de réglages.
        std::fs::write(&chemin, format!("{{\"majAuto\": false, \"x\": \"{}\"}}", "a".repeat(TAILLE_MAX as usize))).unwrap();
        assert_eq!(charger(&chemin), Reglages::default());
        assert_eq!(charger(&dossier.join("absent.json")), Reglages::default());
        assert_eq!(charger(&dossier), Reglages::default());
        std::fs::remove_dir_all(&dossier).unwrap();
    }

    #[test]
    fn des_changements_rapproches_laissent_le_dernier_sur_le_disque() {
        let dossier = std::env::temp_dir().join(format!("notak-reglages-concurrents-{}", std::process::id()));
        let chemin = dossier.join("bureau.json");
        let reglage = std::sync::Arc::new(Reglage::new(Some(chemin.clone())));
        let fils: Vec<_> = (0..8)
            .map(|i| {
                let r = reglage.clone();
                std::thread::spawn(move || {
                    for _ in 0..20 {
                        r.changer(|x| x.maj_auto = i % 2 == 0).unwrap();
                    }
                })
            })
            .collect();
        for f in fils {
            f.join().unwrap();
        }
        // Le fichier entier, et ce qu'on a en mémoire : rien de tronqué, rien d'un instantané plus ancien.
        assert_eq!(charger(&chemin), reglage.lire());
        assert_eq!(std::fs::read_to_string(&chemin).unwrap(), reglage.lire().texte());
        std::fs::remove_dir_all(&dossier).unwrap();
    }
}
