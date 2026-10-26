/// Notak de bureau : l'édition locale de Notak (`apps/web`, construite avec `VITE_EDITION=locale`), embarquée dans
/// l'application. Pas de compte ni de serveur : les tableaux vivent sur l'ordinateur, dans le stockage de la fenêtre,
/// et la page ne joint que ce que permet sa CSP (`tauri.conf.json`, tirée de `packages/tableau/src/securite.ts`).
/// La personne peut aussi choisir, dans l'app, un serveur Notak (`acces.rs`) : la fenêtre va alors sur ses pages.
///
/// La coque n'ajoute à la page que ce qu'une page ne sait pas faire seule :
/// - enregistrer un fichier là où la personne le choisit (un export, une copie `.notak`) : la webview de macOS ne
///   télécharge rien ; la coque n'écrit qu'au chemin que la personne vient de choisir ;
/// - ouvrir une pièce jointe dans son application, recevoir une copie `.notak` ouverte depuis le système
///   (`fichiers.rs`) ;
/// - joindre un serveur Notak, et en revenir (`acces.rs`), avec des réglages à elle (`reglages.rs`) ;
/// - se mettre à jour (`mise_a_jour.rs`), de versions signées seulement ;
/// - garder la fenêtre chez elle (`navigation.rs`) : un lien vers un autre site s'ouvre dans le navigateur.
/// Et, pour la page d'un serveur, photographier la fenêtre pour un signalement (`capturer_fenetre`).
///
/// Chaque commande vérifie qui l'appelle (`appel::exiger`) : la page embarquée, la page du serveur choisi, et personne
/// d'autre ; celles qui choisissent un serveur ou règlent la coque ne servent que la page embarquée.
mod acces;
mod appel;
mod fichiers;
mod menu;
mod mise_a_jour;
mod navigation;
mod reglages;

use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

use tauri::ipc::Request;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, RunEvent, State, Webview, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use acces::Acces;
use appel::{exiger, octets, LOCALE_OU_SERVEUR, REFUSE};
use fichiers::Ouverts;
use mise_a_jour::MisesAJour;
use navigation::{racine_locale, vers_dehors, Origines, ServeurCourant};
use reglages::Reglage;

/// Les chemins choisis dans la fenêtre « Enregistrer sous » : celui d'un export attend ses octets une seule fois ;
/// celui de la copie `.notak` reste, pour que ⌘S la réécrive sans redemander, jusqu'à ce qu'on en choisisse un autre.
/// Ils ne valent que pour la page qui les a choisis : changer de page (`acces.rs`) les oublie.
#[derive(Default)]
pub(crate) struct Emplacements {
    export: Mutex<Option<PathBuf>>,
    copie: Mutex<Option<PathBuf>>,
}

impl Emplacements {
    pub(crate) fn vider(&self) {
        *self.export.lock().unwrap_or_else(PoisonError::into_inner) = None;
        *self.copie.lock().unwrap_or_else(PoisonError::into_inner) = None;
    }
}

/// L'en-tête qui dit à `ecrire_fichier` quel chemin prendre : `copie`, sinon celui de l'export.
const USAGE: &str = "x-notak-usage";

/// Ouvre la fenêtre « Enregistrer sous » ; rend le nom du fichier choisi, ou rien si la personne a annulé. `garder` :
/// c'est l'emplacement de la copie, qu'on réécrira. Sans extension, la fenêtre ne filtre rien.
#[tauri::command]
async fn choisir_emplacement(
    app: AppHandle,
    webview: Webview,
    garde: State<'_, Origines>,
    emplacements: State<'_, Emplacements>,
    nom: String,
    extension: String,
    description: String,
    garder: Option<bool>,
) -> Result<Option<String>, String> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| REFUSE.to_string())?;
    let mut fenetre = app.dialog().file().set_file_name(&nom);
    if !extension.is_empty() {
        fenetre = fenetre.add_filter(&description, &[extension.as_str()]);
    }
    let chemin = fenetre.blocking_save_file().and_then(|c| c.into_path().ok());
    let Some(chemin) = chemin else { return Ok(None) };
    let nom = chemin.file_name().map(|n| n.to_string_lossy().into_owned());
    let place = if garder == Some(true) { &emplacements.copie } else { &emplacements.export };
    *place.lock().map_err(|e| e.to_string())? = Some(chemin);
    Ok(nom)
}

