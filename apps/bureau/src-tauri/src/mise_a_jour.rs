/// Les mises à jour de Notak de bureau : la coque demande s'il existe une version plus récente, la télécharge, vérifie
/// sa signature, et la pose quand la personne redémarre, ou à défaut quand elle quitte l'application.
///
/// - **Qui signe** : chaque version publiée est signée (minisign, Ed25519) par la clé privée du projet, qui ne vit que
///   dans les secrets de la publication sur GitHub (`docs/MISES-A-JOUR.md`). La clé publique est dans la configuration
///   de l'app (`tauri.publication.json`) : un paquet qu'elle ne vérifie pas n'est jamais installé.
/// - **Pas de retour en arrière** : seule une version plus récente s'installe, et la signature porte le numéro de la
///   version (`requireSignedVersion`) : une réponse trafiquée ne peut pas faire passer un vieux paquet pour un neuf.
/// - **La page ne commande rien** : elle demande « y a-t-il du neuf ? » et « installe », sans pouvoir choisir l'adresse,
///   la version ni la clé ; la page embarquée comme celle du serveur choisi, puisque c'est la même coque. Une coque
///   construite à la main n'a pas de configuration de mise à jour : elle le dit (`Indisponible`) et ne cherche rien.
/// - **Une fois toutes les quelques heures** : une page qui se charge (passer des toiles d'ici à un serveur, recharger)
///   ne redemande pas à GitHub ce qu'on y a appris il y a peu ; « Rechercher maintenant » le redemande.
/// - **Un échec se dit par un code** (`EchecMaj`), que la page dit dans sa langue ; le détail va au journal.
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, State, Webview};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::appel::{exiger, LOCALE_OU_SERVEUR};
use crate::navigation::Origines;

/// Lire `latest.json` : quelques kilo-octets.
const DELAI_RECHERCHE: Duration = Duration::from_secs(60);
/// Télécharger le paquet (85 Mo pour l'AppImage) : de quoi passer sur une connexion lente (1 Mbit/s), pas sans fin.
const DELAI_TELECHARGEMENT: Duration = Duration::from_secs(15 * 60);
/// Une réponse « à jour » vaut ce temps-là pour les recherches automatiques : un peu moins que l'intervalle de la page
/// (six heures, `MiseAJour.tsx`), pour que son rappel suivant cherche vraiment.
const VALIDITE: Duration = Duration::from_secs(5 * 3600);

/// Une mise à jour téléchargée et vérifiée, prête à poser.
struct Prete {
    update: Update,
    octets: Vec<u8>,
}

pub struct MisesAJour {
    /// Cette construction sait se mettre à jour : elle porte une clé publique et une adresse (`plugins.updater`).
    active: bool,
    prete: Mutex<Option<Prete>>,
    /// Une seule recherche à la fois : deux demandes rapprochées ne téléchargent pas deux fois.
    recherche: tauri::async_runtime::Mutex<()>,
    /// Quand GitHub a dit pour la dernière fois qu'il n'y avait rien de neuf.
    a_jour: Mutex<Option<SystemTime>>,
}

impl MisesAJour {
    pub fn new(active: bool) -> Self {
        Self { active, prete: Mutex::new(None), recherche: tauri::async_runtime::Mutex::new(()), a_jour: Mutex::new(None) }
    }

    /// La dernière réponse « à jour », si elle date de moins de `VALIDITE` (une horloge qui recule la périme).
    fn a_jour_recent(&self, maintenant: SystemTime) -> Option<SystemTime> {
        let t = (*self.a_jour.lock().ok()?)?;
        maintenant.duration_since(t).is_ok_and(|age| age < VALIDITE).then_some(t)
    }
}

/// Ce que la page apprend : la version qui tourne, et ce qui attend d'être installé.
#[derive(Serialize)]
#[serde(tag = "etat", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum Etat {
    /// Cette app ne se met pas à jour seule : construite à la main.
    Indisponible { version: String },
    /// `verifie` : quand GitHub l'a dit, en millisecondes depuis 1970.
    AJour { version: String, verifie: u64 },
    Prete { version: String, nouvelle: String, notes: Option<String>, date: Option<String> },
}

/// Ce qui a fait échouer une recherche ou une installation, tel que la page le dit (`MiseAJour.tsx`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum EchecMaj {
    /// GitHub ne répond pas, ou pas comme il faut : le réseau, le plus souvent.
    Reseau,
    /// Trop long : la recherche, ou le téléchargement.
    Delai,
    /// Le paquet ne porte pas la signature attendue : il n'est pas installé.
    Signature,
    /// Notak ne peut pas se remplacer là où il est (une image disque, un dossier en lecture seule, l'accord refusé).
    Emplacement,
    EspaceDisque,
    /// Cette page n'a pas le droit de le demander.
    Interdit,
    Autre,
}

