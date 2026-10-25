fn main() {
    // Les commandes de la coque n'ont de droit que celui que leur donne `capabilities/principale.json`.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["choisir_emplacement", "ecrire_fichier", "capturer_fenetre"])),
    )
    .unwrap();
}
