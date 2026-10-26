#![cfg_attr(not(target_os = "macos"), allow(dead_code))]
/// Le menu de l'app sur macOS : celui de Tauri (Édition, copier-coller, Fenêtre…), plus deux entrées dans le menu
/// « Notak », pour changer de serveur ou jeter un œil aux toiles de cet ordinateur d'où que soit la fenêtre, même sur une
/// page de serveur qui ne répond plus. Ni l'une ni l'autre ne change où Notak s'ouvre. Le reste du code se compile
/// partout ; seul macOS s'en sert.
///
/// Les libellés suivent la langue du Mac, pas celle choisie dans les réglages de l'app : le menu se construit avant
/// toute page, et la page d'un serveur n'a pas à le récrire.

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Wry};

use crate::acces::{revenir, Ecran};

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

/// Une langue (`fr-FR`, `en`…) est-elle le français ? Sans langue connue, le français, celle de Notak par défaut.
pub fn francais(langue: Option<&str>) -> bool {
    langue.is_none_or(|l| l.trim().get(..2).is_some_and(|d| d.eq_ignore_ascii_case("fr")))
}

/// La première langue choisie dans les réglages du Mac.
#[cfg(target_os = "macos")]
pub fn en_francais() -> bool {
    francais(objc2_foundation::NSLocale::preferredLanguages().firstObject().map(|l| l.to_string()).as_deref())
}

/// Ailleurs, la coque ne lit pas la langue du système : le français.
#[cfg(not(target_os = "macos"))]
pub fn en_francais() -> bool {
    francais(None)
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

/// L'identifiant d'une entrée du menu, et l'écran où elle ramène la fenêtre.
fn ecran_de(id: &str) -> Option<Ecran> {
    match id {
        CHANGER => Some(Ecran::Acces),
        ICI => Some(Ecran::Local),
        _ => None,
    }
}

pub fn choisi(app: &AppHandle, evenement: MenuEvent) {
    let Some(ecran) = ecran_de(evenement.id().as_ref()) else { return };
    // Une jonction en cours s'arrête là, et rien n'est retenu : la fenêtre revient, c'est tout.
    if let Err(e) = revenir(app, ecran, None) {
        eprintln!("Notak : impossible de ramener la fenêtre ({e:?})");
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn la_langue_du_mac_choisit_les_libelles() {
        for (langue, fr) in [(Some("fr-FR"), true), (Some("fr"), true), (Some("FR-ca"), true), (Some("en-US"), false), (Some("de"), false), (Some(""), false), (None, true)] {
            assert_eq!(francais(langue), fr, "{langue:?}");
        }
        assert_eq!(libelles(francais(Some("fr-BE"))), ["Changer de serveur…", "Toiles de cet ordinateur"]);
        assert_eq!(libelles(francais(Some("en-GB"))), ["Change server…", "Boards on this computer"]);
    }

    #[test]
    fn chaque_entree_ramene_ou_elle_dit() {
        assert_eq!(ecran_de(CHANGER), Some(Ecran::Acces));
        assert_eq!(ecran_de(ICI), Some(Ecran::Local));
        assert_ne!(CHANGER, ICI);
        // Les entrées de Tauri (« Quitter », « Copier »…) ne ramènent nulle part.
        assert_eq!(ecran_de("quit"), None);
        assert_eq!(ecran_de(""), None);
    }
}
