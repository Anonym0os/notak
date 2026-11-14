/// Les téléchargements de la page : un lien `download` (l'original d'une image ou d'un fichier, un export de la toile).
/// Sans quelqu'un pour l'accepter, la webview de macOS annule le téléchargement sans rien dire (wry,
/// `wkwebview/navigation.rs`) : la coque l'accepte, et le fichier va dans le dossier Téléchargements de la personne,
/// comme dans Safari, « nom (1).ext » si le nom est déjà pris. À la fin, elle le dit à la page
/// (`notak://telechargement`), qui l'annonce avec de quoi montrer le fichier dans le Finder (`montrer_telechargement`).
///
/// Seule la page de Notak télécharge, et seulement ses fichiers à elle : la page embarquée ou celle du serveur choisi,
/// pour un `blob:` qu'elle a fait ou une adresse de son origine. Un cadre intégré d'un autre site, une adresse `data:`
/// dont on ne sait d'où elle vient, une page entre deux (`acces::Passage`) ne posent rien sur le disque.
///
/// Sur un iPhone ou un iPad, pas de Téléchargements à montrer : la page passe par la feuille de partage
/// (`apps/web/src/telechargements.ts`), et la coque ne pose pas ce gestionnaire.
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use tauri::webview::DownloadEvent;
use tauri::{AppHandle, Emitter, Manager, State, Url, Webview};
use tauri_plugin_opener::OpenerExt;

use crate::acces::Passage;
use crate::appel::{exiger, Erreur, LOCALE_OU_SERVEUR};
use crate::fichiers::{marquer_venu_d_internet, nom_sur};
use crate::navigation::{Appelant, Origines};

/// L'événement de la fin d'un téléchargement, que la page annonce (`apps/web/src/telechargements.ts`).
pub const EVENEMENT: &str = "notak://telechargement";

/// Posé avant tout script de la page : la coque reçoit ses téléchargements. Une coque d'avant ne le pose pas, et la
/// page d'un serveur plus récent qu'elle passe alors par « Enregistrer sous ».
pub const SCRIPT: &str = "window.__NOTAK_TELECHARGEMENTS__ = true;";

/// Les téléchargements finis dont la page peut encore demander à voir le fichier : les derniers seulement.
const FINIS_GARDES: usize = 32;
/// Ceux qui n'ont jamais fini (une page fermée en route) ne s'accumulent pas.
const EN_COURS_MAX: usize = 64;
/// Au-delà de « nom (9999) », le nom est pris pour de bon : le téléchargement échouera, et la page le dira.
const DOUBLONS_MAX: u32 = 9999;

/// Ce que la page apprend d'un téléchargement fini : de quoi le montrer (`id`, s'il a réussi) et son nom sur le disque.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Issue {
    pub id: Option<u64>,
    pub nom: String,
    pub reussi: bool,
}

struct EnCours {
    adresse: String,
    chemin: PathBuf,
    appelant: Appelant,
}

struct Fini {
    id: u64,
    chemin: PathBuf,
    appelant: Appelant,
}

#[derive(Default)]
struct Etat {
    en_cours: VecDeque<EnCours>,
    finis: VecDeque<Fini>,
    dernier: u64,
}

/// Les téléchargements de la fenêtre : ceux en route (leur chemin, que macOS ne redonne pas à la fin), et ceux finis.
#[derive(Default)]
pub struct Telechargements(Mutex<Etat>);

/// La fin d'un téléchargement commencé ici.
#[derive(Debug, PartialEq, Eq)]
pub struct Fin {
    pub issue: Issue,
    pub chemin: PathBuf,
}

impl Telechargements {
    /// Le chemin où ira ce téléchargement, gardé jusqu'à sa fin : un nom libre dans `dossier`, ni sur le disque, ni
    /// promis à un téléchargement encore en route (deux fichiers du même nom, coup sur coup).
    pub fn commencer(&self, adresse: &str, appelant: Appelant, dossier: &Path, propose: &str) -> PathBuf {
        let mut etat = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let chemin = chemin_libre(dossier, propose, |c| c.symlink_metadata().is_ok() || etat.en_cours.iter().any(|e| e.chemin == c));
        if etat.en_cours.len() >= EN_COURS_MAX {
            etat.en_cours.pop_front();
        }
        etat.en_cours.push_back(EnCours { adresse: adresse.to_string(), chemin: chemin.clone(), appelant });
        chemin
    }