/// Le code d'une erreur de l'outil de mise à jour ; son détail, souvent en anglais, va au journal.
fn classer(e: &tauri_plugin_updater::Error) -> EchecMaj {
    use tauri_plugin_updater::Error as E;
    match e {
        E::Minisign(_) | E::Base64(_) | E::SignatureUtf8(_) | E::SignedVersionMismatch { .. } | E::MissingSignedVersion => EchecMaj::Signature,
        E::Reqwest(r) if r.is_timeout() => EchecMaj::Delai,
        E::Reqwest(_) | E::Network(_) | E::ReleaseNotFound => EchecMaj::Reseau,
        E::Io(io) => classer_io(io.kind()),
        E::TempDirNotOnSameMountPoint | E::TempDirNotFound | E::FailedToDetermineExtractPath | E::AuthenticationFailed => EchecMaj::Emplacement,
        _ => EchecMaj::Autre,
    }
}

fn classer_io(sorte: std::io::ErrorKind) -> EchecMaj {
    use std::io::ErrorKind as K;
    match sorte {
        K::StorageFull | K::QuotaExceeded => EchecMaj::EspaceDisque,
        K::PermissionDenied | K::ReadOnlyFilesystem | K::CrossesDevices => EchecMaj::Emplacement,
        K::TimedOut => EchecMaj::Delai,
        _ => EchecMaj::Autre,
    }
}

fn echec(quoi: &str, e: tauri_plugin_updater::Error) -> EchecMaj {
    eprintln!("Notak : {quoi} ({e})");
    classer(&e)
}

fn millisecondes(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis().try_into().unwrap_or(u64::MAX))
}

fn etat_pret(app: &AppHandle, update: &Update) -> Etat {
    Etat::Prete {
        version: app.package_info().version.to_string(),
        nouvelle: update.version.clone(),
        notes: update.body.clone().filter(|n| !n.trim().is_empty()),
        date: update.raw_json.get("pub_date").and_then(|d| d.as_str()).map(str::to_string),
    }
}

/// Cherche une version plus récente et, s'il y en a une, la télécharge et vérifie sa signature avant de répondre :
/// quand la page propose de redémarrer, il n'y a plus rien à attendre. `par_la_personne` (« Rechercher maintenant ») :
/// on redemande à GitHub même s'il vient de répondre.
#[tauri::command]
pub async fn preparer_mise_a_jour(
    app: AppHandle,
    webview: Webview,
    garde: State<'_, Origines>,
    etat: State<'_, MisesAJour>,
    par_la_personne: Option<bool>,
) -> Result<Etat, EchecMaj> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| EchecMaj::Interdit)?;
    let version = app.package_info().version.to_string();
    if !etat.active {
        return Ok(Etat::Indisponible { version });
    }
    let _seule = etat.recherche.lock().await;
    if let Some(p) = etat.prete.lock().map_err(|_| EchecMaj::Autre)?.as_ref() {
        return Ok(etat_pret(&app, &p.update));
    }
    if par_la_personne != Some(true) {
        if let Some(t) = etat.a_jour_recent(SystemTime::now()) {
            return Ok(Etat::AJour { version, verifie: millisecondes(t) });
        }
    }
    let updater = app.updater_builder().timeout(DELAI_RECHERCHE).build().map_err(|e| echec("l'outil de mise à jour ne s'est pas construit", e))?;
    let Some(mut update) = updater.check().await.map_err(|e| echec("la recherche d'une mise à jour a échoué", e))? else {
        let maintenant = SystemTime::now();
        if let Ok(mut a) = etat.a_jour.lock() {
            *a = Some(maintenant);
        }
        return Ok(Etat::AJour { version, verifie: millisecondes(maintenant) });
    };
    // Le délai de la recherche vaudrait aussi pour tout le téléchargement (`Update.timeout`) : le sien est plus long.
    update.timeout = Some(DELAI_TELECHARGEMENT);
    // `download` vérifie la signature et la version signée : des octets qu'il rend sont bons à poser.
    let octets = update.download(|_, _| {}, || {}).await.map_err(|e| echec("la mise à jour ne s'est pas téléchargée", e))?;
    let pret = etat_pret(&app, &update);
    *etat.prete.lock().map_err(|_| EchecMaj::Autre)? = Some(Prete { update, octets });
    Ok(pret)
}

