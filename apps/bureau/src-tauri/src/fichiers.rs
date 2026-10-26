/// Les fichiers entre Notak et le système, dans les deux sens.
///
/// - **Une pièce jointe ouverte dans son application** (`ouvrir_fichier`) : la page confie ses octets, la coque les
///   pose dans son cache (`ouverts/`, vidé à chaque lancement) et les ouvre comme le ferait le Finder. Seulement des
///   sortes qui ne s'exécutent pas : images, PDF, sons, vidéos, textes et documents de bureautique sans macros. Jamais
///   un SVG, une page HTML, un script, un programme ni une archive : ce que la page ne peut pas ouvrir ainsi, elle
///   propose de l'enregistrer (`apps/web/src/bureau.ts`). Cinq au plus en dix secondes, 64 Mio chacune, et marquées
///   comme venues d'Internet (sous Windows et macOS) : la page d'un serveur ne lance pas d'applications en rafale, ni un
///   document hors mode protégé. Pour elle, la personne dit d'abord oui, dans une boîte de la coque qui nomme le
///   fichier et le serveur.
/// - **Une copie `.notak` ouverte depuis le système** (un double clic, « Ouvrir avec », une seconde Notak lancée) : la
///   coque la met en file, prévient la page (`notak://fichier-ouvert`) et lui en donne les octets par morceaux
///   (`fichiers_ouverts`, `lire_fichier_ouvert`). Le fichier est ouvert dès son arrivée : c'est lui qu'on lit, même si
///   quelqu'un le remplace entre-temps.
/// - **Les toiles de cet ordinateur copiées vers un serveur** (`confier_copie`) : la page embarquée confie une copie
///   pour le serveur mémorisé, que seule la page de ce serveur trouve dans la file. Elle s'en va si la jonction échoue,
///   si l'on joint un autre serveur, si la fenêtre revient chez elle ou si l'on oublie le serveur.
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::http::HeaderMap;
use tauri::ipc::{Request, Response};
use tauri::{AppHandle, Emitter, Manager, State, Url, Webview};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

use crate::acces::Acces;
use crate::appel::{exiger, nom_envoye, octets, Cadence, Erreur, LOCALE, LOCALE_OU_SERVEUR};
use crate::navigation::{Appelant, Origines};

/// Au-delà, ce n'est plus un fichier qu'on se passe ainsi.
pub const TAILLE_MAX: u64 = 1 << 30;
/// Une pièce jointe : un serveur n'en garde pas de plus de 25 Mio, ni la toile ; la marge suffit.
const PIECE_MAX: u64 = 64 << 20;
/// Les octets d'un fichier ouvert passent par morceaux : la page ne reçoit jamais un gigaoctet d'un coup.
pub const MORCEAU: u64 = 16 << 20;
/// La file ne s'allonge pas sans fin.
const FILE_MAX: usize = 32;
/// Un nom en caractères, et en octets : les systèmes de fichiers comptent 255 octets (un idéogramme en vaut trois).
const NOM_MAX: usize = 120;
const NOM_OCTETS: usize = 240;
pub const EVENEMENT: &str = "notak://fichier-ouvert";

/// Les sortes qu'une autre application peut ouvrir sans rien exécuter. Ni `svg`, `html`, `xml` (des scripts s'y
/// cachent), ni programmes, ni archives, ni documents à macros (`docm`, `xlsm`…).
const EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "bmp", "tif", "tiff", "pdf", "mp3", "m4a", "aac", "wav", "ogg", "oga", "flac", "opus",
    "mp4", "m4v", "mov", "webm", "mkv", "txt", "md", "csv", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf", "pages", "numbers", "key",
];

/// Des caractères invisibles qui retournent ou cachent un nom (`facture\u{202e}fdp.exe` se lit « facture exe.pdf ») :
/// on ne les garde pas.
fn invisible(c: char) -> bool {
    c.is_control() || matches!(c, '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' | '\u{061c}' | '\u{feff}')
}