/// Écrit les octets reçus (le corps de l'appel) au chemin choisi juste avant : celui d'un export, une seule fois, ou
/// celui de la copie. L'écriture passe par un fichier voisin, posé d'un coup : un enregistrement coupé en route ne
/// laisse jamais une copie à moitié écrite à la place de la bonne.
#[tauri::command]
async fn ecrire_fichier(webview: Webview, garde: State<'_, Origines>, requete: Request<'_>, emplacements: State<'_, Emplacements>) -> Result<(), String> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| REFUSE.to_string())?;
    let octets = octets(requete.body()).map_err(|_| "octets attendus".to_string())?;
    let copie = requete.headers().get(USAGE).is_some_and(|v| v == "copie");
    let chemin = if copie {
        emplacements.copie.lock().map_err(|e| e.to_string())?.clone()
    } else {
        emplacements.export.lock().map_err(|e| e.to_string())?.take()
    }
    .ok_or("aucun emplacement choisi")?;
    let mut provisoire = chemin.clone().into_os_string();
    provisoire.push(".notak-tmp");
    let provisoire = PathBuf::from(provisoire);
    std::fs::write(&provisoire, &octets).and_then(|_| std::fs::rename(&provisoire, &chemin)).map_err(|e| {
        let _ = std::fs::remove_file(&provisoire);
        e.to_string()
    })
}

/// La page telle qu'on la voit, en PNG, par `takeSnapshot` du WKWebView : l'image peinte, au pixel près, là où la
/// recopie du DOM (html-to-image) déforme ce que WebKit rend mal. Aucune autorisation d'enregistrement de l'écran :
/// la vue ne photographie qu'elle-même. Pour la page d'un serveur seulement : c'est là qu'on signale un bug.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn capturer_fenetre(fenetre: tauri::WebviewWindow, webview: Webview, garde: State<'_, Origines>) -> Result<tauri::ipc::Response, String> {
    use block2::RcBlock;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError};
    use objc2_web_kit::WKWebView;
    use std::sync::mpsc;

    exiger(&webview, &garde, appel::SERVEUR).map_err(|_| REFUSE.to_string())?;
    let (envoi, reception) = mpsc::channel::<Result<Vec<u8>, String>>();
    fenetre
        .with_webview(move |vue| {
            // SAFETY : sur macOS, `inner` est le WKWebView de la fenêtre, et ce bloc tourne sur le fil principal.
            let vue: &WKWebView = unsafe { &*(vue.inner() as *const WKWebView) };
            let fin = RcBlock::new(move |image: *mut NSImage, _erreur: *mut NSError| {
                // SAFETY : WebKit passe une image valide, ou un pointeur nul en cas d'échec.
                let png = unsafe { image.as_ref() }
                    .and_then(|image| image.TIFFRepresentation())
                    .and_then(|tiff| NSBitmapImageRep::imageRepWithData(&tiff))
                    .and_then(|rep| unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) })
                    .map(|png| png.to_vec())
                    .ok_or_else(|| "la photo de la fenêtre a échoué".to_string());
                let _ = envoi.send(png);
            });
            unsafe { vue.takeSnapshotWithConfiguration_completionHandler(None, &fin) };
        })
        .map_err(|e| e.to_string())?;
    let png = tauri::async_runtime::spawn_blocking(move || reception.recv_timeout(std::time::Duration::from_secs(5)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "la photo de la fenêtre n'est pas venue".to_string())??;
    Ok(tauri::ipc::Response::new(png))
}

/// Ouvre une adresse du monde (le web, un courriel) dans l'application de la personne : son navigateur, sa messagerie.
fn ouvrir_dehors(app: &AppHandle, url: &tauri::Url) {
    if vers_dehors(url) {
        if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
            eprintln!("Notak : impossible d'ouvrir {url} ({e})");
        }
    }
}

