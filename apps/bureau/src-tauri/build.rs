fn main() {
    // Les commandes de la coque n'ont de droit que celui que leur donne une capacité : `capabilities/principale.json`
    // pour la page embarquée, et celle qu'ajoute `src/acces.rs` pour les pages du serveur choisi.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "choisir_emplacement",
        "ecrire_fichier",
        "capturer_fenetre",
        "preparer_mise_a_jour",
        "installer_mise_a_jour",
        "acces",
        "joindre_serveur",
        "revenir_ici",
        "oublier_serveur",
        "regler_maj_auto",
        "ouvrir_fichier",
        "fichiers_ouverts",
        "lire_fichier_ouvert",
        "confier_copie",
    ])))
    .unwrap();
}
