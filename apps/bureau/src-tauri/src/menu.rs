#![cfg_attr(not(target_os = "macos"), allow(dead_code))]
/// Le menu de l'app sur macOS : Notak, Fichier, Édition, Présentation, Fenêtre. Le menu « Notak » porte deux entrées à
/// lui, pour changer de serveur ou jeter un œil aux toiles de cet ordinateur d'où que soit la fenêtre, même sur une
/// page de serveur qui ne répond plus ; ni l'une ni l'autre ne change où Notak s'ouvre. Fichier › Importer… (⌘O) ouvre
/// la fenêtre « Ouvrir » du système, puis la page lit, un à un, les fichiers que la personne vient de choisir
/// (`lire_fichier_choisi`), et seulement ceux-là. Le reste du code se compile partout ; seul macOS s'en sert.
///
/// Les libellés suivent la langue du Mac, pas celle choisie dans les réglages de l'app : le menu se construit avant
/// toute page, et la page d'un serveur n'a pas à le récrire.

use std::path::PathBuf;

use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_dialog::DialogExt;

use crate::acces::{revenir, Ecran};
use crate::Emplacements;

const CHANGER: &str = "notak-changer-de-serveur";
const ICI: &str = "notak-toiles-ici";
const IMPORTER: &str = "notak-importer";

/// Les libellés des menus du système, dans l'ordre où `menu` les pose.
struct Textes {
    fichier: &'static str,
    importer: &'static str,
    titre_importer: &'static str,
    a_propos: &'static str,
    services: &'static str,
    masquer: &'static str,
    masquer_autres: &'static str,
    tout_afficher: &'static str,
    quitter: &'static str,
    fermer: &'static str,
    edition: &'static str,
    annuler: &'static str,
    retablir: &'static str,
    couper: &'static str,
    copier: &'static str,
    coller: &'static str,
    tout_selectionner: &'static str,
    presentation: &'static str,
    plein_ecran: &'static str,
    fenetre: &'static str,
    reduire: &'static str,
    zoom: &'static str,
}

fn textes(francais: bool) -> Textes {
    if francais {
        Textes {
            fichier: "Fichier",
            importer: "Importer…",
            titre_importer: "Importer dans Notak",
            a_propos: "À propos de Notak",
            services: "Services",
            masquer: "Masquer Notak",
            masquer_autres: "Masquer les autres",
            tout_afficher: "Tout afficher",
            quitter: "Quitter Notak",
            fermer: "Fermer la fenêtre",
            edition: "Édition",
            annuler: "Annuler",
            retablir: "Rétablir",
            couper: "Couper",
            copier: "Copier",
            coller: "Coller",
            tout_selectionner: "Tout sélectionner",
            presentation: "Présentation",
            plein_ecran: "Plein écran",
            fenetre: "Fenêtre",
            reduire: "Réduire",
            zoom: "Zoom",
        }
    } else {
        Textes {
            fichier: "File",
            importer: "Import…",
            titre_importer: "Import into Notak",
            a_propos: "About Notak",
            services: "Services",
            masquer: "Hide Notak",
            masquer_autres: "Hide Others",
            tout_afficher: "Show All",
            quitter: "Quit Notak",
            fermer: "Close Window",
            edition: "Edit",
            annuler: "Undo",
            retablir: "Redo",
            couper: "Cut",
            copier: "Copy",
            coller: "Paste",
            tout_selectionner: "Select All",
            presentation: "View",
            plein_ecran: "Enter Full Screen",
            fenetre: "Window",
            reduire: "Minimize",
            zoom: "Zoom",
        }
    }
}

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
    let francais = en_francais();
    let t = textes(francais);
    let [changer, ici] = libelles(francais);
    let changer = MenuItem::with_id(app, CHANGER, changer, true, None::<&str>)?;
    let ici = MenuItem::with_id(app, ICI, ici, true, None::<&str>)?;
    let importer = MenuItemBuilder::with_id(IMPORTER, t.importer).accelerator("CmdOrCtrl+O").build(app)?;
    let notak = SubmenuBuilder::new(app, "Notak")
        .about_with_text(t.a_propos, None)
        .separator()
        .item(&changer)
        .item(&ici)
        .separator()
        .services_with_text(t.services)
        .separator()
        .hide_with_text(t.masquer)
        .hide_others_with_text(t.masquer_autres)
        .show_all_with_text(t.tout_afficher)
        .separator()
        .quit_with_text(t.quitter)
        .build()?;
    let fichier = SubmenuBuilder::new(app, t.fichier).item(&importer).separator().close_window_with_text(t.fermer).build()?;
    let edition = SubmenuBuilder::new(app, t.edition)
        .undo_with_text(t.annuler)
        .redo_with_text(t.retablir)
        .separator()
        .cut_with_text(t.couper)
        .copy_with_text(t.copier)
        .paste_with_text(t.coller)
        .select_all_with_text(t.tout_selectionner)
        .build()?;
    let presentation = SubmenuBuilder::new(app, t.presentation).fullscreen_with_text(t.plein_ecran).build()?;
    let fenetre = SubmenuBuilder::new(app, t.fenetre).minimize_with_text(t.reduire).maximize_with_text(t.zoom).build()?;
    Menu::with_items(app, &[&notak, &fichier, &edition, &presentation, &fenetre])
}

/// Fichier › Importer… : la fenêtre « Ouvrir » du système, plusieurs fichiers au choix ; la page apprend leurs noms
/// par l'événement `notak:fichiers-choisis` et vient lire leurs octets (`lire_fichier_choisi`).
fn importer(app: &AppHandle) {
    let app = app.clone();
    app.dialog().file().set_title(textes(en_francais()).titre_importer).pick_files(move |choix| {
        let chemins: Vec<PathBuf> = choix.unwrap_or_default().into_iter().filter_map(|c| c.into_path().ok()).collect();
        if chemins.is_empty() {
            return;
        }
        let noms: Vec<String> = chemins.iter().map(|c| c.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()).collect();
        if let Ok(mut choisis) = app.state::<Emplacements>().choisis.lock() {
            *choisis = chemins;
        }
        let Some(fenetre) = app.get_webview_window("principale") else { return };
        let noms = serde_json::to_string(&noms).unwrap_or_else(|_| "[]".into());
        let _ = fenetre.eval(format!("window.dispatchEvent(new CustomEvent('notak:fichiers-choisis', {{ detail: {noms} }}))"));
    });
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
    if evenement.id().as_ref() == IMPORTER {
        return importer(app);
    }
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
        assert_eq!(ecran_de(IMPORTER), None);
        // Les entrées de Tauri (« Quitter », « Copier »…) ne ramènent nulle part.
        assert_eq!(ecran_de("quit"), None);
        assert_eq!(ecran_de(""), None);
    }
}