/// Pose la mise à jour prête et relance Notak sur la nouvelle version. Hors du fil principal, et par une demande de
/// redémarrage : Notak quitte d'abord comme d'habitude (`RunEvent::Exit`, qui libère aussi le verrou d'instance unique),
/// puis repart. `poser_en_partant` n'a alors plus rien à poser : la mise à jour prête a été prise ici.
#[tauri::command]
pub async fn installer_mise_a_jour(app: AppHandle, webview: Webview, garde: State<'_, Origines>, etat: State<'_, MisesAJour>) -> Result<(), EchecMaj> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| EchecMaj::Interdit)?;
    let pret = etat.prete.lock().map_err(|_| EchecMaj::Autre)?.take().ok_or(EchecMaj::Autre)?;
    // Sous Windows, l'installeur ferme l'app puis la relance de lui-même ; ailleurs, on relance.
    if let Err(e) = pret.update.install(&pret.octets) {
        // Les octets vérifiés restent bons : la mise à jour reste prête, pour réessayer ou se poser en partant.
        *etat.prete.lock().map_err(|_| EchecMaj::Autre)? = Some(pret);
        return Err(echec("la mise à jour n'a pas pu s'installer", e));
    }
    app.request_restart();
    Ok(())
}

/// Quand on quitte Notak avec une mise à jour prête, elle se pose en partant : la prochaine ouverture est à jour,
/// sans rien avoir demandé. Rien ne redémarre (l'installeur de Windows non plus) : on voulait quitter.
pub fn poser_en_partant(etat: &MisesAJour) {
    let Some(pret) = etat.prete.lock().ok().and_then(|mut p| p.take()) else { return };
    if let Err(e) = pret.update.restart_after_install(false).install(&pret.octets) {
        eprintln!("Notak : la mise à jour n'a pas pu se poser en quittant ({e}) ; elle sera reproposée.");
    }
}

#[cfg(test)]
mod essais {
    use super::*;
    use serde_json::json;

    #[test]
    fn un_echec_se_dit_par_son_code() {
        use tauri_plugin_updater::Error as E;
        assert_eq!(serde_json::to_value(EchecMaj::EspaceDisque).unwrap(), json!({ "code": "espace_disque" }));
        assert_eq!(serde_json::to_value(EchecMaj::Signature).unwrap(), json!({ "code": "signature" }));
        // Une signature refusée se dit comme telle, jamais comme une panne du réseau.
        for e in [E::MissingSignedVersion, E::SignatureUtf8("x".into()), E::SignedVersionMismatch { signed: "0.2.0".into(), announced: "0.3.0".into() }] {
            assert_eq!(classer(&e), EchecMaj::Signature, "{e}");
        }
        assert_eq!(classer(&E::Network("Download request failed with status: 404 Not Found".into())), EchecMaj::Reseau);
        assert_eq!(classer(&E::ReleaseNotFound), EchecMaj::Reseau);
        assert_eq!(classer(&E::TempDirNotOnSameMountPoint), EchecMaj::Emplacement);
        assert_eq!(classer(&E::Io(std::io::Error::from(std::io::ErrorKind::ReadOnlyFilesystem))), EchecMaj::Emplacement);
        assert_eq!(classer(&E::Io(std::io::Error::from(std::io::ErrorKind::PermissionDenied))), EchecMaj::Emplacement);
        assert_eq!(classer(&E::Io(std::io::Error::from(std::io::ErrorKind::StorageFull))), EchecMaj::EspaceDisque);
        assert_eq!(classer(&E::Io(std::io::Error::from(std::io::ErrorKind::TimedOut))), EchecMaj::Delai);
        assert_eq!(classer(&E::TargetNotFound("linux-x86_64".into())), EchecMaj::Autre);
    }

    #[test]
    fn une_reponse_a_jour_vaut_quelques_heures_pour_les_recherches_automatiques() {
        let m = MisesAJour::new(true);
        let t = UNIX_EPOCH + Duration::from_secs(1_800_000_000);
        assert_eq!(m.a_jour_recent(t), None);
        *m.a_jour.lock().unwrap() = Some(t);
        assert_eq!(m.a_jour_recent(t + Duration::from_secs(3600)), Some(t));
        assert_eq!(m.a_jour_recent(t + VALIDITE), None);
        // Une horloge qui recule ne fait pas durer la réponse.
        assert_eq!(m.a_jour_recent(t - Duration::from_secs(1)), None);
        assert!(VALIDITE < Duration::from_secs(6 * 3600), "le rappel de la page, toutes les six heures, cherche vraiment");
        assert!(DELAI_TELECHARGEMENT > DELAI_RECHERCHE);
        assert_eq!(millisecondes(t), 1_800_000_000_000);
    }
}
