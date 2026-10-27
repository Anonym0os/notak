/// Notak de bureau : l'édition locale de Notak (`apps/web`, construite avec `VITE_EDITION=locale`), embarquée dans
/// l'application. Pas de compte ni de serveur : les tableaux vivent sur l'ordinateur, dans le stockage de la fenêtre,
/// et la page ne joint que ce que permet sa CSP (`tauri.conf.json`, tirée de `packages/tableau/src/securite.ts`).
/// La personne peut aussi choisir, dans l'app, un serveur Notak (`acces.rs`) : la fenêtre va alors sur ses pages.
///
/// La coque n'ajoute à la page que ce qu'une page ne sait pas faire seule :
/// - enregistrer un fichier là où la personne le choisit (un export, une copie `.notak`) : la webview de macOS ne
///   télécharge rien ; la coque n'écrit qu'au chemin que la personne vient de choisir ;
/// - ouvrir une pièce jointe dans son application, recevoir une copie `.notak` ouverte depuis le système
///   (`fichiers.rs`) ;
/// - joindre un serveur Notak, et en revenir (`acces.rs`), avec des réglages à elle (`reglages.rs`) ;
/// - se mettre à jour (`mise_a_jour.rs`), de versions signées seulement ;
/// - garder la fenêtre chez elle (`navigation.rs`) : un lien vers un autre site s'ouvre dans le navigateur.
/// - lire les fichiers choisis par Fichier › Importer… (⌘O, `menu.rs`), un à un, et seulement ceux-là ;
/// Et, pour la page d'un serveur, photographier la fenêtre pour un signalement (`capturer_fenetre`).
///
/// Sur un iPhone ou un iPad, la même coque compile (`tauri ios build`) et n'ouvre que l'application embarquée : ce qui
/// n'y a pas de sens est sous `#[cfg(desktop)]` (joindre un serveur, les fichiers du Finder, le menu, les mises à jour,
/// c'est l'App Store ; « Enregistrer sous » n'existe pas), et le natif d'iOS est dans le plugin `appareil`
/// (`apps/bureau/plugins/appareil`, `docs/IOS.md`).
///
/// Chaque commande vérifie qui l'appelle (`appel::exiger`) : la page embarquée, la page du serveur choisi, et personne
/// d'autre ; celles qui choisissent un serveur ou règlent la coque ne servent que la page embarquée.
#[cfg(desktop)]
mod acces;
#[cfg_attr(mobile, allow(dead_code, unused_imports))]
mod appel;
#[cfg(desktop)]
mod fichiers;
#[cfg(desktop)]
mod menu;
#[cfg(desktop)]
mod mise_a_jour;
#[cfg_attr(mobile, allow(dead_code))]
mod navigation;
#[cfg(desktop)]
mod reglages;

#[cfg(desktop)]
use std::path::PathBuf;
#[cfg(desktop)]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(desktop)]
use std::sync::{Mutex, PoisonError};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[cfg(desktop)]
use tauri::ipc::Request;
use tauri::webview::NewWindowResponse;
#[cfg(desktop)]
use tauri::webview::PageLoadEvent;
#[cfg(desktop)]
use tauri::{RunEvent, State, Webview};
use tauri::{AppHandle, Manager, WebviewWindowBuilder};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[cfg(desktop)]
use acces::Acces;
use appel::Cadence;
#[cfg(desktop)]
use appel::{exiger, octets, LOCALE_OU_SERVEUR, REFUSE};
#[cfg(desktop)]
use fichiers::Ouverts;
#[cfg(desktop)]
use mise_a_jour::MisesAJour;
#[cfg(desktop)]
use navigation::Appelant;
#[cfg(desktop)]
use navigation::racine_locale;
use navigation::{vers_dehors, Origines, ServeurCourant};
#[cfg(desktop)]
use reglages::Reglage;