/// La fenêtre de Notak, déclarée dans `tauri.conf.json` mais créée ici, pour la garder chez elle : elle ne va que
/// sur l'application, le serveur choisi et leurs lecteurs intégrés ; une nouvelle fenêtre demandée par un lien
/// (`target="_blank"`, `window.open`) s'ouvre dans le navigateur, jamais dans Notak.
fn ouvrir_fenetre(app: &AppHandle, origines: Origines) -> tauri::Result<()> {
    let config = app.config();
    let Some(fenetre) = config.app.windows.iter().find(|f| f.label == "principale") else {
        return Ok(());
    };
    let pour_navigation = app.clone();
    let pour_fenetres = app.clone();
    WebviewWindowBuilder::from_config(app, fenetre)?
        .on_navigation(move |url| {
            if origines.permise(url) {
                return true;
            }
            // Un courriel ou un numéro ne se charge pas dans un cadre : c'est un lien cliqué, il part vers le système.
            // Une page web refusée, elle, peut venir d'un cadre : on ne l'ouvre pas dans le dos de la personne.
            if matches!(url.scheme(), "mailto" | "tel") {
                ouvrir_dehors(&pour_navigation, url);
            }
            false
        })
        .on_new_window(move |url, _| {
            ouvrir_dehors(&pour_fenetres, &url);
            NewWindowResponse::Deny
        })
        .on_page_load(move |fenetre, chargement| {
            if chargement.event() == PageLoadEvent::Started {
                acces::page_chargee(fenetre.app_handle(), chargement.url());
            }
        })
        .build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Le moteur cryptographique des clients HTTP (`acces.rs`, les mises à jour), avant qu'aucun ne se construise.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let contexte = tauri::generate_context!();
    // Seule une construction publiée porte la clé publique et l'adresse des mises à jour (`tauri.publication.json`).
    let mises_a_jour = contexte.config().plugins.0.contains_key("updater");
    // L'instance unique d'abord : une seconde Notak passe ses fichiers à la première et s'arrête là.
    let mut constructeur = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, arguments, dossier| {
            fichiers::recevoir(app, fichiers::chemins_de_la_ligne(arguments, std::path::Path::new(&dossier)));
            if let Some(f) = app.get_webview_window("principale") {
                let _ = f.unminimize();
                let _ = f.show();
                let _ = f.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        // Sans son script, qui enverrait les liens `target="_blank"` vers une commande qu'aucune capacité ne permet :
        // ils passent par `on_new_window`, comme le reste.
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build());
    if mises_a_jour {
        constructeur = constructeur.plugin(tauri_plugin_updater::Builder::new().build());
    }
    #[cfg(target_os = "macos")]
    {
        constructeur = constructeur.menu(menu::menu).on_menu_event(menu::choisi);
    }
    constructeur
        .manage(Emplacements::default())
        .manage(MisesAJour::new(mises_a_jour))
        .manage(Ouverts::default())
        .manage(fichiers::Cadence::default())
        .setup(|app| {
            let app = app.handle();
            fichiers::vider_les_ouverts(app);
            let reglage = Reglage::new(app.path().app_config_dir().ok().map(|d| d.join("bureau.json")));
            app.manage(Acces::new(reglage, racine_locale(app.config())));
            let origines = Origines::de(app.config(), ServeurCourant::default());
            app.manage(origines.clone());
            ouvrir_fenetre(app, origines)?;
            // Sous Windows et Linux, un fichier ouvert depuis le système arrive en argument ; macOS l'envoie à part
            // (`RunEvent::Opened`).
            #[cfg(not(target_os = "macos"))]
            if let Ok(dossier) = std::env::current_dir() {
                fichiers::recevoir(app, fichiers::chemins_de_la_ligne(std::env::args_os().map(|a| a.to_string_lossy().into_owned()), &dossier));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            choisir_emplacement,
            ecrire_fichier,
            acces::acces,
            acces::joindre_serveur,
            acces::revenir_ici,
            acces::oublier_serveur,
            acces::regler_maj_auto,
            fichiers::ouvrir_fichier,
            fichiers::fichiers_ouverts,
            fichiers::lire_fichier_ouvert,
            fichiers::ecarter_fichier_ouvert,
            acces::annuler_jonction,
            acces::ouvrir_dans_le_navigateur,
            fichiers::confier_copie,
            mise_a_jour::preparer_mise_a_jour,
            mise_a_jour::installer_mise_a_jour,
            #[cfg(target_os = "macos")]
            capturer_fenetre
        ])
        .build(contexte)
        .expect("Notak n'a pas pu ouvrir sa fenêtre")
        .run(|app, evenement| match evenement {
            RunEvent::Exit => mise_a_jour::poser_en_partant(&app.state::<MisesAJour>()),
            // Un double clic sur une copie `.notak` dans le Finder, peut-être avant que la fenêtre n'existe : la file
            // l'attend, et la page la lira en arrivant.
            #[cfg(target_os = "macos")]
            RunEvent::Opened { urls } => fichiers::recevoir(app, fichiers::chemins_des_adresses(&urls)),
            _ => {}
        });
}
