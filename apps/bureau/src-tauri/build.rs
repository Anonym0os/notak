fn main() {
    // Les commandes de la coque n'ont de droit que celui que leur donne une capacité (`capabilities/principale.json`,
    // ou celle d'une coque construite pour un serveur, `scripts/bureau.ts`).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "choisir_emplacement",
        "ecrire_fichier",
        "capturer_fenetre",
        "preparer_mise_a_jour",
        "installer_mise_a_jour",
    ])))
    .unwrap();
}
