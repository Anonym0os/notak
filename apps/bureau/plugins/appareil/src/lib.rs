//! Le plugin « appareil » de la coque Notak.
//!
//! Partout, il dit à la page sur quoi elle tourne, avant tout script : `window.__NOTAK_PLATEFORME__` vaut
//! `std::env::consts::OS` de la coque (`macos`, `windows`, `linux`, `ios`, `android`). La page s'en sert pour poser
//! `data-plateforme` sur la racine du document (`apps/web/src/appareil.ts`) et ne pas lire l'agent utilisateur, qui
//! fait passer un iPad pour un Macintosh.
//!
//! Sur iOS, il porte aussi le natif que la page appelle directement (`invoke('plugin:appareil|infos')`), écrit en
//! Swift dans `ios/Sources/AppareilPlugin.swift` : `infos`, `regler_theme`, `capturer_fenetre`, `haptique`, et
//! l'événement `clavier`. Les commandes sont déclarées dans `build.rs` ; la page n'y a droit que par une capacité
//! (`apps/bureau/src-tauri/capabilities/mobile.json`, `appareil:default`).
use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_appareil);

/// Ce que la coque écrit dans la page avant tout script.
pub fn script_plateforme(os: &str) -> String {
    // Une chaîne JSON : pas d'apostrophe ni de guillemet venus d'ailleurs, le nom vient du compilateur.
    format!("window.__NOTAK_PLATEFORME__ = {};", serde_json::to_string(os).unwrap_or_else(|_| "\"web\"".into()))
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("appareil")
        .js_init_script(script_plateforme(std::env::consts::OS))
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            {
                let poignee = _api.register_ios_plugin(init_plugin_appareil)?;
                tauri::Manager::manage(_app, poignee);
            }
            Ok(())
        })
        .build()
}

/// Le dossier `Documents` du conteneur iCloud de Notak, ou rien si iCloud Drive est coupé. Bloque jusqu'à la réponse
/// du système : à appeler hors du fil principal.
#[cfg(target_os = "ios")]
pub fn dossier_icloud<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<std::path::PathBuf> {
    #[derive(serde::Deserialize)]
    struct Reponse {
        chemin: String,
    }
    let poignee = tauri::Manager::try_state::<tauri::plugin::PluginHandle<R>>(app)?;
    let r: Reponse = poignee.run_mobile_plugin("dossierIcloud", ()).ok()?;
    (!r.chemin.is_empty()).then(|| r.chemin.into())
}

/// Demande au système de faire descendre un fichier resté dans le nuage.
#[cfg(target_os = "ios")]
pub fn telecharger_icloud<R: Runtime>(app: &tauri::AppHandle<R>, chemin: &std::path::Path) {
    if let Some(poignee) = tauri::Manager::try_state::<tauri::plugin::PluginHandle<R>>(app) {
        let _ = poignee.run_mobile_plugin::<serde_json::Value>("telechargerIcloud", serde_json::json!({ "chemin": chemin }));
    }
}

#[cfg(test)]
mod essais {
    use super::script_plateforme;

    #[test]
    fn la_plateforme_est_ecrite_en_json() {
        assert_eq!(script_plateforme("ios"), "window.__NOTAK_PLATEFORME__ = \"ios\";");
        assert_eq!(script_plateforme("macos"), "window.__NOTAK_PLATEFORME__ = \"macos\";");
    }

    #[test]
    fn le_nom_du_systeme_de_cette_compilation_est_connu_de_la_page() {
        // `apps/web/src/appareil.ts` ne retient que ces cinq-là ; un autre nom la ferait retomber sur l'agent utilisateur.
        assert!(["macos", "windows", "linux", "ios", "android"].contains(&std::env::consts::OS));
    }
}
