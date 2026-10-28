/// Le dossier Notak dans iCloud Drive, que la page synchronise par défaut (`apps/web/src/local/synchro.ts`,
/// `docs/STOCKAGE.md`) : la coque n'y fait que lister, lire, écrire et effacer, à la demande de la page embarquée, et
/// jamais hors de ce dossier. Le logiciel d'iCloud fait le voyage entre les appareils ; Notak n'appelle aucun service.
///
/// Le dossier est celui du conteneur iCloud de Notak (`iCloud.app.notak.bureau`), que l'app iPhone ouvre par son
/// droit (`notak-bureau_iOS.entitlements`) et qu'iCloud Drive montre sous le nom « Notak ». Sur un Mac, la coque n'a
/// pas besoin de ce droit : elle écrit dans son reflet, `~/Library/Mobile Documents/iCloud~app~notak~bureau/Documents`,
/// comme le Finder le ferait.
///
/// Ce que la page envoie n'est pas cru : un chemin est relatif, fait de noms simples (ni `..`, ni nom caché, ni
/// séparateur d'un autre système), et ne quitte jamais la racine.
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::{Request, Response};
use tauri::{AppHandle, State, Webview};

use crate::appel::{exiger, octets, LOCALE};
use crate::navigation::Origines;

/// Le conteneur iCloud de Notak, tel que le nomme le système de fichiers d'un Mac.
#[cfg(target_os = "macos")]
const CONTENEUR: &str = "iCloud~app~notak~bureau";

/// Ce que la page lit d'une erreur : `{ code }` (`apps/web/src/local/dossierCoque.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum ErreurNuage {
    /// Le fichier n'existe pas.
    Absent,
    /// Le fichier est dans le nuage, pas encore sur l'appareil (« Optimiser le stockage »).
    Fantome,
    LectureSeule,
    Plein,
    /// Pas d'iCloud ici, ou plus de dossier (iCloud Drive coupé entre-temps).
    Indisponible,
    /// Un chemin que la coque refuse, ou des octets qu'elle ne sait pas lire.
    Illisible,
    /// Cette page n'a pas le droit de demander cela.
    Interdit,
}

fn traduire(e: &std::io::Error) -> ErreurNuage {
    match e.kind() {
        ErrorKind::NotFound => ErreurNuage::Absent,
        ErrorKind::PermissionDenied | ErrorKind::ReadOnlyFilesystem => ErreurNuage::LectureSeule,
        ErrorKind::StorageFull | ErrorKind::QuotaExceeded => ErreurNuage::Plein,
        _ => ErreurNuage::Indisponible,
    }
}

/// Une entrée d'un sous-dossier, comme la page l'attend (`EntreeDossier` de `@notak/tableau`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Entree {
    nom: String,
    genre: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    taille: Option<u64>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    fantome: bool,
}

/// Ce que `nuage_ouvrir` répond : le dossier est prêt, iCloud Drive est coupé sur cet appareil, ou il n'y a pas
/// d'iCloud ici (Windows, Linux).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "etat", rename_all = "kebab-case")]
pub enum Ouverture {
    Pret { nom: String },
    Eteint,
    #[cfg_attr(any(target_os = "macos", target_os = "ios"), allow(dead_code))]
    Absent,
}

/// La racine, trouvée à la première ouverture.
#[derive(Default)]
pub struct Nuage {
    racine: Mutex<Option<PathBuf>>,
}

impl Nuage {
    fn racine(&self) -> Result<PathBuf, ErreurNuage> {
        self.racine.lock().map_err(|_| ErreurNuage::Indisponible)?.clone().ok_or(ErreurNuage::Indisponible)
    }
}

/// Un chemin envoyé par la page, s'il est sûr : des noms simples séparés par `/`, rien qui remonte ni se cache.
pub fn chemin_sur(racine: &Path, chemin: &str) -> Result<PathBuf, ErreurNuage> {
    let mut sortie = racine.to_path_buf();
    let mut profondeur = 0;
    for nom in chemin.split('/').filter(|n| !n.is_empty()) {
        let interdit = nom.starts_with('.') || nom.contains(['\\', '\0', ':']) || nom.len() > 200;
        if interdit {
            return Err(ErreurNuage::Illisible);
        }
        sortie.push(nom);
        profondeur += 1;
    }
    if profondeur > 8 {
        return Err(ErreurNuage::Illisible);
    }
    Ok(sortie)
}

