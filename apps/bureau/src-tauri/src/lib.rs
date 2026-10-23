/// Notak de bureau n'est qu'une fenêtre : l'application web, servie par le serveur de Notak, vit dans la
/// fenêtre déclarée dans `tauri.conf.json` (adresse dans `build.frontendDist`). Aucune donnée n'est gardée ici.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Notak n'a pas pu ouvrir sa fenêtre");
}
