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
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, State, Webview};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::appel::{exiger, LOCALE_OU_SERVEUR, REFUSE};
use crate::navigation::Origines;

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
}

impl MisesAJour {
    pub fn new(active: bool) -> Self {
        Self { active, prete: Mutex::new(None), recherche: tauri::async_runtime::Mutex::new(()) }
    }
}

/// Ce que la page apprend : la version qui tourne, et ce qui attend d'être installé.
#[derive(Serialize)]
#[serde(tag = "etat", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum Etat {
    /// Cette app ne se met pas à jour seule : construite à la main.
    Indisponible { version: String },
    AJour { version: String },
    Prete { version: String, nouvelle: String, notes: Option<String>, date: Option<String> },
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
/// quand la page propose de redémarrer, il n'y a plus rien à attendre.
#[tauri::command]
pub async fn preparer_mise_a_jour(app: AppHandle, webview: Webview, garde: State<'_, Origines>, etat: State<'_, MisesAJour>) -> Result<Etat, String> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| REFUSE.to_string())?;
    let version = app.package_info().version.to_string();
    if !etat.active {
        return Ok(Etat::Indisponible { version });
    }
    let _seule = etat.recherche.lock().await;
    if let Some(p) = etat.prete.lock().map_err(|e| e.to_string())?.as_ref() {
        return Ok(etat_pret(&app, &p.update));
    }
    let updater = app.updater_builder().timeout(Duration::from_secs(60)).build().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(Etat::AJour { version });
    };
    // `download` vérifie la signature et la version signée : des octets qu'il rend sont bons à poser.
    let octets = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    let pret = etat_pret(&app, &update);
    *etat.prete.lock().map_err(|e| e.to_string())? = Some(Prete { update, octets });
    Ok(pret)
}

/// Pose la mise à jour prête et relance Notak sur la nouvelle version. Hors du fil principal, et par une demande de
/// redémarrage : Notak quitte d'abord comme d'habitude (`RunEvent::Exit`, qui libère aussi le verrou d'instance unique),
/// puis repart. `poser_en_partant` n'a alors plus rien à poser : la mise à jour prête a été prise ici.
#[tauri::command]
pub async fn installer_mise_a_jour(app: AppHandle, webview: Webview, garde: State<'_, Origines>, etat: State<'_, MisesAJour>) -> Result<(), String> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| REFUSE.to_string())?;
    let pret = etat.prete.lock().map_err(|e| e.to_string())?.take().ok_or("aucune mise à jour prête")?;
    // Sous Windows, l'installeur ferme l'app puis la relance de lui-même ; ailleurs, on relance.
    if let Err(e) = pret.update.install(&pret.octets) {
        return Err(e.to_string());
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