    /// Un téléchargement s'est fini, bien ou mal. macOS ne dit que son adresse (`chemin` vide) : on reprend le premier
    /// en route à cette adresse. Rien, s'il n'a pas été commencé ici (un refus).
    pub fn finir(&self, adresse: &str, chemin: Option<PathBuf>, reussi: bool) -> Option<Fin> {
        let mut etat = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let rang = chemin
            .as_ref()
            .and_then(|c| etat.en_cours.iter().position(|e| &e.chemin == c))
            .or_else(|| etat.en_cours.iter().position(|e| e.adresse == adresse))?;
        let parti = etat.en_cours.remove(rang)?;
        let chemin = chemin.unwrap_or(parti.chemin);
        let nom = chemin.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let id = reussi.then(|| {
            etat.dernier += 1;
            let id = etat.dernier;
            if etat.finis.len() >= FINIS_GARDES {
                etat.finis.pop_front();
            }
            etat.finis.push_back(Fini { id, chemin: chemin.clone(), appelant: parti.appelant });
            id
        });
        Some(Fin { issue: Issue { id, nom, reussi }, chemin })
    }

    /// Le fichier d'un téléchargement fini, pour la page qui l'a fait, et elle seule.
    pub fn chemin(&self, id: u64, appelant: Appelant) -> Option<PathBuf> {
        let etat = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        etat.finis.iter().find(|f| f.id == id && f.appelant == appelant).map(|f| f.chemin.clone())
    }
}

/// Qui télécharge, s'il est de ceux que la coque sert : la page de Notak (l'application ou le serveur choisi), pour un
/// fichier à elle, un `blob:` qu'elle a fait ou une adresse de son origine. Rien pour le reste : une page tierce, un
/// fichier d'une autre origine que la page, une adresse `data:` ou `file:`.
pub fn demandeur(origines: &Origines, page: Option<&Url>, adresse: &Url) -> Option<Appelant> {
    let page = origines.appelant(page?);
    if page == Appelant::Autre {
        return None;
    }
    let fichier = match adresse.scheme() {
        "blob" => Url::parse(adresse.path()).ok()?,
        "http" | "https" | "tauri" => adresse.clone(),
        _ => return None,
    };
    (origines.appelant(&fichier) == page).then_some(page)
}

/// Le chemin de `propose` dans `dossier`, nettoyé (`fichiers::nom_sur`), et libre : « nom (1).ext », « nom (2).ext »…
/// tant que `pris` le dit pris. L'extension double d'une archive reste entière (« sauvegarde (1).tar.gz »).
pub fn chemin_libre(dossier: &Path, propose: &str, pris: impl Fn(&Path) -> bool) -> PathBuf {
    let nom = nom_sur(propose);
    let (base, extension) = match nom.rsplit_once('.') {
        Some((base, extension)) => match base.strip_suffix(".tar") {
            Some(archive) if !archive.is_empty() => (archive.to_string(), format!(".tar.{extension}")),
            _ => (base.to_string(), format!(".{extension}")),
        },
        None => (nom.clone(), String::new()),
    };
    let mut chemin = dossier.join(&nom);
    let mut n = 1;
    while n <= DOUBLONS_MAX && pris(&chemin) {
        chemin = dossier.join(format!("{base} ({n}){extension}"));
        n += 1;
    }
    chemin
}

/// Le dossier Téléchargements de la personne, tel qu'il est sur le disque. Cloisonné, Notak le voit par un lien de
/// son conteneur (`~/Library/Containers/…/Data/Downloads`) : on le suit, pour que le Finder montre le vrai dossier.
fn dossier(app: &AppHandle) -> Option<PathBuf> {
    let dossier = app.path().download_dir().ok()?;
    Some(std::fs::canonicalize(&dossier).unwrap_or(dossier))
}