/// Un fichier qu'iCloud a laissé dans le nuage : `.nom.icloud` (iOS, et macOS avant Sonoma).
fn nom_du_fantome(nom: &str) -> Option<&str> {
    nom.strip_prefix('.')?.strip_suffix(".icloud").filter(|n| !n.is_empty())
}

/// Depuis Sonoma, un fichier resté dans le nuage garde son nom, mais n'a pas de données sur le disque.
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn sans_donnees(meta: &std::fs::Metadata) -> bool {
    #[cfg(target_os = "ios")]
    use std::os::ios::fs::MetadataExt;
    #[cfg(target_os = "macos")]
    use std::os::macos::fs::MetadataExt;
    const SF_DATALESS: u32 = 0x4000_0000;
    meta.st_flags() & SF_DATALESS != 0
}
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn sans_donnees(_meta: &std::fs::Metadata) -> bool {
    false
}

pub fn lister(dossier: &Path) -> Result<Vec<Entree>, ErreurNuage> {
    let lecture = match std::fs::read_dir(dossier) {
        Ok(l) => l,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(traduire(&e)),
    };
    let mut entrees = vec![];
    for entree in lecture.flatten() {
        let Ok(nom) = entree.file_name().into_string() else { continue };
        if let Some(vrai) = nom_du_fantome(&nom) {
            entrees.push(Entree { nom: vrai.to_string(), genre: "fichier", taille: None, fantome: true });
            continue;
        }
        // Nos fichiers provisoires, ceux du Finder (`.DS_Store`) : rien de ce qui est caché n'est au moteur.
        if nom.starts_with('.') {
            continue;
        }
        let Ok(meta) = entree.metadata() else { continue };
        if meta.is_dir() {
            entrees.push(Entree { nom, genre: "dossier", taille: None, fantome: false });
        } else if meta.is_file() {
            let fantome = sans_donnees(&meta);
            entrees.push(Entree { nom, genre: "fichier", taille: (!fantome).then_some(meta.len()), fantome });
        }
    }
    Ok(entrees)
}

pub fn lire(chemin: &Path) -> Result<Vec<u8>, ErreurNuage> {
    match std::fs::metadata(chemin) {
        Ok(meta) if sans_donnees(&meta) => return Err(ErreurNuage::Fantome),
        Ok(_) => {}
        Err(e) if e.kind() == ErrorKind::NotFound => {
            let fantome = chemin.file_name().and_then(|n| n.to_str()).map(|n| chemin.with_file_name(format!(".{n}.icloud")));
            return Err(if fantome.is_some_and(|f| f.exists()) { ErreurNuage::Fantome } else { ErreurNuage::Absent });
        }
        Err(e) => return Err(traduire(&e)),
    }
    std::fs::read(chemin).map_err(|e| traduire(&e))
}

/// Écrit le fichier en entier ou pas du tout : dans un voisin caché, renommé ensuite. Crée les dossiers manquants.
pub fn ecrire(chemin: &Path, octets: &[u8]) -> Result<(), ErreurNuage> {
    static SUIVANT: AtomicU64 = AtomicU64::new(0);
    let parent = chemin.parent().ok_or(ErreurNuage::Illisible)?;
    std::fs::create_dir_all(parent).map_err(|e| traduire(&e))?;
    let nom = chemin.file_name().ok_or(ErreurNuage::Illisible)?.to_string_lossy();
    let provisoire = parent.join(format!(".{nom}.{}-{}.notak-tmp", std::process::id(), SUIVANT.fetch_add(1, Ordering::Relaxed)));
    std::fs::write(&provisoire, octets).and_then(|_| std::fs::rename(&provisoire, chemin)).map_err(|e| {
        let _ = std::fs::remove_file(&provisoire);
        traduire(&e)
    })
}

