/// Notak de bureau n'est qu'une fenêtre : l'application web, servie par le serveur de Notak, vit dans la
/// fenêtre déclarée dans `tauri.conf.json` (adresse dans `build.frontendDist`). Aucune donnée n'est gardée ici.
///
/// Seule exception, l'export : la webview de macOS ne télécharge rien, alors la page demande à la coque la fenêtre
/// « Enregistrer sous », puis lui confie les octets. La coque n'écrit qu'au chemin que la personne vient de choisir.
/// Et le signalement d'un bug (⌥⌘S) : la coque photographie la page telle qu'elle est peinte (`capturer_fenetre`).
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Le chemin choisi dans la dernière fenêtre « Enregistrer sous », en attente de ses octets.
#[derive(Default)]
struct Emplacement(Mutex<Option<PathBuf>>);

/// Ouvre la fenêtre « Enregistrer sous » ; rend le nom du fichier choisi, ou rien si la personne a annulé.
#[tauri::command]
async fn choisir_emplacement(
    app: AppHandle,
    emplacement: State<'_, Emplacement>,
    nom: String,
    extension: String,
    description: String,
) -> Result<Option<String>, String> {
    let chemin = app
        .dialog()
        .file()
        .set_file_name(&nom)
        .add_filter(&description, &[extension.as_str()])
        .blocking_save_file()
        .and_then(|c| c.into_path().ok());
    let nom = chemin.as_ref().and_then(|c| c.file_name()).map(|n| n.to_string_lossy().into_owned());
    *emplacement.0.lock().map_err(|e| e.to_string())? = chemin;
    Ok(nom)
}

/// Écrit les octets reçus (le corps brut de l'appel) au chemin choisi juste avant, une seule fois.
#[tauri::command]
fn ecrire_fichier(requete: Request<'_>, emplacement: State<'_, Emplacement>) -> Result<(), String> {
    let InvokeBody::Raw(octets) = requete.body() else {
        return Err("octets attendus".into());
    };
    let chemin = emplacement.0.lock().map_err(|e| e.to_string())?.take().ok_or("aucun emplacement choisi")?;
    std::fs::write(&chemin, octets).map_err(|e| e.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Emplacement::default())
        .invoke_handler(tauri::generate_handler![
            choisir_emplacement,
            ecrire_fichier,
            #[cfg(target_os = "macos")]
            capturer_fenetre
        ])
        .run(tauri::generate_context!())
        .expect("Notak n'a pas pu ouvrir sa fenêtre");
}