/// Les chemins choisis dans la fenêtre « Enregistrer sous » : celui d'un export attend ses octets une seule fois ;
/// celui de la copie `.notak` reste, pour que ⌘S la réécrive sans redemander, jusqu'à ce qu'on en choisisse un autre.
/// Ils ne valent que pour la page qui les a choisis : changer de page (`acces.rs`) les oublie.
#[cfg(desktop)]
#[derive(Default)]
pub(crate) struct Emplacements {
    export: Mutex<Option<PathBuf>>,
    copie: Mutex<Option<PathBuf>>,
    /// Les fichiers choisis par Fichier › Importer…, que la page vient lire.
    pub(crate) choisis: Mutex<Vec<PathBuf>>,
}

#[cfg(desktop)]
impl Emplacements {
    pub(crate) fn vider(&self) {
        *self.export.lock().unwrap_or_else(PoisonError::into_inner) = None;
        *self.copie.lock().unwrap_or_else(PoisonError::into_inner) = None;
        self.choisis.lock().unwrap_or_else(PoisonError::into_inner).clear();
    }
}

/// L'en-tête qui dit à `ecrire_fichier` quel chemin prendre : `copie`, sinon celui de l'export.
#[cfg(desktop)]
const USAGE: &str = "x-notak-usage";

/// Ouvre la fenêtre « Enregistrer sous » ; rend le nom du fichier choisi, ou rien si la personne a annulé. `garder` :
/// c'est l'emplacement de la copie, qu'on réécrira. Sans extension, la fenêtre ne filtre rien.
#[cfg(desktop)]
#[tauri::command]
async fn choisir_emplacement(
    app: AppHandle,
    webview: Webview,
    garde: State<'_, Origines>,
    emplacements: State<'_, Emplacements>,
    nom: String,
    extension: String,
    description: String,
    garder: Option<bool>,
) -> Result<Option<String>, String> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| REFUSE.to_string())?;
    let mut fenetre = app.dialog().file().set_file_name(&nom);
    if !extension.is_empty() {
        fenetre = fenetre.add_filter(&description, &[extension.as_str()]);
    }
    let chemin = fenetre.blocking_save_file().and_then(|c| c.into_path().ok());
    let Some(chemin) = chemin else { return Ok(None) };
    let nom = chemin.file_name().map(|n| n.to_string_lossy().into_owned());
    let place = if garder == Some(true) { &emplacements.copie } else { &emplacements.export };
    *place.lock().map_err(|e| e.to_string())? = Some(chemin);
    Ok(nom)
}

/// Écrit les octets reçus (le corps de l'appel) au chemin choisi juste avant : celui d'un export, une seule fois, ou
/// celui de la copie. L'écriture passe par un fichier voisin, posé d'un coup : un enregistrement coupé en route ne
/// laisse jamais une copie à moitié écrite à la place de la bonne. Pour la page d'un serveur, le fichier est marqué
/// comme venu d'Internet, comme un téléchargement : un programme qu'elle aurait fait enregistrer ne se lance pas sans
/// l'avertissement du système.
#[cfg(desktop)]
#[tauri::command]
async fn ecrire_fichier(webview: Webview, garde: State<'_, Origines>, requete: Request<'_>, emplacements: State<'_, Emplacements>) -> Result<(), String> {
    let appelant = exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| REFUSE.to_string())?;
    let octets = octets(requete.body()).map_err(|_| "octets attendus".to_string())?;
    let copie = requete.headers().get(USAGE).is_some_and(|v| v == "copie");
    let chemin = if copie {
        emplacements.copie.lock().map_err(|e| e.to_string())?.clone()
    } else {
        emplacements.export.lock().map_err(|e| e.to_string())?.take()
    }
    .ok_or("aucun emplacement choisi")?;
    // Un voisin à soi : deux écritures rapprochées vers le même chemin ne partagent pas leur fichier provisoire.
    static SUIVANT: AtomicU64 = AtomicU64::new(0);
    let mut provisoire = chemin.clone().into_os_string();
    provisoire.push(format!(".{}-{}.notak-tmp", std::process::id(), SUIVANT.fetch_add(1, Ordering::Relaxed)));
    let provisoire = PathBuf::from(provisoire);
    std::fs::write(&provisoire, &octets).and_then(|_| std::fs::rename(&provisoire, &chemin)).map_err(|e| {
        let _ = std::fs::remove_file(&provisoire);
        e.to_string()
    })?;
    if appelant == Appelant::Serveur {
        fichiers::marquer_venu_d_internet(&chemin);
    }
    Ok(())
}