pub fn supprimer(chemin: &Path) -> Result<(), ErreurNuage> {
    match std::fs::remove_file(chemin) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(traduire(&e)),
        _ => Ok(()),
    }
}

/// Fait descendre un fichier resté dans le nuage, à côté : la page relira. Sur un Mac, le lire suffit (le système le
/// rapatrie avant de rendre la main) ; sur un iPhone, on le demande au système.
fn telecharger(_app: &AppHandle, chemin: PathBuf) {
    let _app = _app.clone();
    std::thread::spawn(move || {
        #[cfg(target_os = "ios")]
        notak_appareil::telecharger_icloud(&_app, &chemin);
        #[cfg(not(target_os = "ios"))]
        let _ = std::fs::File::open(&chemin).and_then(|mut f| std::io::copy(&mut f, &mut std::io::sink()));
    });
}

/// Le dossier iCloud de Notak sur cet appareil, créé s'il le faut ; `Eteint` si iCloud Drive est coupé.
#[cfg(target_os = "macos")]
fn trouver(_app: &AppHandle) -> Result<Option<PathBuf>, Ouverture> {
    let documents = std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Mobile Documents")).ok_or(Ouverture::Eteint)?;
    if !documents.join("com~apple~CloudDocs").is_dir() {
        return Err(Ouverture::Eteint);
    }
    Ok(Some(documents.join(CONTENEUR).join("Documents")))
}
#[cfg(target_os = "ios")]
fn trouver(app: &AppHandle) -> Result<Option<PathBuf>, Ouverture> {
    Ok(notak_appareil::dossier_icloud(app))
}
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn trouver(_app: &AppHandle) -> Result<Option<PathBuf>, Ouverture> {
    Err(Ouverture::Absent)
}

async fn bloquant<T: Send + 'static>(f: impl FnOnce() -> Result<T, ErreurNuage> + Send + 'static) -> Result<T, ErreurNuage> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|_| ErreurNuage::Indisponible)?
}

fn garder(webview: &Webview, garde: &Origines) -> Result<(), ErreurNuage> {
    exiger(webview, garde, LOCALE).map(|_| ()).map_err(|_| ErreurNuage::Interdit)
}

#[tauri::command]
pub async fn nuage_ouvrir(app: AppHandle, webview: Webview, garde: State<'_, Origines>, nuage: State<'_, Nuage>) -> Result<Ouverture, ErreurNuage> {
    garder(&webview, &garde)?;
    // Sur un iPhone, le système peut mettre un moment à répondre, la première fois : hors du fil principal.
    let trouve = bloquant(move || {
        Ok(match trouver(&app) {
            Ok(Some(r)) => std::fs::create_dir_all(&r).map(|_| Ok(r)).map_err(|e| traduire(&e))?,
            Ok(None) => Err(Ouverture::Eteint),
            Err(o) => Err(o),
        })
    })
    .await?;
    let racine = match trouve {
        Ok(r) => r,
        Err(o) => return Ok(o),
    };
    *nuage.racine.lock().map_err(|_| ErreurNuage::Indisponible)? = Some(racine);
    Ok(Ouverture::Pret { nom: "iCloud Drive".into() })
}

#[tauri::command]
pub async fn nuage_lister(webview: Webview, garde: State<'_, Origines>, nuage: State<'_, Nuage>, chemin: String) -> Result<Vec<Entree>, ErreurNuage> {
    garder(&webview, &garde)?;
    let dossier = chemin_sur(&nuage.racine()?, &chemin)?;
    bloquant(move || lister(&dossier)).await
}

#[tauri::command]
pub async fn nuage_lire(webview: Webview, garde: State<'_, Origines>, nuage: State<'_, Nuage>, chemin: String) -> Result<Response, ErreurNuage> {
    garder(&webview, &garde)?;
    let fichier = chemin_sur(&nuage.racine()?, &chemin)?;
    bloquant(move || lire(&fichier)).await.map(Response::new)
}

