/// Notak de bureau : l'édition locale de Notak (`apps/web`, construite avec `VITE_EDITION=locale`), embarquée dans
/// l'application. Pas de compte ni de serveur : les tableaux vivent sur l'ordinateur, dans le stockage de la fenêtre,
/// et la page ne joint que ce que permet sa CSP (`tauri.conf.json`, tirée de `packages/tableau/src/securite.ts`).
///
/// La coque n'ajoute à la page que ce qu'une page ne sait pas faire seule :
/// - enregistrer un fichier là où la personne le choisit (un export, une copie `.notak`) : la webview de macOS ne
///   télécharge rien ; la coque n'écrit qu'au chemin que la personne vient de choisir ;
/// - se mettre à jour (`mise_a_jour.rs`), de versions signées seulement ;
/// - garder la fenêtre chez elle (`navigation.rs`) : un lien vers un autre site s'ouvre dans le navigateur.
/// Et, pour une coque construite pour un serveur Notak, photographier la fenêtre pour un signalement (`capturer_fenetre`).
mod mise_a_jour;
mod navigation;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, State, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use mise_a_jour::MisesAJour;
use navigation::{vers_dehors, Origines};

/// Les chemins choisis dans la fenêtre « Enregistrer sous » : celui d'un export attend ses octets une seule fois ;
/// celui de la copie `.notak` reste, pour que ⌘S la réécrive sans redemander, jusqu'à ce qu'on en choisisse un autre.
#[derive(Default)]
struct Emplacements {
    export: Mutex<Option<PathBuf>>,
    copie: Mutex<Option<PathBuf>>,
}

/// L'en-tête qui dit à `ecrire_fichier` quel chemin prendre : `copie`, sinon celui de l'export.
const USAGE: &str = "x-notak-usage";

/// Ouvre la fenêtre « Enregistrer sous » ; rend le nom du fichier choisi, ou rien si la personne a annulé. `garder` :
/// c'est l'emplacement de la copie, qu'on réécrira.
#[tauri::command]
async fn choisir_emplacement(
    app: AppHandle,
    emplacements: State<'_, Emplacements>,
    nom: String,
    extension: String,
    description: String,
    garder: Option<bool>,
) -> Result<Option<String>, String> {
    let chemin = app
        .dialog()
        .file()
        .set_file_name(&nom)
        .add_filter(&description, &[extension.as_str()])
        .blocking_save_file()
        .and_then(|c| c.into_path().ok());
    let Some(chemin) = chemin else { return Ok(None) };
    let nom = chemin.file_name().map(|n| n.to_string_lossy().into_owned());
    let place = if garder == Some(true) { &emplacements.copie } else { &emplacements.export };
    *place.lock().map_err(|e| e.to_string())? = Some(chemin);
    Ok(nom)
}

/// Écrit les octets reçus (le corps brut de l'appel) au chemin choisi juste avant : celui d'un export, une seule fois,
/// ou celui de la copie. L'écriture passe par un fichier voisin, posé d'un coup : un enregistrement coupé en route ne
/// laisse jamais une copie à moitié écrite à la place de la bonne.
#[tauri::command]
fn ecrire_fichier(requete: Request<'_>, emplacements: State<'_, Emplacements>) -> Result<(), String> {
    let InvokeBody::Raw(octets) = requete.body() else {
        return Err("octets attendus".into());
    };
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
    std::fs::write(&provisoire, octets).and_then(|_| std::fs::rename(&provisoire, &chemin)).map_err(|e| {
        let _ = std::fs::remove_file(&provisoire);
        e.to_string()
    })
}

/// La page telle qu'on la voit, en PNG, par `takeSnapshot` du WKWebView : l'image peinte, au pixel près, là où la
/// recopie du DOM (html-to-image) déforme ce que WebKit rend mal. Aucune autorisation d'enregistrement de l'écran :
/// la vue ne photographie qu'elle-même.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn capturer_fenetre(fenetre: tauri::WebviewWindow) -> Result<tauri::ipc::Response, String> {
    use block2::RcBlock;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError};
    use objc2_web_kit::WKWebView;
    use std::sync::mpsc;

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
/// sur l'application et ses lecteurs intégrés ; une nouvelle fenêtre demandée par un lien (`target="_blank"`,
/// `window.open`) s'ouvre dans le navigateur, jamais dans Notak.
fn ouvrir_fenetre(app: &AppHandle) -> tauri::Result<()> {
    let config = app.config();
    let Some(fenetre) = config.app.windows.iter().find(|f| f.label == "principale") else {
        return Ok(());
    };
    let origines = Origines::de(config);
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
        .build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let contexte = tauri::generate_context!();
    // Seule une construction publiée porte la clé publique et l'adresse des mises à jour (`tauri.publication.json`).
    let mises_a_jour = contexte.config().plugins.0.contains_key("updater");
    let mut constructeur = tauri::Builder::default().plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_opener::init());
    if mises_a_jour {
        constructeur = constructeur.plugin(tauri_plugin_updater::Builder::new().build());
    }
    constructeur
        .manage(Emplacements::default())
        .manage(MisesAJour::new(mises_a_jour))
        .setup(|app| Ok(ouvrir_fenetre(app.handle())?))
        .invoke_handler(tauri::generate_handler![
            choisir_emplacement,
            ecrire_fichier,
            mise_a_jour::preparer_mise_a_jour,
            mise_a_jour::installer_mise_a_jour,
            #[cfg(target_os = "macos")]
            capturer_fenetre
        ])
        .build(contexte)
        .expect("Notak n'a pas pu ouvrir sa fenêtre")
        .run(|app, evenement| {
            if let RunEvent::Exit = evenement {
                mise_a_jour::poser_en_partant(&app.state::<MisesAJour>());
            }
        });
}
