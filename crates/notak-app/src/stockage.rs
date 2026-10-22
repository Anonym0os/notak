//! Le tableau vit dans un fichier JSON local, en attendant la synchronisation.

use std::path::PathBuf;

use notak_core::tableau::Tableau;

pub fn chemin() -> PathBuf {
    if let Some(p) = std::env::var_os("NOTAK_TABLEAU") {
        return PathBuf::from(p);
    }
    dirs::data_dir().unwrap_or_else(|| PathBuf::from(".")).join("Notak").join("tableau.json")
}

pub fn lire() -> Tableau {
    std::fs::read_to_string(chemin())
        .ok()
        .and_then(|json| Tableau::depuis_json(&json).ok())
        .unwrap_or_else(|| Tableau { titre: "Mon tableau".into(), ..Default::default() })
}

/// Écrit dans un fichier voisin puis le renomme : un arrêt brutal ne laisse jamais un tableau à moitié écrit.
pub fn ecrire(tableau: &Tableau) -> std::io::Result<()> {
    let chemin = chemin();
    if let Some(dossier) = chemin.parent() {
        std::fs::create_dir_all(dossier)?;
    }
    let provisoire = chemin.with_extension("json.tmp");
    std::fs::write(&provisoire, tableau.vers_json())?;
    std::fs::rename(provisoire, chemin)
}