/// Le chemin voyage dans l'en-tête `x-notak-chemin` (en `encodeURIComponent`), les octets dans le corps.
#[tauri::command]
pub async fn nuage_ecrire(webview: Webview, garde: State<'_, Origines>, nuage: State<'_, Nuage>, requete: Request<'_>) -> Result<(), ErreurNuage> {
    garder(&webview, &garde)?;
    let chemin = requete
        .headers()
        .get("x-notak-chemin")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| percent_encoding::percent_decode_str(v).decode_utf8().ok())
        .ok_or(ErreurNuage::Illisible)?;
    let fichier = chemin_sur(&nuage.racine()?, &chemin)?;
    let donnees = octets(requete.body()).map_err(|_| ErreurNuage::Illisible)?.into_owned();
    bloquant(move || ecrire(&fichier, &donnees)).await
}

#[tauri::command]
pub async fn nuage_supprimer(webview: Webview, garde: State<'_, Origines>, nuage: State<'_, Nuage>, chemin: String) -> Result<(), ErreurNuage> {
    garder(&webview, &garde)?;
    let fichier = chemin_sur(&nuage.racine()?, &chemin)?;
    bloquant(move || supprimer(&fichier)).await
}

#[tauri::command]
pub async fn nuage_telecharger(app: AppHandle, webview: Webview, garde: State<'_, Origines>, nuage: State<'_, Nuage>, chemin: String) -> Result<(), ErreurNuage> {
    garder(&webview, &garde)?;
    telecharger(&app, chemin_sur(&nuage.racine()?, &chemin)?);
    Ok(())
}

#[cfg(test)]
mod essais {
    use super::*;

    fn dossier_neuf(nom: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("notak-nuage-{nom}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn un_chemin_ne_sort_jamais_du_dossier() {
        let r = Path::new("/racine");
        assert_eq!(chemin_sur(r, "appareils/abc/maj-1.nmj").unwrap(), r.join("appareils/abc/maj-1.nmj"));
        assert_eq!(chemin_sur(r, "").unwrap(), r);
        for mauvais in ["../x", "a/../../x", "./x", "a/.cache", "a\\b", "c:x", "a/b\0c"] {
            assert_eq!(chemin_sur(r, mauvais), Err(ErreurNuage::Illisible), "{mauvais}");
        }
        assert_eq!(chemin_sur(r, &"a/".repeat(9)), Err(ErreurNuage::Illisible));
    }

    #[test]
    fn ecrire_lire_lister_supprimer() {
        let d = dossier_neuf("cycle");
        let f = d.join("appareils/abc/maj-1.nmj");
        ecrire(&f, b"NOTAK").unwrap();
        assert_eq!(lire(&f).unwrap(), b"NOTAK");
        // Rien de provisoire ne reste à côté.
        let noms: Vec<_> = std::fs::read_dir(d.join("appareils/abc")).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(noms, vec![std::ffi::OsString::from("maj-1.nmj")]);
        assert_eq!(lister(&d.join("appareils")).unwrap(), vec![Entree { nom: "abc".into(), genre: "dossier", taille: None, fantome: false }]);
        assert_eq!(
            lister(&d.join("appareils/abc")).unwrap(),
            vec![Entree { nom: "maj-1.nmj".into(), genre: "fichier", taille: Some(5), fantome: false }]
        );
        supprimer(&f).unwrap();
        supprimer(&f).unwrap();
        assert_eq!(lire(&f), Err(ErreurNuage::Absent));
        assert_eq!(lister(&d.join("rien")).unwrap(), vec![]);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn un_fichier_reste_dans_le_nuage_est_un_fantome() {
        let d = dossier_neuf("fantome");
        std::fs::write(d.join(".base-1.nmb.icloud"), b"").unwrap();
        std::fs::write(d.join(".DS_Store"), b"").unwrap();
        assert_eq!(lister(&d).unwrap(), vec![Entree { nom: "base-1.nmb".into(), genre: "fichier", taille: None, fantome: true }]);
        assert_eq!(lire(&d.join("base-1.nmb")), Err(ErreurNuage::Fantome));
        let _ = std::fs::remove_dir_all(&d);
    }
}