/// Les octets du `index`-ième fichier choisi par Fichier › Importer… (`menu.rs`) ; rien d'autre sur le disque.
#[cfg(desktop)]
#[tauri::command]
fn lire_fichier_choisi(webview: Webview, garde: State<'_, Origines>, emplacements: State<'_, Emplacements>, index: usize) -> Result<tauri::ipc::Response, String> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR).map_err(|_| REFUSE.to_string())?;
    let chemin = emplacements.choisis.lock().map_err(|e| e.to_string())?.get(index).cloned().ok_or("aucun fichier choisi à ce rang")?;
    std::fs::read(&chemin).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

/// La page telle qu'on la voit, en PNG, par `takeSnapshot` du WKWebView : l'image peinte, au pixel près, là où la
/// recopie du DOM (html-to-image) déforme ce que WebKit rend mal. Aucune autorisation d'enregistrement de l'écran :
/// la vue ne photographie qu'elle-même. Pour la page d'un serveur seulement : c'est là qu'on signale un bug.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn capturer_fenetre(fenetre: tauri::WebviewWindow, webview: Webview, garde: State<'_, Origines>) -> Result<tauri::ipc::Response, String> {
    use block2::RcBlock;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError};
    use objc2_web_kit::WKWebView;
    use std::sync::mpsc;

    exiger(&webview, &garde, appel::SERVEUR).map_err(|_| REFUSE.to_string())?;
    let (envoi, reception) = mpsc::channel::<Result<Vec<u8>, String>>();
    fenetre
        .with_webview(move |vue| {
            // SAFETY : sur macOS, `inner` est le WKWebView de la fenêtre, et ce bloc tourne sur le fil principal.
            let vue: &WKWebView = unsafe { &*(vue.inner() as *const WKWebView) };
            let fin = RcBlock::new(move |image: *mut NSImage, _erreur: *mut NSError| {
                // SAFETY : WebKit passe une image valide, ou un pointeur nul en cas d'échec.
                let png = unsafe { image.as_ref() }
                    .and_then(|image| image.TIFFRepresentation())
                    .and_then(|tiff| NSBitmapImageRep::imageRepWithData(&tiff))
                    .and_then(|rep| unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) })
                    .map(|png| png.to_vec())
                    .ok_or_else(|| "la photo de la fenêtre a échoué".to_string());
                let _ = envoi.send(png);
            });
            unsafe { vue.takeSnapshotWithConfiguration_completionHandler(None, &fin) };
        })
        .map_err(|e| e.to_string())?;
    let png = tauri::async_runtime::spawn_blocking(move || reception.recv_timeout(std::time::Duration::from_secs(5)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "la photo de la fenêtre n'est pas venue".to_string())??;
    Ok(tauri::ipc::Response::new(png))
}

/// Combien d'adresses la page envoie coup sur coup vers le navigateur ou la messagerie, sans commande (un lien, un
/// `window.open`) : la webview n'a pas de bloqueur de fenêtres, une page qui s'emballe n'en ouvre pas des dizaines.
const DEHORS_MAX: usize = 3;
const DEHORS_DUREE: Duration = Duration::from_secs(10);

