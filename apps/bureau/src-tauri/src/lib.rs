/// Notak de bureau n'est qu'une fenêtre : l'application web, servie par le serveur de Notak, vit dans la
/// fenêtre déclarée dans `tauri.conf.json` (adresse dans `build.frontendDist`). Aucune donnée n'est gardée ici.
///
/// Seule exception, l'export : la webview de macOS ne télécharge rien, alors la page demande à la coque la fenêtre
/// « Enregistrer sous », puis lui confie les octets. La coque n'écrit qu'au chemin que la personne vient de choisir.
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Emplacement::default())
        .invoke_handler(tauri::generate_handler![choisir_emplacement, ecrire_fichier])
        .run(tauri::generate_context!())
        .expect("Notak n'a pas pu ouvrir sa fenêtre");
}