/// Un nom de fichier qu'on peut poser sur un disque, d'où qu'il vienne : le dernier morceau d'un chemin, sans
/// caractères réservés ni invisibles, sans points ni espaces au bord, 120 caractères et 240 octets au plus (l'extension
/// gardée), et pas un nom de périphérique de Windows (`CON`, `NUL`…). Vide, il devient « fichier ».
pub fn nom_sur(brut: &str) -> String {
    let dernier = brut.rsplit(['/', '\\']).next().unwrap_or("");
    let net: String = dernier.chars().filter(|&c| !invisible(c) && !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|')).collect();
    let bord = |c: char| c == '.' || c.is_whitespace();
    // Les points du début ôtés après l'extension : `.pdf` reste un PDF.
    let net = net.trim_end_matches(bord).trim_start();
    let (brute, extension) = match net.rsplit_once('.') {
        Some((b, e)) if !e.is_empty() && e.chars().count() <= 16 => (b.trim_matches(bord), Some(e)),
        _ => (net.trim_start_matches(bord), None),
    };
    let place = NOM_MAX - extension.map_or(0, |e| e.chars().count() + 1);
    let octets = NOM_OCTETS - extension.map_or(0, |e| e.len() + 1);
    let mut base = String::new();
    for c in brute.chars().take(place) {
        if base.len() + c.len_utf8() > octets {
            break;
        }
        base.push(c);
    }
    base.truncate(base.trim_end_matches(bord).len());
    if base.is_empty() {
        base = "fichier".into();
    }
    let reserve = base.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    let peripherique = matches!(reserve.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$")
        || ((reserve.starts_with("COM") || reserve.starts_with("LPT")) && reserve.chars().count() == 4 && reserve[3..].chars().all(|c| c.is_ascii_digit() || "¹²³".contains(c)));
    if peripherique {
        base.insert(0, '_');
    }
    match extension {
        Some(e) => format!("{base}.{e}"),
        None => base,
    }
}

/// L'extension d'un nom, en minuscules.
fn extension(nom: &str) -> Option<String> {
    nom.rsplit_once('.').map(|(_, e)| e.to_lowercase())
}

pub fn ouvrable(nom: &str) -> bool {
    extension(nom).is_some_and(|e| EXTENSIONS.contains(&e.as_str()))
}

pub fn est_une_copie(nom: &str) -> bool {
    extension(nom).as_deref() == Some("notak")
}

/// Pose des octets dans un dossier neuf de `dossier`, sous ce nom : rien d'autre n'y est jamais écrasé.
fn poser(dossier: &Path, nom: &str, contenu: &[u8]) -> std::io::Result<PathBuf> {
    static SUIVANT: AtomicU64 = AtomicU64::new(0);
    std::fs::create_dir_all(dossier)?;
    let horloge = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    for _ in 0..16 {
        let sous = dossier.join(format!("{horloge:x}-{}-{:x}", std::process::id(), SUIVANT.fetch_add(1, Ordering::Relaxed)));
        match std::fs::create_dir(&sous) {
            Ok(()) => {
                let chemin = sous.join(nom);
                let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&chemin)?;
                f.write_all(contenu)?;
                return Ok(chemin);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::other("aucun dossier libre"))
}

/// Le dossier des pièces jointes ouvertes, vidé au lancement : rien n'y reste d'une fois sur l'autre.
pub fn vider_les_ouverts(app: &AppHandle) {
    if let Ok(cache) = app.path().app_cache_dir() {
        let dossier = cache.join("ouverts");
        if let Err(e) = std::fs::remove_dir_all(&dossier) {
            if e.kind() != std::io::ErrorKind::NotFound {
                eprintln!("Notak : le dossier des fichiers ouverts n'a pas pu être vidé ({e})");
            }
        }
    }
}

/// Marque un fichier écrit pour une page comme venu d'Internet, comme le ferait un navigateur : sous Windows, Office
/// l'ouvre en mode protégé et SmartScreen prévient avant de lancer un programme ; sur macOS, Gatekeeper fait de même.
/// Un échec ne se dit pas (un disque FAT n'a pas de quoi porter la marque) ; Linux n'en a pas.
pub fn marquer_venu_d_internet(chemin: &Path) {
    #[cfg(windows)]
    {
        let mut marque = chemin.as_os_str().to_owned();
        marque.push(":Zone.Identifier");
        let _ = std::fs::write(PathBuf::from(marque), "[ZoneTransfer]\r\nZoneId=3\r\n");
    }
    #[cfg(target_os = "macos")]
    {
        // `xattr` du système plutôt qu'une bibliothèque de plus ; le chemin est absolu, il ne passe pas pour une option.
        let secondes = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        if chemin.is_absolute() {
            let _ = std::process::Command::new("/usr/bin/xattr").arg("-w").arg("com.apple.quarantine").arg(format!("0081;{secondes:x};Notak;")).arg(chemin).status();
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = chemin;
}

/// Combien de pièces jointes s'ouvrent coup sur coup : une personne qui clique n'en ouvre pas plus, une page qui
/// s'emballe (ou un serveur malveillant) ne lance pas des dizaines d'applications.
const OUVERTURES_MAX: usize = 5;
const OUVERTURES_DUREE: Duration = Duration::from_secs(10);

/// Les pièces jointes ouvertes récemment, et la question posée à la personne pour une page de serveur : une seule à la
/// fois, une page ne les empile pas.
pub struct Ouvertures {
    cadence: Cadence,
    question: AtomicBool,
}

impl Default for Ouvertures {
    fn default() -> Self {
        Self { cadence: Cadence::new(OUVERTURES_MAX, OUVERTURES_DUREE), question: AtomicBool::new(false) }
    }
}

/// Libère la question à la fin, même interrompue.
struct Question<'a>(&'a AtomicBool);

impl Drop for Question<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl Ouvertures {
    fn poser_question(&self) -> Option<Question<'_>> {
        self.question.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).ok().map(|_| Question(&self.question))
    }
}

/// L'hôte d'une origine, port compris (`https://notak.exemple.fr:8443` → `notak.exemple.fr:8443`).
fn hote_de(origine: &str) -> String {
    Url::parse(origine)
        .ok()
        .and_then(|u| u.host_str().map(|h| u.port().map_or_else(|| h.to_string(), |p| format!("{h}:{p}"))))
        .unwrap_or_else(|| origine.to_string())
}

/// La question se pose dans la langue de la page, telle qu'elle la dit (`x-notak-langue` : elle n'en change que les
/// mots) ; sans elle, dans celle du système (`menu::en_francais`).
fn en_francais(entetes: &HeaderMap) -> bool {
    match entetes.get("x-notak-langue").and_then(|v| v.to_str().ok()).filter(|l| !l.trim().is_empty()) {
        Some(l) => crate::menu::francais(Some(l)),
        None => crate::menu::en_francais(),
    }
}

/// La question avant d'ouvrir un fichier venu d'un serveur, et ses deux boutons.
fn question_d_ouverture(nom: &str, hote: &str, francais: bool) -> (String, String, String) {
    if francais {
        (format!("« {nom} » vient de {hote}. L’ouvrir avec l’application de votre ordinateur ?"), "Ouvrir".into(), "Annuler".into())
    } else {
        (format!("“{nom}” comes from {hote}. Open it with the app on your computer?"), "Open".into(), "Cancel".into())
    }
}

/// Ouvre une pièce jointe dans l'application que le système lui associe. Pour la page d'un serveur, après un oui de la
/// personne : une page compromise ne lance rien en silence.
#[tauri::command]
pub async fn ouvrir_fichier(app: AppHandle, webview: Webview, garde: State<'_, Origines>, ouvertures: State<'_, Ouvertures>, requete: Request<'_>) -> Result<(), Erreur> {
    let appelant = exiger(&webview, &garde, LOCALE_OU_SERVEUR)?;
    let nom = nom_sur(&nom_envoye(requete.headers()));
    if !ouvrable(&nom) {
        return Err(Erreur::TypeRefuse);
    }
    let contenu = octets(requete.body())?;
    if contenu.len() as u64 > PIECE_MAX {
        return Err(Erreur::TropGros);
    }
    if !ouvertures.cadence.permise(Instant::now()) {
        return Err(Erreur::TropVite);
    }
    if appelant == Appelant::Serveur {
        let hote = garde.serveur.lire().map(|o| hote_de(&o)).ok_or(Erreur::Interdit)?;
        let _une_seule = ouvertures.poser_question().ok_or(Erreur::TropVite)?;
        let (texte, oui, non) = question_d_ouverture(&nom, &hote, en_francais(requete.headers()));
        let question = app.dialog().message(texte).title("Notak").buttons(MessageDialogButtons::OkCancelCustom(oui, non));
        // Hors du fil principal, comme « Enregistrer sous » : la boîte attend la personne sans figer la fenêtre.
        let accord = tauri::async_runtime::spawn_blocking(move || question.blocking_show()).await.map_err(Erreur::echec)?;
        if !accord {
            return Err(Erreur::Annule);
        }
    }
    let dossier = app.path().app_cache_dir().map_err(Erreur::echec)?.join("ouverts");
    let chemin = poser(&dossier, &nom, &contenu).map_err(Erreur::echec)?;
    // Un chemin absolu : il ne peut pas passer pour une option de `open` ou `xdg-open`.
    if !chemin.is_absolute() {
        return Err(Erreur::Illisible);
    }
    marquer_venu_d_internet(&chemin);
    app.opener().open_path(chemin.to_string_lossy(), None::<&str>).map_err(Erreur::echec)
}

enum Source {
    /// Un fichier du disque, ouvert à son arrivée.
    Disque(File),
    /// Une copie confiée par la page embarquée, pour la page du serveur.
    Confiee(Vec<u8>),
}

struct Ouvert {
    id: String,
    nom: String,
    taille: u64,
    source: Source,
    /// Pour une copie confiée : l'origine du serveur à qui elle est destinée, et lui seul.
    destination: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FichierOuvert {
    pub id: String,
    pub nom: String,
    pub taille: u64,
    /// Les toiles de cet ordinateur, confiées par la page embarquée (`confier_copie`), et non un fichier du disque :
    /// la page du serveur ne propose pas de les « ouvrir sur cet ordinateur », d'où elles viennent.
    pub confiee: bool,
}

/// La file des fichiers qui attendent la page.
#[derive(Default)]
pub struct Ouverts {
    file: Mutex<Vec<Ouvert>>,
    suivant: AtomicU64,
}

impl Ouverts {
    fn ajouter(&self, nom: String, taille: u64, source: Source, destination: Option<String>) -> bool {
        let mut file = self.file.lock().unwrap_or_else(PoisonError::into_inner);
        if file.len() >= FILE_MAX {
            eprintln!("Notak : trop de fichiers en attente, {nom} est ignoré");
            return false;
        }
        let id = format!("f{}", self.suivant.fetch_add(1, Ordering::Relaxed) + 1);
        file.push(Ouvert { id, nom, taille, source, destination });
        true
    }

    /// Une copie `.notak` du disque : un fichier qui existe, pas trop gros.
    pub fn ajouter_chemin(&self, chemin: &Path) -> bool {
        let Some(nom) = chemin.file_name().map(|n| nom_sur(&n.to_string_lossy())) else { return false };
        if !est_une_copie(&nom) {
            return false;
        }
        // Ni dossier ni tube nommé (qu'ouvrir ferait attendre) : un fichier ordinaire, vérifié avant et après l'ouverture.
        if !std::fs::metadata(chemin).is_ok_and(|m| m.is_file()) {
            return false;
        }
        let Ok(fichier) = File::open(chemin) else { return false };
        match fichier.metadata() {
            Ok(m) if m.is_file() && m.len() <= TAILLE_MAX => self.ajouter(nom, m.len(), Source::Disque(fichier), None),
            _ => false,
        }
    }

    /// Une copie confiée pour le serveur `destination` : elle remplace celle d'avant, qu'aucun serveur n'est venu
    /// chercher. La file pleine (des copies du disque en attente), elle ne trouve pas sa place.
    fn confier(&self, nom: String, contenu: Vec<u8>, destination: String) -> Result<(), Erreur> {
        self.retirer_confiees(None);
        if self.ajouter(nom, contenu.len() as u64, Source::Confiee(contenu), Some(destination)) {
            Ok(())
        } else {
            Err(Erreur::FilePleine)
        }
    }

    /// Retire les copies confiées, sauf celle destinée à `sauf` : la jonction a échoué, on en joint un autre, la
    /// fenêtre est revenue chez elle. Une copie de toutes les toiles ne reste pas en mémoire pour personne.
    pub fn retirer_confiees(&self, sauf: Option<&str>) {
        self.file.lock().unwrap_or_else(PoisonError::into_inner).retain(|o| !matches!(o.source, Source::Confiee(_)) || (sauf.is_some() && o.destination.as_deref() == sauf));
    }

    /// Ce qui attend cette page : la page embarquée ne voit pas ce qu'elle a confié au serveur, ni un autre serveur.
    fn lister(&self, appelant: Appelant, courant: Option<&str>) -> Vec<FichierOuvert> {
        let file = self.file.lock().unwrap_or_else(PoisonError::into_inner);
        file.iter()
            .filter(|o| visible(o, appelant, courant))
            .map(|o| FichierOuvert { id: o.id.clone(), nom: o.nom.clone(), taille: o.taille, confiee: matches!(o.source, Source::Confiee(_)) })
            .collect()
    }

    /// Retire un fichier qui attend, sans le lire : la personne n'en veut pas ici (« Pas maintenant »).
    fn ecarter(&self, appelant: Appelant, courant: Option<&str>, id: &str) -> bool {
        let mut file = self.file.lock().unwrap_or_else(PoisonError::into_inner);
        let avant = file.len();
        file.retain(|o| !(o.id == id && visible(o, appelant, courant)));
        file.len() != avant
    }

    /// Un morceau, à partir de `debut` ; le dernier retire le fichier de la file.
    fn lire(&self, appelant: Appelant, courant: Option<&str>, id: &str, debut: u64) -> Result<Vec<u8>, Erreur> {
        let mut file = self.file.lock().unwrap_or_else(PoisonError::into_inner);
        let i = file.iter().position(|o| o.id == id && visible(o, appelant, courant)).ok_or(Erreur::Introuvable)?;
        let o = &mut file[i];
        if debut > o.taille {
            return Err(Erreur::Illisible);
        }
        let voulu = MORCEAU.min(o.taille - debut);
        let morceau = match &mut o.source {
            Source::Confiee(c) => c[debut as usize..(debut + voulu) as usize].to_vec(),
            Source::Disque(f) => {
                f.seek(SeekFrom::Start(debut)).map_err(Erreur::echec)?;
                let mut m = Vec::with_capacity(voulu as usize);
                f.take(voulu).read_to_end(&mut m).map_err(Erreur::echec)?;
                m
            }
        };
        // Le dernier morceau, ou un fichier raccourci depuis : il n'y a plus rien à lire.
        if debut + morceau.len() as u64 >= o.taille || (morceau.len() as u64) < voulu {
            file.remove(i);
        }
        Ok(morceau)
    }
}

/// Une copie du disque, pour la page embarquée comme pour celle du serveur ; une copie confiée, pour la page du serveur
/// à qui elle est destinée (`courant`, le serveur où est la fenêtre), et nulle autre.
fn visible(o: &Ouvert, appelant: Appelant, courant: Option<&str>) -> bool {
    match o.source {
        Source::Disque(_) => true,
        Source::Confiee(_) => appelant == Appelant::Serveur && courant.is_some() && o.destination.as_deref() == courant,
    }
}

/// Prévient la page qu'un fichier l'attend, et lui rend la fenêtre.
fn prevenir(app: &AppHandle) {
    let _ = app.emit(EVENEMENT, ());
    if let Some(f) = app.get_webview_window("principale") {
        let _ = f.unminimize();
        let _ = f.show();
        let _ = f.set_focus();
    }
}

/// Des chemins reçus du système : ceux de copies `.notak` rejoignent la file.
pub fn recevoir(app: &AppHandle, chemins: impl IntoIterator<Item = PathBuf>) {
    let ouverts = app.state::<Ouverts>();
    let mut recu = false;
    for c in chemins {
        recu |= ouverts.ajouter_chemin(&c);
    }
    if recu {
        prevenir(app);
    }
}

/// Les fichiers d'une ligne de commande (Windows, Linux) : ni le programme, ni les options, et un chemin relatif lu
/// depuis le dossier où elle a été lancée.
pub fn chemins_de_la_ligne(arguments: impl IntoIterator<Item = String>, dossier: &Path) -> Vec<PathBuf> {
    arguments
        .into_iter()
        .skip(1)
        .filter(|a| !a.is_empty() && !a.starts_with('-'))
        .filter_map(|a| match Url::parse(&a) {
            Ok(u) if u.scheme() == "file" => u.to_file_path().ok(),
            _ => Some(PathBuf::from(a)),
        })
        .map(|p| if p.is_absolute() { p } else { dossier.join(p) })
        .collect()
}

/// Les fichiers ouverts depuis le Finder (macOS) : des adresses `file://`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn chemins_des_adresses(urls: &[Url]) -> Vec<PathBuf> {
    urls.iter().filter(|u| u.scheme() == "file").filter_map(|u| u.to_file_path().ok()).collect()
}

/// Les fichiers qui attendent la page.
#[tauri::command]
pub async fn fichiers_ouverts(webview: Webview, garde: State<'_, Origines>, ouverts: State<'_, Ouverts>) -> Result<Vec<FichierOuvert>, Erreur> {
    let appelant = exiger(&webview, &garde, LOCALE_OU_SERVEUR)?;
    Ok(ouverts.lister(appelant, garde.serveur.lire().as_deref()))
}

/// Un morceau d'un fichier qui attend, en octets bruts.
#[tauri::command]
pub async fn lire_fichier_ouvert(webview: Webview, garde: State<'_, Origines>, ouverts: State<'_, Ouverts>, id: String, debut: u64) -> Result<Response, Erreur> {
    let appelant = exiger(&webview, &garde, LOCALE_OU_SERVEUR)?;
    Ok(Response::new(ouverts.lire(appelant, garde.serveur.lire().as_deref(), &id, debut)?))
}

/// Écarte un fichier qui attend, sans le lire.
#[tauri::command]
pub async fn ecarter_fichier_ouvert(webview: Webview, garde: State<'_, Origines>, ouverts: State<'_, Ouverts>, id: String) -> Result<(), Erreur> {
    let appelant = exiger(&webview, &garde, LOCALE_OU_SERVEUR)?;
    if ouverts.ecarter(appelant, garde.serveur.lire().as_deref(), &id) {
        Ok(())
    } else {
        Err(Erreur::Introuvable)
    }
}

/// Confie une copie `.notak` à la file, pour la page du serveur mémorisé, qu'on va joindre : elle seule la trouvera.
#[tauri::command]
pub async fn confier_copie(webview: Webview, garde: State<'_, Origines>, etat: State<'_, Acces>, ouverts: State<'_, Ouverts>, requete: Request<'_>) -> Result<(), Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    // Sans serveur mémorisé, la copie n'a pas de destinataire.
    let destination = etat.reglage.lire().serveur.ok_or(Erreur::Interdit)?;
    let nom = nom_sur(&nom_envoye(requete.headers()));
    if !est_une_copie(&nom) {
        return Err(Erreur::TypeRefuse);
    }
    let contenu = octets(requete.body())?;
    if contenu.len() as u64 > TAILLE_MAX {
        return Err(Erreur::TropGros);
    }
    // Pas d'événement : la page embarquée, qui écoute, n'a rien à recevoir ; celle du serveur lira la file en arrivant.
    ouverts.confier(nom, contenu.into_owned(), destination)
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn un_nom_qu_on_peut_poser_sur_un_disque() {
        let cas = [
            ("photo.png", "photo.png"),
            ("Réunion d'été.PDF", "Réunion d'été.PDF"),
            ("../../etc/passwd", "passwd"),
            ("..\\..\\Windows\\system32\\evil.dll", "evil.dll"),
            ("C:\\Users\\moi\\note.txt", "note.txt"),
            ("a<b>c:d*e?f\"g|h.txt", "abcdefgh.txt"),
            ("ligne\nretour\t.md", "ligneretour.md"),
            ("  ..cache.txt.. ", "cache.txt"),
            ("rapport.pdf .", "rapport.pdf"),
            ("facture\u{202e}fdp.exe", "facturefdp.exe"),
            ("note.txt:flux.exe", "note.txtflux.exe"),
            ("", "fichier"),
            ("...", "fichier"),
            (".pdf", "fichier.pdf"),
            ("/", "fichier"),
            ("CON.txt", "_CON.txt"),
            ("nul", "_nul"),
            ("com1.tar.pdf", "_com1.tar.pdf"),
            ("LPT9.png", "_LPT9.png"),
            ("console.txt", "console.txt"),
            ("COM10.txt", "COM10.txt"),
        ];
        for (brut, net) in cas {
            assert_eq!(nom_sur(brut), net, "{brut:?}");
        }
        let long = nom_sur(&format!("{}.pdf", "e".repeat(300)));
        assert_eq!(long.chars().count(), NOM_MAX);
        assert!(long.ends_with(".pdf"));
        let sans_extension = nom_sur(&"a".repeat(300));
        assert_eq!(sans_extension.chars().count(), NOM_MAX);
        // Des caractères de plusieurs octets : le nom tient dans ce que compte un disque, coupé entre deux caractères.
        for lettre in ["é", "日", "🙂"] {
            let n = nom_sur(&format!("{}.pdf", lettre.repeat(200)));
            assert!(n.len() <= NOM_OCTETS && n.chars().count() <= NOM_MAX, "{lettre} : {} octets", n.len());
            assert!(n.ends_with(".pdf") && n.trim_end_matches(".pdf").chars().all(|c| c.to_string() == lettre), "{lettre}");
        }
        assert!(nom_sur(&"日".repeat(200)).len() <= NOM_OCTETS);
    }

    #[test]
    fn seules_les_sortes_qui_ne_s_executent_pas_s_ouvrent() {
        for nom in ["a.png", "a.JPG", "a.heic", "a.pdf", "a.mp3", "a.opus", "a.mkv", "a.txt", "a.md", "a.csv", "a.docx", "a.XLSX", "a.pptx", "a.odt", "a.rtf", "a.pages", "a.numbers", "a.key", "a.exe.pdf"] {
            assert!(ouvrable(&nom_sur(nom)), "{nom}");
        }
        for nom in [
            "a.svg", "a.html", "a.htm", "a.xhtml", "a.xml", "a.js", "a.mjs", "a.sh", "a.command", "a.bat", "a.cmd", "a.ps1", "a.vbs", "a.exe", "a.msi", "a.dll", "a.app",
            "a.dmg", "a.pkg", "a.jar", "a.py", "a.desktop", "a.lnk", "a.url", "a.webloc", "a.zip", "a.tar", "a.gz", "a.7z", "a.rar", "a.docm", "a.xlsm", "a.pptm", "a.doc",
            "a.xls", "a.notak", "pdf", "a", "a.pdf.exe", "a.pdf:exe", "facture\u{202e}fdp.exe",
        ] {
            assert!(!ouvrable(&nom_sur(nom)), "{nom}");
        }
        assert!(est_une_copie("Toiles 2026-10-26.NOTAK"));
        assert!(!est_une_copie("toiles.notak.zip"));
    }

    #[test]
    fn la_ligne_de_commande_donne_ses_fichiers() {
        let dossier = Path::new(if cfg!(windows) { "C:\\Users\\moi" } else { "/home/moi" });
        let args = ["notak", "-psn_0_12345", "--flag", "", "toiles.notak", "/tmp/copie.notak"].map(String::from);
        let chemins = chemins_de_la_ligne(args, dossier);
        assert_eq!(chemins.len(), 2);
        assert_eq!(chemins[0], dossier.join("toiles.notak"));
        if !cfg!(windows) {
            assert_eq!(chemins[1], PathBuf::from("/tmp/copie.notak"));
            let fichier = chemins_de_la_ligne(["notak", "file:///tmp/a%20b.notak"].map(String::from), dossier);
            assert_eq!(fichier, vec![PathBuf::from("/tmp/a b.notak")]);
        }
        assert_eq!(chemins_des_adresses(&[Url::parse("https://exemple.fr/a.notak").unwrap()]), Vec::<PathBuf>::new());
    }

    fn dossier_d_essai(nom: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("notak-{nom}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn une_copie_du_disque_se_lit_par_morceaux_puis_s_en_va() {
        let d = dossier_d_essai("file");
        let contenu: Vec<u8> = (0..(MORCEAU + 1000)).map(|i| (i % 251) as u8).collect();
        std::fs::write(d.join("Toiles.NOTAK"), &contenu).unwrap();
        std::fs::write(d.join("vide.notak"), b"").unwrap();
        std::fs::write(d.join("photo.png"), b"png").unwrap();
        std::fs::create_dir_all(d.join("dossier.notak")).unwrap();
        let o = Ouverts::default();
        assert!(o.ajouter_chemin(&d.join("Toiles.NOTAK")));
        assert!(o.ajouter_chemin(&d.join("vide.notak")));
        assert!(!o.ajouter_chemin(&d.join("photo.png")));
        assert!(!o.ajouter_chemin(&d.join("absent.notak")));
        assert!(!o.ajouter_chemin(&d.join("dossier.notak")));
        let liste = o.lister(Appelant::Serveur, Some(A));
        assert_eq!(liste, vec![FichierOuvert { id: "f1".into(), nom: "Toiles.NOTAK".into(), taille: contenu.len() as u64, confiee: false }, FichierOuvert { id: "f2".into(), nom: "vide.notak".into(), taille: 0, confiee: false }]);
        // Remplacé après son arrivée : c'est le fichier ouvert qu'on lit.
        std::fs::remove_file(d.join("Toiles.NOTAK")).unwrap();
        std::fs::write(d.join("Toiles.NOTAK"), b"autre chose").unwrap();
        assert_eq!(o.lire(Appelant::Locale, None, "f1", contenu.len() as u64 + 1), Err(Erreur::Illisible));
        let premier = o.lire(Appelant::Locale, None, "f1", 0).unwrap();
        assert_eq!(premier.len() as u64, MORCEAU);
        assert_eq!(o.lister(Appelant::Locale, None).len(), 2);
        let second = o.lire(Appelant::Locale, None, "f1", MORCEAU).unwrap();
        assert_eq!([premier, second].concat(), contenu);
        assert_eq!(o.lire(Appelant::Locale, None, "f1", 0), Err(Erreur::Introuvable));
        assert_eq!(o.lire(Appelant::Locale, None, "f2", 0), Ok(vec![]));
        assert!(o.lister(Appelant::Locale, None).is_empty());
        std::fs::remove_dir_all(&d).unwrap();
    }

    const A: &str = "https://notak.exemple.fr";
    const B: &str = "https://autre.exemple.fr";

    #[test]
    fn une_copie_confiee_n_est_que_pour_son_serveur() {
        let o = Ouverts::default();
        assert_eq!(o.confier("Toiles.notak".into(), vec![1, 2, 3], A.into()), Ok(()));
        assert_eq!(o.confier("Toiles.notak".into(), vec![4, 5], A.into()), Ok(()));
        assert!(o.lister(Appelant::Locale, None).is_empty());
        assert!(o.lister(Appelant::Locale, Some(A)).is_empty(), "même pendant qu'on joint son serveur");
        // Un autre serveur, ou une page qui n'est plus sur un serveur, ne la voit pas.
        assert!(o.lister(Appelant::Serveur, Some(B)).is_empty());
        assert!(o.lister(Appelant::Serveur, None).is_empty());
        let liste = o.lister(Appelant::Serveur, Some(A));
        assert_eq!(liste.len(), 1, "la copie d'avant est remplacée");
        assert!(liste[0].confiee);
        assert_eq!(o.lire(Appelant::Locale, None, &liste[0].id, 0), Err(Erreur::Introuvable));
        assert_eq!(o.lire(Appelant::Serveur, Some(B), &liste[0].id, 0), Err(Erreur::Introuvable));
        assert!(!o.ecarter(Appelant::Serveur, Some(B), &liste[0].id));
        assert_eq!(o.lire(Appelant::Serveur, Some(A), &liste[0].id, 0), Ok(vec![4, 5]));
        assert!(o.lister(Appelant::Serveur, Some(A)).is_empty());
    }

    #[test]
    fn une_copie_confiee_s_en_va_quand_son_serveur_n_est_plus_le_bon() {
        let d = dossier_d_essai("purge");
        std::fs::write(d.join("recue.notak"), b"x").unwrap();
        let o = Ouverts::default();
        assert!(o.ajouter_chemin(&d.join("recue.notak")));
        o.confier("Toiles.notak".into(), vec![1], A.into()).unwrap();
        // On joint A : sa copie reste.
        o.retirer_confiees(Some(A));
        assert_eq!(o.lister(Appelant::Serveur, Some(A)).len(), 2);
        // On joint B (ou la jonction échoue, ou la fenêtre revient) : elle s'en va ; la copie du disque reste.
        o.retirer_confiees(Some(B));
        assert_eq!(o.lister(Appelant::Serveur, Some(A)).iter().map(|f| f.confiee).collect::<Vec<_>>(), vec![false]);
        o.confier("Toiles.notak".into(), vec![1], A.into()).unwrap();
        o.retirer_confiees(None);
        assert_eq!(o.lister(Appelant::Serveur, Some(A)).len(), 1);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn un_fichier_s_ecarte_sans_se_lire() {
        let o = Ouverts::default();
        o.confier("Toiles.notak".into(), vec![1], A.into()).unwrap();
        let id = o.lister(Appelant::Serveur, Some(A))[0].id.clone();
        assert!(!o.ecarter(Appelant::Locale, None, &id), "la page embarquée ne voit pas la copie confiée");
        assert!(o.ecarter(Appelant::Serveur, Some(A), &id));
        assert!(!o.ecarter(Appelant::Serveur, Some(A), &id));
        assert!(o.lister(Appelant::Serveur, Some(A)).is_empty());
    }

    #[test]
    fn la_file_ne_s_allonge_pas_sans_fin() {
        let o = Ouverts::default();
        for _ in 0..FILE_MAX {
            assert!(o.ajouter("a.notak".into(), 0, Source::Confiee(vec![]), None));
        }
        assert!(!o.ajouter("a.notak".into(), 0, Source::Confiee(vec![]), None));
        // Pleine de copies du disque, la file n'a pas de place pour une copie confiée : ce n'est pas qu'elle est trop grosse.
        let d = dossier_d_essai("pleine");
        std::fs::write(d.join("a.notak"), b"x").unwrap();
        let pleine = Ouverts::default();
        for _ in 0..FILE_MAX {
            assert!(pleine.ajouter_chemin(&d.join("a.notak")));
        }
        assert_eq!(pleine.confier("Toiles.notak".into(), vec![1], A.into()), Err(Erreur::FilePleine));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn des_pieces_jointes_coup_sur_coup_mais_pas_sans_fin() {
        let o = Ouvertures::default();
        let t = Instant::now();
        for i in 0..OUVERTURES_MAX {
            assert!(o.cadence.permise(t + Duration::from_millis(i as u64)), "{i}");
        }
        assert!(!o.cadence.permise(t + Duration::from_secs(1)));
        assert!(o.cadence.permise(t + OUVERTURES_DUREE));
    }

    #[test]
    fn une_seule_question_a_la_fois() {
        let o = Ouvertures::default();
        let premiere = o.poser_question();
        assert!(premiere.is_some());
        assert!(o.poser_question().is_none(), "une page n'empile pas les boîtes");
        drop(premiere);
        assert!(o.poser_question().is_some());
    }

    #[test]
    fn la_question_nomme_le_fichier_et_le_serveur() {
        assert_eq!(hote_de("https://notak.exemple.fr"), "notak.exemple.fr");
        assert_eq!(hote_de("https://notak.exemple.fr:8443"), "notak.exemple.fr:8443");
        assert_eq!(hote_de("http://127.0.0.1:3005"), "127.0.0.1:3005");
        let (texte, oui, non) = question_d_ouverture("devis.pdf", "notak.exemple.fr", true);
        assert_eq!((texte.as_str(), oui.as_str(), non.as_str()), ("« devis.pdf » vient de notak.exemple.fr. L’ouvrir avec l’application de votre ordinateur ?", "Ouvrir", "Annuler"));
        let (texte, oui, non) = question_d_ouverture("quote.pdf", "notak.example.com", false);
        assert_eq!((texte.as_str(), oui.as_str(), non.as_str()), ("“quote.pdf” comes from notak.example.com. Open it with the app on your computer?", "Open", "Cancel"));
        let mut e = HeaderMap::new();
        e.insert("x-notak-langue", "en".parse().unwrap());
        assert!(!en_francais(&e));
        e.insert("x-notak-langue", "fr".parse().unwrap());
        assert!(en_francais(&e));
    }

    #[test]
    fn un_fichier_marque_reste_lisible() {
        let d = dossier_d_essai("marque");
        let chemin = poser(&d, "devis.pdf", b"pdf").unwrap();
        marquer_venu_d_internet(&chemin);
        assert_eq!(std::fs::read(&chemin).unwrap(), b"pdf");
        if cfg!(windows) {
            let mut marque = chemin.clone().into_os_string();
            marque.push(":Zone.Identifier");
            assert!(std::fs::read_to_string(PathBuf::from(marque)).is_ok_and(|m| m.contains("ZoneId=3")));
        }
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn une_piece_jointe_se_pose_dans_un_dossier_neuf() {
        let d = dossier_d_essai("poser");
        let a = poser(&d, "note.txt", b"un").unwrap();
        let b = poser(&d, "note.txt", b"deux").unwrap();
        assert_ne!(a, b);
        assert_eq!(std::fs::read(&a).unwrap(), b"un");
        assert_eq!(std::fs::read(&b).unwrap(), b"deux");
        assert!(a.starts_with(&d) && a.file_name().unwrap() == "note.txt");
        std::fs::remove_dir_all(&d).unwrap();
    }
}