/// Ouvre une adresse du monde (le web, un courriel) dans l'application de la personne : son navigateur, sa messagerie.
fn ouvrir_dehors(app: &AppHandle, cadence: &Cadence, url: &tauri::Url) {
    if !vers_dehors(url) {
        return;
    }
    if !cadence.permise(Instant::now()) {
        eprintln!("Notak : trop d'adresses ouvertes coup sur coup, {url} ne s'ouvre pas");
        return;
    }
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("Notak : impossible d'ouvrir {url} ({e})");
    }
}

/// La fenêtre de Notak, déclarée dans `tauri.conf.json` mais créée ici, pour la garder chez elle : elle ne va que
/// sur l'application, le serveur choisi et leurs lecteurs intégrés ; une nouvelle fenêtre demandée par un lien
/// (`target="_blank"`, `window.open`) s'ouvre dans le navigateur, jamais dans Notak.
fn ouvrir_fenetre(app: &AppHandle, origines: Origines) -> tauri::Result<()> {
    let config = app.config();
    let Some(fenetre) = config.app.windows.iter().find(|f| f.label == "principale") else {
        return Ok(());
    };
    let pour_navigation = app.clone();
    let pour_fenetres = app.clone();
    let cadence = Arc::new(Cadence::new(DEHORS_MAX, DEHORS_DUREE));
    let cadence_fenetres = cadence.clone();
    let constructeur = WebviewWindowBuilder::from_config(app, fenetre)?
        .on_navigation(move |url| {
            if origines.permise(url) {
                return true;
            }
            // Un courriel ou un numéro ne se charge pas dans un cadre : c'est un lien cliqué, il part vers le système.
            // Une page web refusée, elle, peut venir d'un cadre : on ne l'ouvre pas dans le dos de la personne.
            if matches!(url.scheme(), "mailto" | "tel") {
                ouvrir_dehors(&pour_navigation, &cadence, url);
            }
            false
        })
        .on_new_window(move |url, _| {
            ouvrir_dehors(&pour_fenetres, &cadence_fenetres, &url);
            NewWindowResponse::Deny
        });
    // Le chargement d'une page de serveur, que suit `acces.rs` : sur un ordinateur seulement, iOS n'en joint aucun.
    #[cfg(desktop)]
    let constructeur = constructeur.on_page_load(move |fenetre, chargement| match chargement.event() {
        PageLoadEvent::Started => acces::page_chargee(fenetre.app_handle(), chargement.url()),
        PageLoadEvent::Finished if chargement.url().as_str() == "about:blank" => acces::page_vide_chargee(fenetre.app_handle()),
        PageLoadEvent::Finished => {}
    });
    constructeur.build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Le moteur cryptographique des clients HTTP (`acces.rs`, les mises à jour), avant qu'aucun ne se construise.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let contexte = tauri::generate_context!();
    let constructeur = tauri::Builder::default();
    // L'instance unique d'abord : une seconde Notak passe ses fichiers à la première et s'arrête là.
    #[cfg(desktop)]
    let constructeur = constructeur.plugin(tauri_plugin_single_instance::init(|app, arguments, dossier| {
        fichiers::recevoir(app, fichiers::chemins_de_la_ligne(arguments, std::path::Path::new(&dossier)));
        if let Some(f) = app.get_webview_window("principale") {
            let _ = f.unminimize();
            let _ = f.show();
            let _ = f.set_focus();
        }
    }));
    #[cfg_attr(mobile, allow(unused_mut))]
    let mut constructeur = constructeur
        .plugin(tauri_plugin_dialog::init())
        // Sans son script, qui enverrait les liens `target="_blank"` vers une commande qu'aucune capacité ne permet :
        // ils passent par `on_new_window`, comme le reste. Sur iOS, la page appelle `open_url` (`capabilities/mobile.json`).
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(notak_appareil::init());
    // Seule une construction publiée porte la clé publique et l'adresse des mises à jour (`tauri.publication.json`) ;
    // sur un iPhone ou un iPad, les mises à jour viennent de l'App Store.
    #[cfg(desktop)]
    {
        let mises_a_jour = contexte.config().plugins.0.contains_key("updater");
        if mises_a_jour {
            constructeur = constructeur.plugin(tauri_plugin_updater::Builder::new().build());
        }
        constructeur = constructeur
            .manage(MisesAJour::new(mises_a_jour))
            .manage(Emplacements::default())
            .manage(acces::Passage::default())
            .manage(Ouverts::default())
            .manage(fichiers::Ouvertures::default());
    }
    #[cfg(target_os = "macos")]
    {
        constructeur = constructeur.menu(menu::menu).on_menu_event(menu::choisi);
    }
    constructeur
        .setup(|app| {
            let app = app.handle();
            // Un seul serveur courant, partagé par les réglages d'accès et la garde de navigation ; sur iOS, il reste vide.
            let serveur = ServeurCourant::default();
            #[cfg(desktop)]
            {
                fichiers::vider_les_ouverts(app);
                let reglage = Reglage::new(app.path().app_config_dir().ok().map(|d| d.join("bureau.json")));
                app.manage(Acces::new(reglage, racine_locale(app.config()), serveur.clone()));
            }
            let origines = Origines::de(app.config(), serveur);
            app.manage(origines.clone());
            ouvrir_fenetre(app, origines)?;
            // Sous Windows et Linux, un fichier ouvert depuis le système arrive en argument ; macOS l'envoie à part
            // (`RunEvent::Opened`).
            #[cfg(all(desktop, not(target_os = "macos")))]
            if let Ok(dossier) = std::env::current_dir() {
                fichiers::recevoir(app, fichiers::chemins_de_la_ligne(std::env::args_os().map(|a| a.to_string_lossy().into_owned()), &dossier));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            #[cfg(desktop)]
            choisir_emplacement,
            #[cfg(desktop)]
            ecrire_fichier,
            #[cfg(desktop)]
            lire_fichier_choisi,
            #[cfg(desktop)]
            acces::acces,
            #[cfg(desktop)]
            acces::joindre_serveur,
            #[cfg(desktop)]
            acces::revenir_ici,
            #[cfg(desktop)]
            acces::oublier_serveur,
            #[cfg(desktop)]
            acces::regler_maj_auto,
            #[cfg(desktop)]
            acces::regler_ouverture,
            #[cfg(desktop)]
            fichiers::ouvrir_fichier,
            #[cfg(desktop)]
            fichiers::fichiers_ouverts,
            #[cfg(desktop)]
            fichiers::lire_fichier_ouvert,
            #[cfg(desktop)]
            fichiers::ecarter_fichier_ouvert,
            #[cfg(desktop)]
            acces::annuler_jonction,
            #[cfg(desktop)]
            acces::ouvrir_dans_le_navigateur,
            #[cfg(desktop)]
            fichiers::confier_copie,
            #[cfg(desktop)]
            mise_a_jour::preparer_mise_a_jour,
            #[cfg(desktop)]
            mise_a_jour::installer_mise_a_jour,
            #[cfg(target_os = "macos")]
            capturer_fenetre
        ])
        .build(contexte)
        .expect("Notak n'a pas pu ouvrir sa fenêtre")
        .run(|_app, evenement| {
            #[cfg(desktop)]
            match evenement {
                // Une boîte d'accord encore ouverte ne doit pas valoir oui pendant que Notak se ferme.
                RunEvent::ExitRequested { .. } => _app.state::<fichiers::Ouvertures>().finir(),
                RunEvent::Exit => {
                    _app.state::<fichiers::Ouvertures>().finir();
                    mise_a_jour::poser_en_partant(&_app.state::<MisesAJour>())
                }
                // Un double clic sur une copie `.notak` dans le Finder, peut-être avant que la fenêtre n'existe : la file
                // l'attend, et la page la lira en arrivant.
                #[cfg(target_os = "macos")]
                RunEvent::Opened { urls } => fichiers::recevoir(_app, fichiers::chemins_des_adresses(&urls)),
                _ => {}
            }
            #[cfg(mobile)]
            let _ = evenement;
        });
}
