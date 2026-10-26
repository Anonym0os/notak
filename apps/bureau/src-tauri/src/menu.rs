#![cfg_attr(not(target_os = "macos"), allow(dead_code))]
/// Le menu de l'app sur macOS : celui de Tauri (Édition, copier-coller, Fenêtre…), plus deux entrées dans le menu
/// « Notak », pour changer de serveur ou revenir aux toiles de cet ordinateur d'où que soit la fenêtre, même sur une
/// page de serveur qui ne répond plus. Le reste du code se compile partout ; seul macOS s'en sert.

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Wry};

use crate::acces::{rentrer, Ecran};

const CHANGER: &str = "notak-changer-de-serveur";
const ICI: &str = "notak-toiles-ici";

/// Les deux libellés, en français si c'est la langue de la personne, en anglais sinon.
fn libelles(francais: bool) -> [&'static str; 2] {
    if francais {
        ["Changer de serveur…", "Toiles de cet ordinateur"]
    } else {
        ["Change server…", "Boards on this computer"]
    }
}

/// La première langue choisie dans les réglages du Mac.
#[cfg(target_os = "macos")]
fn en_francais() -> bool {
    objc2_foundation::NSLocale::preferredLanguages().firstObject().is_none_or(|l| l.to_string().starts_with("fr"))
}

#[cfg(not(target_os = "macos"))]
fn en_francais() -> bool {
    true
}

pub fn menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::default(app)?;
    let [changer, ici] = libelles(en_francais());
    let changer = MenuItem::with_id(app, CHANGER, changer, true, None::<&str>)?;
    let ici = MenuItem::with_id(app, ICI, ici, true, None::<&str>)?;
    // Le premier sous-menu est celui de l'app (« À propos », « Masquer », « Quitter ») : juste après « À propos ».
    if let Some(sous) = menu.items()?.first().and_then(|m| m.as_submenu()) {
        sous.insert_items(&[&changer, &ici, &PredefinedMenuItem::separator(app)?], 2)?;
    }
    Ok(menu)
}

pub fn choisi(app: &AppHandle, evenement: MenuEvent) {
    let ecran = match evenement.id().as_ref() {
        CHANGER => Ecran::Acces,
        ICI => Ecran::Local,
        _ => return,
    };
    if let Err(e) = rentrer(app, ecran) {
        eprintln!("Notak : impossible de ramener la fenêtre ({e:?})");
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn deux_libelles_par_langue() {
        assert_eq!(libelles(true), ["Changer de serveur…", "Toiles de cet ordinateur"]);
        assert_eq!(libelles(false), ["Change server…", "Boards on this computer"]);
    }
}