fn annoncer(app: &AppHandle, issue: Issue) {
    if let Err(e) = app.emit(EVENEMENT, issue) {
        eprintln!("Notak : la fin d'un téléchargement n'a pas pu être dite à la page ({e})");
    }
}

/// Le gestionnaire des téléchargements de la fenêtre (`WebviewWindowBuilder::on_download`) : `true` laisse le
/// téléchargement se faire, au chemin que la coque a posé.
pub fn gerer(webview: Webview, evenement: DownloadEvent<'_>) -> bool {
    let app = webview.app_handle().clone();
    match evenement {
        DownloadEvent::Requested { url, destination } => {
            let page = webview.url().ok();
            let entre_deux = app.state::<Passage>().en_cours();
            let Some(appelant) = demandeur(&app.state::<Origines>(), page.as_ref(), &url).filter(|_| !entre_deux) else {
                eprintln!("Notak : téléchargement refusé ({}), demandé par {}", url.scheme(), page.as_ref().map_or("aucune page", |p| p.as_str()));
                return false;
            };
            // Le nom que wry propose : celui que WebKit a tiré du lien, déjà « nom (1).ext » si le dossier l'a.
            let propose = destination.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let Some(dossier) = dossier(&app) else {
                annoncer(&app, Issue { id: None, nom: nom_sur(&propose), reussi: false });
                return false;
            };
            *destination = app.state::<Telechargements>().commencer(url.as_str(), appelant, &dossier, &propose);
            true
        }
        DownloadEvent::Finished { url, path, success } => {
            let Some(fin) = app.state::<Telechargements>().finir(url.as_str(), path, success) else { return true };
            // Hors du fil principal : la marque passe par `xattr`, un programme qu'on attend.
            tauri::async_runtime::spawn_blocking(move || {
                // Comme un navigateur, tout fichier téléchargé est marqué venu d'Internet : celui d'une toile reçue de
                // quelqu'un d'autre ne se lance pas sans l'avertissement du système.
                if fin.issue.reussi {
                    marquer_venu_d_internet(&fin.chemin);
                }
                annoncer(&app, fin.issue);
            });
            true
        }
        _ => true,
    }
}

/// Montre dans le Finder le fichier d'un téléchargement fini, celui de l'annonce (« Afficher dans le Finder »).
#[tauri::command]
pub fn montrer_telechargement(app: AppHandle, webview: Webview, garde: State<'_, Origines>, telechargements: State<'_, Telechargements>, id: u64) -> Result<(), Erreur> {
    let appelant = exiger(&webview, &garde, LOCALE_OU_SERVEUR)?;
    let chemin = telechargements.chemin(id, appelant).ok_or(Erreur::Introuvable)?;
    // Déplacé ou jeté depuis : le Finder n'aurait rien à montrer.
    if chemin.symlink_metadata().is_err() {
        return Err(Erreur::Introuvable);
    }
    app.opener().reveal_item_in_dir(&chemin).map_err(Erreur::echec)
}

#[cfg(test)]
mod essais {
    use super::*;
    use crate::navigation::ServeurCourant;
    use std::collections::HashSet;
    use tauri::utils::config::Config;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    fn origines() -> Origines {
        let mut config = Config::default();
        config.build.frontend_dist = None;
        Origines::de(&config, ServeurCourant::default())
    }

    const ICI: &str = if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" };

    #[test]
    fn la_page_embarquee_telecharge_ses_fichiers() {
        let o = origines();
        let page = url(&format!("{ICI}/t/abc"));
        assert_eq!(demandeur(&o, Some(&page), &url(&format!("blob:{ICI}/0b6f6e2c-1f0a"))), Some(Appelant::Locale));
        assert_eq!(demandeur(&o, Some(&page), &url(&format!("{ICI}/fichier.pdf"))), Some(Appelant::Locale));
        // Ni une adresse d'ailleurs, ni des octets dont on ne sait d'où ils viennent, ni un fichier du disque.
        assert_eq!(demandeur(&o, Some(&page), &url("https://exemple.fr/programme.pkg")), None);
        assert_eq!(demandeur(&o, Some(&page), &url("blob:https://exemple.fr/0b6f6e2c")), None);
        assert_eq!(demandeur(&o, Some(&page), &url("data:application/octet-stream;base64,AAAA")), None);
        assert_eq!(demandeur(&o, Some(&page), &url("file:///etc/passwd")), None);
        assert_eq!(demandeur(&o, Some(&page), &url("http://tauri.localhost:9999/x")), None);
        // Sans page connue, personne ne télécharge.
        assert_eq!(demandeur(&o, None, &url(&format!("blob:{ICI}/0b6f6e2c"))), None);
    }

    #[test]
    fn la_page_du_serveur_telecharge_les_siens_et_eux_seuls() {
        let o = origines();
        o.serveur.poser(Some("https://notak.exemple.fr".into()));
        let page = url("https://notak.exemple.fr/t/abc");
        assert_eq!(demandeur(&o, Some(&page), &url("https://notak.exemple.fr/api/fichiers/x")), Some(Appelant::Serveur));
        assert_eq!(demandeur(&o, Some(&page), &url("blob:https://notak.exemple.fr/0b6f6e2c")), Some(Appelant::Serveur));
        // Ce que la page embarquée a fait n'est pas à elle, ni un sous-domaine, ni un autre port.
        assert_eq!(demandeur(&o, Some(&page), &url(&format!("blob:{ICI}/0b6f6e2c"))), None);
        assert_eq!(demandeur(&o, Some(&page), &url("https://cdn.notak.exemple.fr/x.png")), None);
        assert_eq!(demandeur(&o, Some(&page), &url("https://notak.exemple.fr:8443/x.png")), None);
        assert_eq!(demandeur(&o, Some(&page), &url("http://notak.exemple.fr/x.png")), None);
    }

    #[test]
    fn une_page_tierce_ne_telecharge_rien() {
        let o = origines();
        o.serveur.poser(Some("https://notak.exemple.fr".into()));
        // Un lecteur intégré, un serveur joint plus tôt : même pour un fichier de leur origine.
        for (page, fichier) in [
            ("https://www.youtube-nocookie.com/embed/x", "https://www.youtube-nocookie.com/x.exe"),
            ("https://autre.exemple.fr/", "https://autre.exemple.fr/x.pdf"),
            ("https://autre.exemple.fr/", "blob:https://autre.exemple.fr/0b6f6e2c"),
            ("about:blank", "blob:https://notak.exemple.fr/0b6f6e2c"),
        ] {
            assert_eq!(demandeur(&o, Some(&url(page)), &url(fichier)), None, "{page} → {fichier}");
        }
    }

    #[test]
    fn un_nom_libre_comme_safari() {
        let dossier = Path::new("/Users/moi/Downloads");
        let pris: HashSet<PathBuf> = ["photo.jpg", "photo (1).jpg", "notes", "sauvegarde.tar.gz", "compte rendu v1.2.pdf"].iter().map(|n| dossier.join(n)).collect();
        let libre = |propose: &str| chemin_libre(dossier, propose, |c| pris.contains(c));
        assert_eq!(libre("rapport.pdf"), dossier.join("rapport.pdf"));
        assert_eq!(libre("photo.jpg"), dossier.join("photo (2).jpg"));
        assert_eq!(libre("notes"), dossier.join("notes (1)"));
        assert_eq!(libre("sauvegarde.tar.gz"), dossier.join("sauvegarde (1).tar.gz"));
        // Les points d'un nom ne sont pas son extension : seul le dernier l'est.
        assert_eq!(libre("compte rendu v1.2.pdf"), dossier.join("compte rendu v1.2 (1).pdf"));
        // Ce que propose la page est un nom, jamais un chemin.
        assert_eq!(libre("../../.ssh/authorized_keys"), dossier.join("authorized_keys"));
        assert_eq!(libre(""), dossier.join("fichier"));
        // Tout pris : le nom reste celui d'après le dernier essai, et le téléchargement échouera.
        assert_eq!(chemin_libre(dossier, "x.txt", |_| true), dossier.join(format!("x ({DOUBLONS_MAX}).txt")));
    }

    #[test]
    fn deux_telechargements_du_meme_nom_coup_sur_coup() {
        let dossier = Path::new("/nulle/part");
        let t = Telechargements::default();
        let a = t.commencer("blob:tauri://localhost/a", Appelant::Locale, dossier, "photo.jpg");
        let b = t.commencer("blob:tauri://localhost/b", Appelant::Locale, dossier, "photo.jpg");
        assert_eq!(a, dossier.join("photo.jpg"));
        assert_eq!(b, dossier.join("photo (1).jpg"));
        // macOS ne redonne que l'adresse : chaque fin retrouve son chemin.
        let fin_b = t.finir("blob:tauri://localhost/b", None, true).unwrap();
        assert_eq!(fin_b.chemin, b);
        assert_eq!(fin_b.issue, Issue { id: Some(1), nom: "photo (1).jpg".into(), reussi: true });
        let fin_a = t.finir("blob:tauri://localhost/a", None, false).unwrap();
        assert_eq!(fin_a.issue, Issue { id: None, nom: "photo.jpg".into(), reussi: false });
        // Une fin déjà dite, ou un téléchargement refusé (jamais commencé), ne se dit pas.
        assert_eq!(t.finir("blob:tauri://localhost/a", None, false), None);
        assert_eq!(t.finir("https://exemple.fr/x", None, false), None);
    }

    #[test]
    fn la_meme_adresse_deux_fois() {
        let dossier = Path::new("/nulle/part");
        let t = Telechargements::default();
        let premier = t.commencer("https://notak.exemple.fr/api/fichiers/x", Appelant::Serveur, dossier, "x.pdf");
        let second = t.commencer("https://notak.exemple.fr/api/fichiers/x", Appelant::Serveur, dossier, "x.pdf");
        assert_ne!(premier, second);
        // Windows et Linux redonnent le chemin : c'est lui qui désigne le téléchargement.
        assert_eq!(t.finir("https://notak.exemple.fr/api/fichiers/x", Some(second.clone()), true).unwrap().chemin, second);
        assert_eq!(t.finir("https://notak.exemple.fr/api/fichiers/x", None, true).unwrap().chemin, premier);
    }

    #[test]
    fn seule_la_page_qui_a_telecharge_voit_son_fichier() {
        let dossier = Path::new("/nulle/part");
        let t = Telechargements::default();
        t.commencer("blob:tauri://localhost/a", Appelant::Locale, dossier, "a.png");
        let id = t.finir("blob:tauri://localhost/a", None, true).unwrap().issue.id.unwrap();
        assert_eq!(t.chemin(id, Appelant::Locale), Some(dossier.join("a.png")));
        assert_eq!(t.chemin(id, Appelant::Serveur), None);
        assert_eq!(t.chemin(id + 1, Appelant::Locale), None);
    }

    #[test]
    fn la_memoire_reste_bornee() {
        let dossier = Path::new("/nulle/part");
        let t = Telechargements::default();
        for i in 0..(FINIS_GARDES + 5) {
            let adresse = format!("blob:tauri://localhost/{i}");
            t.commencer(&adresse, Appelant::Locale, dossier, &format!("{i}.png"));
            t.finir(&adresse, None, true);
        }
        assert_eq!(t.chemin(1, Appelant::Locale), None, "le plus ancien est oublié");
        assert!(t.chemin((FINIS_GARDES + 5) as u64, Appelant::Locale).is_some());
        for i in 0..(EN_COURS_MAX + 3) {
            t.commencer(&format!("blob:tauri://localhost/r{i}"), Appelant::Locale, dossier, "r.png");
        }
        assert_eq!(t.0.lock().unwrap().en_cours.len(), EN_COURS_MAX);
        assert_eq!(t.finir("blob:tauri://localhost/r0", None, true), None, "le plus ancien en route est oublié");
    }

    #[test]
    fn la_page_lit_l_issue_telle_quelle() {
        let issue = Issue { id: Some(3), nom: "photo.jpg".into(), reussi: true };
        assert_eq!(serde_json::to_value(issue).unwrap(), serde_json::json!({ "id": 3, "nom": "photo.jpg", "reussi": true }));
    }
}
