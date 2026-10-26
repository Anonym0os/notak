/// Joindre un serveur Notak depuis l'app : la personne tape une adresse dans la page embarquée, la coque vérifie que
/// c'est bien un serveur Notak, puis y envoie la fenêtre. Ses pages reçoivent alors une partie des droits de la coque,
/// et elles seules.
///
/// - **L'adresse est relue ici**, pas dans la page : `https` seulement (du HTTP simple pour cet ordinateur), ni
///   identifiants, ni paramètres, ni chemin, ni IPv6 ; un nom international en punycode. On n'en garde que l'origine.
/// - **On vérifie avant d'y aller** (`GET /api/sante`, sans suivre de redirection, 10 s, 64 Kio au plus) : un serveur
///   qui se dit ailleurs, ou une redirection, n'emmène pas la fenêtre ; on propose l'adresse (`redirige`), la personne
///   décide. Un certificat refusé se dit comme tel.
/// - **Une capacité par origine**, ajoutée une fois : quelques commandes, jamais celles qui choisissent un serveur ou
///   règlent la coque (`DROITS_SERVEUR`). Tauri n'en retire pas : une page d'un serveur quitté garde la sienne jusqu'au
///   redémarrage, mais la fenêtre n'y retourne plus (`navigation.rs`) et la coque ne lui répond plus (`appel::exiger`).
/// - **Les chemins choisis par une page ne servent pas à l'autre** : changer de page oublie ceux d'« Enregistrer sous ».
/// - **Une page muette ramène chez soi** : si le serveur ne se signale pas (`acces`) dans les 20 s, la fenêtre revient
///   à l'écran d'accès (`?acces&erreur=muette`).
///
/// La page embarquée ne joint jamais un serveur d'après les paramètres de son adresse (`?acces`, `erreur=…`) : elle ne
/// fait que les afficher. Seuls ses réglages (`acces`) et ce que tape la personne mènent ailleurs.
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::CapabilityBuilder;
use tauri::utils::acl::RemoteUrlPattern;
use tauri::{AppHandle, Manager, State, Url, Webview};
use url::Host;

use crate::appel::{exiger, Erreur, LOCALE, LOCALE_OU_SERVEUR};
use crate::navigation::{Appelant, Origines};
use crate::reglages::{Ouvrir, Reglage};
use crate::Emplacements;

/// Ce que peut une page du serveur choisi. Ni `joindre_serveur`, ni `oublier_serveur`, ni `regler_maj_auto`, ni
/// `confier_copie` : un serveur ne choisit pas où va la fenêtre, et ne règle pas la coque.
pub const DROITS_SERVEUR: &[&str] = &[
    "core:window:allow-start-dragging",
    "core:window:allow-internal-toggle-maximize",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "allow-acces",
    "allow-revenir-ici",
    "allow-preparer-mise-a-jour",
    "allow-installer-mise-a-jour",
    "allow-choisir-emplacement",
    "allow-ecrire-fichier",
    "allow-capturer-fenetre",
    "allow-ouvrir-fichier",
    "allow-fichiers-ouverts",
    "allow-lire-fichier-ouvert",
    "allow-ecarter-fichier-ouvert",
];

const DELAI: Duration = Duration::from_secs(10);
const CORPS_MAX: usize = 64 * 1024;
/// Le temps qu'a la page d'un serveur pour se signaler.
const GRACE: Duration = Duration::from_secs(20);

/// L'origine d'un serveur Notak, à partir de ce que la personne a tapé.
pub fn normaliser(adresse: &str) -> Result<String, Erreur> {
    let adresse = adresse.trim();
    if adresse.is_empty() || adresse.len() > 2048 || adresse.chars().any(char::is_control) {
        return Err(Erreur::AdresseInvalide);
    }
    let url = if adresse.contains("://") { Url::parse(adresse) } else { Url::parse(&format!("https://{adresse}")) };
    origine_de(&url.map_err(|_| Erreur::AdresseInvalide)?)
}

/// L'origine d'une adresse déjà lue, si c'est celle d'un serveur possible, à sa racine.
fn origine_de(url: &Url) -> Result<String, Erreur> {
    let locale = match url.host() {
        Some(Host::Domain(d)) => d == "localhost",
        Some(Host::Ipv4(ip)) => ip == Ipv4Addr::LOCALHOST,
        _ => false,
    };
    match url.scheme() {
        "https" => {}
        // Les webviews (macOS surtout) refusent le HTTP simple hors de la machine ; un mot de passe n'y passe pas en clair.
        "http" if locale => {}
        "http" => return Err(Erreur::HttpsRequis),
        _ => return Err(Erreur::AdresseInvalide),
    }
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || url.port() == Some(0) {
        return Err(Erreur::AdresseInvalide);
    }
    match url.host() {
        Some(Host::Domain(d)) if domaine_sur(d) => {}
        Some(Host::Ipv4(_)) => {}
        // IPv6 : son adresse entre crochets ne se lit pas sans risque dans un motif de capacité.
        _ => return Err(Erreur::AdresseInvalide),
    }
    if url.path() != "/" {
        return Err(Erreur::Chemin);
    }
    Ok(url.origin().ascii_serialization())
}

/// Un nom d'hôte ordinaire, déjà en punycode : des étiquettes de lettres, chiffres et tirets. Rien de ce qu'un motif
/// d'adresse lirait autrement (`*`, `(`, `:`…), et rien sous `.localhost`, où vit l'application (`tauri.localhost`).
fn domaine_sur(d: &str) -> bool {
    d.len() <= 253
        && !d.ends_with(".localhost")
        && d.split('.').all(|e| {
            (1..=63).contains(&e.len())
                && !e.starts_with('-')
                && !e.ends_with('-')
                && e.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
}

/// Ce que la page apprend d'un serveur joint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Joint {
    pub origine: String,
    pub nom: Option<String>,
    pub version: String,
}

/// Le client qui interroge un serveur : il ne suit aucune redirection et ne lit pas sans fin.
pub fn client(proxy_systeme: bool, delai: Duration, version: &str) -> Result<reqwest::Client, Erreur> {
    // Sans moteur installé, construire un client arrête l'app (`run` l'installe aussi, avant tout).
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut c = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(delai).user_agent(format!("Notak-bureau/{version}"));
    if !proxy_systeme {
        c = c.no_proxy();
    }
    c.build().map_err(Erreur::echec)
}

struct Reponse {
    statut: u16,
    location: Option<String>,
    corps: Vec<u8>,
}

async fn obtenir(client: &reqwest::Client, url: &str) -> Result<Reponse, Erreur> {
    let mut r = client.get(url).header(reqwest::header::ACCEPT, "application/json").send().await.map_err(|e| classer(&e))?;
    let statut = r.status().as_u16();
    let location = r.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok()).map(str::to_string);
    let mut corps = Vec::new();
    if statut == 200 {
        if r.content_length().is_some_and(|n| n > CORPS_MAX as u64) {
            return Err(Erreur::PasNotak);
        }
        while let Some(bout) = r.chunk().await.map_err(|e| classer(&e))? {
            if corps.len() + bout.len() > CORPS_MAX {
                return Err(Erreur::PasNotak);
            }
            corps.extend_from_slice(&bout);
        }
    }
    Ok(Reponse { statut, location, corps })
}

/// Ce qui a empêché de joindre le serveur : le délai, le certificat, ou le reste.
fn classer(e: &reqwest::Error) -> Erreur {
    if e.is_timeout() {
        return Erreur::Delai;
    }
    classer_source(e)
}

fn classer_source(e: &(dyn std::error::Error + 'static)) -> Erreur {
    let certificat = |r: &rustls::Error| {
        matches!(r, rustls::Error::InvalidCertificate(_) | rustls::Error::NoCertificatesPresented | rustls::Error::InvalidCertRevocationList(_))
    };
    let mut source = Some(e);
    while let Some(s) = source {
        if s.downcast_ref::<rustls::Error>().is_some_and(certificat) {
            return Erreur::Certificat;
        }
        // Une erreur d'entrée-sortie cache la sienne : sa `source()` saute l'erreur qu'elle porte.
        if let Some(io) = s.downcast_ref::<std::io::Error>() {
            if io.get_ref().and_then(|i| i.downcast_ref::<rustls::Error>()).is_some_and(certificat) {
                return Erreur::Certificat;
            }
            if io.kind() == std::io::ErrorKind::TimedOut {
                return Erreur::Delai;
            }
        }
        source = s.source();
    }
    Erreur::Injoignable
}

fn objet(corps: &[u8]) -> Option<serde_json::Map<String, Value>> {
    match serde_json::from_slice(corps) {
        Ok(Value::Object(o)) => Some(o),
        _ => None,
    }
}

/// Un texte court et lisible venu du serveur, ou rien.
fn texte_court(v: Option<&Value>, max: usize) -> Option<String> {
    let t: String = v?.as_str()?.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(max).collect();
    (!t.is_empty()).then_some(t)
}

/// `/api/sante` : sa version, et l'origine où il se dit (`null` pour un serveur qui ne la connaît pas).
fn lire_sante(corps: &[u8]) -> Option<(String, Option<String>)> {
    let o = objet(corps)?;
    if o.get("produit").and_then(Value::as_str) != Some("notak") {
        return None;
    }
    let version = o.get("version")?.as_str().filter(|v| !v.is_empty() && v.len() <= 64 && !v.chars().any(char::is_control))?;
    let origine = match o.get("origine") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => return None,
    };
    Some((version.to_string(), origine))
}

/// `/api/instance` d'un serveur d'avant `/api/sante` : un nom et des inscriptions.
fn est_une_instance(corps: &[u8]) -> bool {
    objet(corps).is_some_and(|o| o.get("nom").is_some_and(Value::is_string) && o.get("inscriptions").is_some_and(Value::is_string))
}

/// Une redirection : l'origine où elle mène, si c'en est une autre qu'on aurait acceptée.
fn redirection(origine: &str, location: Option<&str>) -> Erreur {
    let vers = location.zip(Url::parse(&format!("{origine}/api/sante")).ok()).and_then(|(l, base)| base.join(l).ok()).and_then(|u| {
        if !u.username().is_empty() || u.password().is_some() {
            return None;
        }
        origine_de(&Url::parse(&format!("{}/", u.origin().ascii_serialization())).ok()?).ok()
    });
    match vers {
        Some(v) if v != origine => Erreur::Redirige { vers: v },
        _ => Erreur::PasNotak,
    }
}

/// Est-ce bien un serveur Notak, à cette origine ?
pub async fn verifier(client: &reqwest::Client, origine: &str) -> Result<Joint, Erreur> {
    let sante = obtenir(client, &format!("{origine}/api/sante")).await?;
    match sante.statut {
        200 => {}
        300..=399 => return Err(redirection(origine, sante.location.as_deref())),
        404 => {
            return Err(match obtenir(client, &format!("{origine}/api/instance")).await {
                Ok(r) if r.statut == 200 && est_une_instance(&r.corps) => Erreur::TropAncien,
                _ => Erreur::PasNotak,
            })
        }
        _ => return Err(Erreur::PasNotak),
    }
    let (version, declaree) = lire_sante(&sante.corps).ok_or(Erreur::PasNotak)?;
    if let Some(declaree) = declaree {
        let declaree = normaliser(&declaree).map_err(|_| Erreur::PasNotak)?;
        if declaree != origine {
            return Err(Erreur::Redirige { vers: declaree });
        }
    }
    let nom = match obtenir(client, &format!("{origine}/api/instance")).await {
        Ok(r) if r.statut == 200 => objet(&r.corps).and_then(|o| texte_court(o.get("nom"), 100)),
        _ => None,
    };
    Ok(Joint { origine: origine.to_string(), nom, version })
}

/// La capacité des pages d'un serveur, vérifiée avant de la donner à Tauri, qui s'arrêterait net sur un motif illisible.
pub fn capacite(numero: usize, origine: &str) -> Result<CapabilityBuilder, Erreur> {
    let motif = format!("{origine}/*");
    let lu: RemoteUrlPattern = motif.parse().map_err(|_| Erreur::AdresseInvalide)?;
    let racine = Url::parse(&format!("{origine}/")).map_err(|_| Erreur::AdresseInvalide)?;
    if !lu.test(&racine) || racine.origin().ascii_serialization() != origine {
        return Err(Erreur::AdresseInvalide);
    }
    let c = CapabilityBuilder::new(format!("serveur-{numero}")).local(false).remote(motif).window("principale");
    Ok(DROITS_SERVEUR.iter().fold(c, |c, p| c.permission(*p)))
}

/// Une visite d'un serveur : la fenêtre y est allée, la page s'est-elle signalée ?
#[derive(Default)]
struct Visite {
    numero: u64,
    origine: Option<String>,
    vivante: bool,
}

pub struct Acces {
    pub reglage: Reglage,
    racine: Url,
    /// Les origines qui ont déjà leur capacité.
    accordes: Mutex<Vec<String>>,
    visite: Mutex<Visite>,
    /// Un serveur à la fois : deux demandes rapprochées ne partent pas chacune de leur côté.
    joindre: tauri::async_runtime::Mutex<()>,
    /// Change à chaque annulation : une vérification en cours qui la voit changer n'emmène pas la fenêtre.
    annulations: AtomicU64,
}

impl Acces {
    pub fn new(reglage: Reglage, racine: Url) -> Self {
        Self { reglage, racine, accordes: Mutex::new(Vec::new()), visite: Mutex::new(Visite::default()), joindre: tauri::async_runtime::Mutex::new(()), annulations: AtomicU64::new(0) }
    }

    fn nouvelle_visite(&self, origine: Option<String>) -> u64 {
        let mut v = self.visite.lock().unwrap_or_else(PoisonError::into_inner);
        *v = Visite { numero: v.numero + 1, origine, vivante: false };
        v.numero
    }

    fn signe_de_vie(&self, origine: &str) {
        let mut v = self.visite.lock().unwrap_or_else(PoisonError::into_inner);
        if v.origine.as_deref() == Some(origine) {
            v.vivante = true;
        }
    }

    /// Cette visite est-elle toujours la dernière, sans signe de vie ?
    fn muette(&self, numero: u64) -> bool {
        let v = self.visite.lock().unwrap_or_else(PoisonError::into_inner);
        v.numero == numero && v.origine.is_some() && !v.vivante
    }

    fn accorder(&self, app: &AppHandle, origine: &str) -> Result<(), Erreur> {
        let mut accordes = self.accordes.lock().unwrap_or_else(PoisonError::into_inner);
        if accordes.iter().any(|o| o == origine) {
            return Ok(());
        }
        app.add_capability(capacite(accordes.len() + 1, origine)?).map_err(Erreur::echec)?;
        accordes.push(origine.to_string());
        Ok(())
    }
}

/// Ce que la page apprend des réglages de la coque.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EtatAcces {
    ouvrir: Ouvrir,
    serveur: Option<String>,
    maj_auto: bool,
    version: String,
}

/// Les réglages de la coque. Appelé par la page d'un serveur, c'est aussi son signe de vie ; elle n'y apprend que sa
/// propre origine, rien d'un autre serveur retenu.
#[tauri::command]
pub async fn acces(app: AppHandle, webview: Webview, garde: State<'_, Origines>, etat: State<'_, Acces>) -> Result<EtatAcces, Erreur> {
    let appelant = exiger(&webview, &garde, LOCALE_OU_SERVEUR)?;
    let r = etat.reglage.lire();
    let version = app.package_info().version.to_string();
    if appelant == Appelant::Serveur {
        let ici = garde.serveur.lire();
        if let Some(o) = &ici {
            etat.signe_de_vie(o);
        }
        let retenu = r.ouvrir == Ouvrir::Serveur && r.serveur == ici;
        return Ok(EtatAcces { ouvrir: if retenu { Ouvrir::Serveur } else { Ouvrir::Local }, serveur: ici, maj_auto: r.maj_auto, version });
    }
    Ok(EtatAcces { ouvrir: r.ouvrir, serveur: r.serveur, maj_auto: r.maj_auto, version })
}

/// Vérifie l'adresse tapée, puis y envoie la fenêtre. `garder` : Notak s'ouvrira désormais sur ce serveur.
#[tauri::command]
pub async fn joindre_serveur(
    app: AppHandle,
    webview: Webview,
    garde: State<'_, Origines>,
    etat: State<'_, Acces>,
    emplacements: State<'_, Emplacements>,
    adresse: String,
    garder: bool,
) -> Result<Joint, Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    let annulations = etat.annulations.load(Ordering::SeqCst);
    let _seul = etat.joindre.lock().await;
    let origine = normaliser(&adresse)?;
    if garde.est_de_l_app(&origine) {
        return Err(Erreur::AdresseInvalide);
    }
    let version = app.package_info().version.to_string();
    let joint = verifier(&client(true, DELAI, &version)?, &origine).await?;
    // La personne a ouvert les toiles de cet ordinateur entre-temps : la fenêtre reste où elle est.
    if etat.annulations.load(Ordering::SeqCst) != annulations {
        return Err(Erreur::Annule);
    }
    etat.accorder(&app, &origine)?;
    let racine = Url::parse(&format!("{origine}/")).map_err(|_| Erreur::AdresseInvalide)?;
    let fenetre = fenetre(&app)?;
    // La garde d'abord : la navigation qui suit passe par elle.
    garde.serveur.poser(Some(origine.clone()));
    emplacements.vider();
    let numero = etat.nouvelle_visite(Some(origine.clone()));
    if let Err(e) = fenetre.navigate(racine) {
        garde.serveur.poser(None);
        etat.nouvelle_visite(None);
        return Err(Erreur::echec(e));
    }
    guetter(app.clone(), numero);
    if garder {
        if let Err(e) = etat.reglage.changer(|r| {
            r.ouvrir = Ouvrir::Serveur;
            r.serveur = Some(origine);
        }) {
            eprintln!("Notak : le serveur choisi n'a pas pu être retenu ({e})");
        }
    }
    Ok(joint)
}

/// Renonce à la jonction en cours (la porte : « Ouvrir les toiles de cet ordinateur » pendant qu'on attend le
/// serveur). Elle finit sur `annule`, sans emmener la fenêtre.
#[tauri::command]
pub async fn annuler_jonction(webview: Webview, garde: State<'_, Origines>, etat: State<'_, Acces>) -> Result<(), Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    etat.annulations.fetch_add(1, Ordering::SeqCst);
    Ok(())
}

fn fenetre(app: &AppHandle) -> Result<tauri::WebviewWindow, Erreur> {
    app.get_webview_window("principale").ok_or_else(|| Erreur::echec("la fenêtre de Notak n'est pas là"))
}

/// Une page du serveur commence à se charger (un rechargement, un lien qui quitte l'application d'une page) : elle a
/// de nouveau 20 s pour se signaler. Sans cela, un serveur tombé pendant la séance laisserait, au rechargement suivant,
/// une page d'erreur sans issue (pas de menu hors de macOS).
pub fn page_chargee(app: &AppHandle, url: &Url) {
    let Some(courant) = app.state::<Origines>().serveur.lire() else { return };
    if url.origin().ascii_serialization() != courant {
        return;
    }
    let numero = app.state::<Acces>().nouvelle_visite(Some(courant));
    guetter(app.clone(), numero);
}

/// Sans signe de vie de la page du serveur à temps, la fenêtre revient à l'écran d'accès.
fn guetter(app: AppHandle, numero: u64) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(GRACE).await;
        if app.state::<Acces>().muette(numero) {
            if let Err(e) = revenir(&app, Ecran::Acces, Some("muette")) {
                eprintln!("Notak : impossible de revenir à l'écran d'accès ({e:?})");
            }
        }
    });
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ecran {
    /// Les toiles de cet ordinateur.
    Local,
    /// L'écran pour choisir un serveur.
    Acces,
}

/// Ramène la fenêtre dans l'application : le serveur n'est plus permis, ni les chemins qu'il avait choisis.
pub fn revenir(app: &AppHandle, ecran: Ecran, erreur: Option<&str>) -> Result<(), Erreur> {
    let etat = app.state::<Acces>();
    etat.nouvelle_visite(None);
    app.state::<Origines>().serveur.poser(None);
    app.state::<Emplacements>().vider();
    let mut url = etat.racine.clone();
    if ecran == Ecran::Acces {
        url.set_query(Some(&match erreur {
            Some(e) => format!("acces&erreur={e}"),
            None => "acces".to_string(),
        }));
    }
    fenetre(app)?.navigate(url).map_err(Erreur::echec)
}

/// Revient aux toiles de cet ordinateur (et Notak s'y ouvrira désormais, le serveur restant retenu pour plus tard), ou
/// à l'écran d'accès, sans rien changer aux réglages. La page le demande, ou le menu de l'app (`menu.rs`).
pub fn rentrer(app: &AppHandle, ecran: Ecran) -> Result<(), Erreur> {
    if ecran == Ecran::Local {
        if let Err(e) = app.state::<Acces>().reglage.changer(|r| r.ouvrir = Ouvrir::Local) {
            eprintln!("Notak : le choix des toiles de cet ordinateur n'a pas pu être retenu ({e})");
        }
    }
    revenir(app, ecran, None)
}

#[tauri::command]
pub async fn revenir_ici(app: AppHandle, webview: Webview, garde: State<'_, Origines>, ecran: Ecran) -> Result<(), Erreur> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR)?;
    rentrer(&app, ecran)
}

/// Oublie le serveur retenu, et la session qu'on y avait (ses cookies).
#[tauri::command]
pub async fn oublier_serveur(webview: Webview, garde: State<'_, Origines>, etat: State<'_, Acces>) -> Result<(), Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    let mut oublie = None;
    // Oublié en mémoire même si le fichier ne s'écrit pas : les cookies partent quand même.
    let ecrit = etat.reglage.changer(|r| {
        oublie = r.serveur.take();
        r.ouvrir = Ouvrir::Local;
    });
    if let Some(origine) = oublie {
        if garde.serveur.lire().as_deref() == Some(origine.as_str()) {
            garde.serveur.poser(None);
        }
        // Les cookies de toute la fenêtre partagent un magasin : on y retire ceux de ce serveur.
        let url = Url::parse(&format!("{origine}/")).map_err(Erreur::echec)?;
        for cookie in webview.cookies_for_url(url).map_err(Erreur::echec)? {
            webview.delete_cookie(cookie).map_err(Erreur::echec)?;
        }
    }
    ecrit.map_err(Erreur::echec)
}

/// La recherche automatique des mises à jour, réglée une fois pour la coque.
#[tauri::command]
pub async fn regler_maj_auto(webview: Webview, garde: State<'_, Origines>, etat: State<'_, Acces>, actif: bool) -> Result<(), Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    etat.reglage.changer(|r| r.maj_auto = actif).map_err(Erreur::echec)
}

#[cfg(test)]
mod essais {
    use super::*;
    use std::collections::{BTreeMap, BTreeSet};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use tauri::ipc::RuntimeCapability;
    use tauri::utils::acl::capability::{Capability, CapabilityFile};
    use tauri::utils::acl::manifest::Manifest;
    use tauri::utils::acl::resolved::Resolved;
    use tauri::utils::acl::ExecutionContext;
    use tauri::utils::platform::Target;

    #[test]
    fn une_adresse_devient_une_origine() {
        let bonnes = [
            ("notak.exemple.fr", "https://notak.exemple.fr"),
            ("  notak.exemple.fr/  ", "https://notak.exemple.fr"),
            ("notak.exemple.fr\n", "https://notak.exemple.fr"),
            ("https://notak.exemple.fr", "https://notak.exemple.fr"),
            ("HTTPS://Notak.Exemple.FR/", "https://notak.exemple.fr"),
            ("https://notak.exemple.fr:443", "https://notak.exemple.fr"),
            ("notak.exemple.fr:8443", "https://notak.exemple.fr:8443"),
            ("https://notak.exemple.fr/./", "https://notak.exemple.fr"),
            ("café.fr", "https://xn--caf-dma.fr"),
            ("https://bücher.example", "https://xn--bcher-kva.example"),
            ("https://192.168.1.20:8443", "https://192.168.1.20:8443"),
            ("http://localhost:3005", "http://localhost:3005"),
            ("http://LOCALHOST:3005/", "http://localhost:3005"),
            ("http://127.0.0.1:3005", "http://127.0.0.1:3005"),
            ("http://127.1:3005", "http://127.0.0.1:3005"),
            ("http://localhost:80", "http://localhost"),
            ("localhost:3005", "https://localhost:3005"),
            ("notak", "https://notak"),
        ];
        for (tape, origine) in bonnes {
            assert_eq!(normaliser(tape), Ok(origine.to_string()), "{tape}");
        }
        let mauvaises = [
            ("", Erreur::AdresseInvalide),
            ("   ", Erreur::AdresseInvalide),
            ("http://notak.exemple.fr", Erreur::HttpsRequis),
            ("http://192.168.1.20:3005", Erreur::HttpsRequis),
            ("http://localhost.:3005", Erreur::HttpsRequis),
            ("https://localhost.:3005", Erreur::AdresseInvalide),
            ("http://sous.localhost:3005", Erreur::HttpsRequis),
            ("https://tauri.localhost", Erreur::AdresseInvalide),
            ("https://ipc.localhost", Erreur::AdresseInvalide),
            ("http://[::1]:3005", Erreur::HttpsRequis),
            ("https://[::1]:3005", Erreur::AdresseInvalide),
            ("https://[2001:db8::1]", Erreur::AdresseInvalide),
            ("https://moi@notak.exemple.fr", Erreur::AdresseInvalide),
            ("https://moi:secret@notak.exemple.fr", Erreur::AdresseInvalide),
            ("https://notak.exemple.fr/?a=1", Erreur::AdresseInvalide),
            ("https://notak.exemple.fr/?", Erreur::AdresseInvalide),
            ("https://notak.exemple.fr/#x", Erreur::AdresseInvalide),
            ("https://notak.exemple.fr/notak", Erreur::Chemin),
            ("https://notak.exemple.fr//", Erreur::Chemin),
            ("notak.exemple.fr/t/abc", Erreur::Chemin),
            ("https://notak.exemple.fr:0", Erreur::AdresseInvalide),
            ("https://*.exemple.fr", Erreur::AdresseInvalide),
            ("https://a(b).fr", Erreur::AdresseInvalide),
            ("https://exemple.fr.", Erreur::AdresseInvalide),
            ("https://-exemple.fr", Erreur::AdresseInvalide),
            ("https://sous_domaine.exemple.fr", Erreur::AdresseInvalide),
            ("ftp://notak.exemple.fr", Erreur::AdresseInvalide),
            ("wss://notak.exemple.fr", Erreur::AdresseInvalide),
            ("file:///etc/passwd", Erreur::AdresseInvalide),
            ("javascript:alert(1)", Erreur::AdresseInvalide),
            ("data:text/html,x", Erreur::AdresseInvalide),
            ("notak.exem\nple.fr", Erreur::AdresseInvalide),
            ("notak.exem\u{0}ple.fr", Erreur::AdresseInvalide),
            ("pas une adresse", Erreur::AdresseInvalide),
        ];
        for (tape, erreur) in mauvaises {
            assert_eq!(normaliser(tape), Err(erreur), "{tape:?}");
        }
        assert_eq!(normaliser(&format!("{}.fr", "a".repeat(2100))), Err(Erreur::AdresseInvalide));
    }

    #[test]
    fn une_redirection_se_propose_sans_s_y_rendre() {
        let o = "https://notak.exemple.fr";
        assert_eq!(redirection(o, Some("https://www.notak.exemple.fr/api/sante")), Erreur::Redirige { vers: "https://www.notak.exemple.fr".into() });
        assert_eq!(redirection("http://localhost:3005", Some("https://localhost:3443/x?y")), Erreur::Redirige { vers: "https://localhost:3443".into() });
        assert_eq!(redirection(o, Some("/connexion")), Erreur::PasNotak);
        assert_eq!(redirection(o, Some("https://notak.exemple.fr/ailleurs")), Erreur::PasNotak);
        assert_eq!(redirection(o, Some("http://notak.exemple.fr/api/sante")), Erreur::PasNotak);
        assert_eq!(redirection(o, Some("https://moi:secret@autre.fr/")), Erreur::PasNotak);
        assert_eq!(redirection(o, Some("javascript:alert(1)")), Erreur::PasNotak);
        assert_eq!(redirection(o, Some("https://[::1]/")), Erreur::PasNotak);
        assert_eq!(redirection(o, None), Erreur::PasNotak);
    }

    #[test]
    fn un_certificat_refuse_se_dit_comme_tel() {
        let rustls_dans_io = std::io::Error::new(std::io::ErrorKind::InvalidData, rustls::Error::InvalidCertificate(rustls::CertificateError::UnknownIssuer));
        assert_eq!(classer_source(&rustls_dans_io), Erreur::Certificat);
        assert_eq!(classer_source(&rustls::Error::NoCertificatesPresented), Erreur::Certificat);
        let autre_tls = std::io::Error::new(std::io::ErrorKind::InvalidData, rustls::Error::DecryptError);
        assert_eq!(classer_source(&autre_tls), Erreur::Injoignable);
        assert_eq!(classer_source(&std::io::Error::from(std::io::ErrorKind::TimedOut)), Erreur::Delai);
        assert_eq!(classer_source(&std::io::Error::from(std::io::ErrorKind::ConnectionRefused)), Erreur::Injoignable);
    }

    /// Un petit serveur HTTP sur cet ordinateur : chaque chemin reçoit la réponse que lui donne `repondre`.
    fn serveur_d_essai(repondre: impl Fn(&str, &str) -> Option<String> + Send + 'static) -> String {
        let ecoute = TcpListener::bind("127.0.0.1:0").unwrap();
        let origine = format!("http://127.0.0.1:{}", ecoute.local_addr().unwrap().port());
        let ici = origine.clone();
        std::thread::spawn(move || {
            for flux in ecoute.incoming() {
                let Ok(mut flux) = flux else { continue };
                let mut lu = [0u8; 4096];
                let n = flux.read(&mut lu).unwrap_or(0);
                let requete = String::from_utf8_lossy(&lu[..n]).to_string();
                let chemin = requete.split_whitespace().nth(1).unwrap_or("/").to_string();
                match repondre(&chemin, &ici) {
                    Some(reponse) => {
                        let _ = flux.write_all(reponse.as_bytes());
                    }
                    // Pas de réponse : on garde la connexion ouverte, le client attend.
                    None => std::thread::sleep(Duration::from_secs(3)),
                }
            }
        });
        origine
    }

    fn http(statut: &str, entetes: &str, corps: &str) -> Option<String> {
        Some(format!("HTTP/1.1 {statut}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n{entetes}\r\n{corps}", corps.len()))
    }

    fn essayer(origine: &str) -> Result<Joint, Erreur> {
        let client = client(false, Duration::from_millis(1500), "0.0.0").unwrap();
        tauri::async_runtime::block_on(verifier(&client, origine))
    }

    #[test]
    fn un_serveur_notak_se_reconnait() {
        let o = serveur_d_essai(|chemin, ici| match chemin {
            "/api/sante" => http("200 OK", "", &format!(r#"{{"produit":"notak","version":"1.4.0","origine":"{ici}","ok":true}}"#)),
            "/api/instance" => http("200 OK", "", r#"{"nom":"  L'équipe\u0007 ","inscriptions":"fermees","version":"1.4.0"}"#),
            _ => http("404 Not Found", "", "{}"),
        });
        assert_eq!(essayer(&o), Ok(Joint { origine: o.clone(), nom: Some("L'équipe".into()), version: "1.4.0".into() }));
        // Un serveur qui ne connaît pas son origine : on le prend à celle qu'on a tapée.
        let sans_origine = serveur_d_essai(|chemin, _| match chemin {
            "/api/sante" => http("200 OK", "", r#"{"produit":"notak","version":"1.4.0","origine":null,"ok":true}"#),
            _ => http("500 Internal Server Error", "", "{}"),
        });
        assert_eq!(essayer(&sans_origine), Ok(Joint { origine: sans_origine.clone(), nom: None, version: "1.4.0".into() }));
    }

    #[test]
    fn un_serveur_qui_se_dit_ailleurs_ne_s_y_rend_pas() {
        let o = serveur_d_essai(|chemin, _| match chemin {
            "/api/sante" => http("200 OK", "", r#"{"produit":"notak","version":"1.4.0","origine":"https://notak.exemple.fr"}"#),
            _ => http("404 Not Found", "", "{}"),
        });
        assert_eq!(essayer(&o), Err(Erreur::Redirige { vers: "https://notak.exemple.fr".into() }));
        let o = serveur_d_essai(|chemin, _| match chemin {
            "/api/sante" => http("200 OK", "", r#"{"produit":"notak","version":"1.4.0","origine":"http://notak.exemple.fr"}"#),
            _ => http("404 Not Found", "", "{}"),
        });
        assert_eq!(essayer(&o), Err(Erreur::PasNotak));
        let o = serveur_d_essai(|chemin, _| match chemin {
            "/api/sante" => http("301 Moved Permanently", "location: https://notak.exemple.fr/api/sante\r\n", ""),
            _ => http("404 Not Found", "", "{}"),
        });
        assert_eq!(essayer(&o), Err(Erreur::Redirige { vers: "https://notak.exemple.fr".into() }));
        let o = serveur_d_essai(|_, _| http("302 Found", "location: /connexion\r\n", ""));
        assert_eq!(essayer(&o), Err(Erreur::PasNotak));
    }

    #[test]
    fn un_ancien_serveur_ou_un_autre_site() {
        let ancien = serveur_d_essai(|chemin, _| match chemin {
            "/api/instance" => http("200 OK", "", r#"{"nom":"Notak","inscriptions":"ouvertes","habillages":[]}"#),
            _ => http("404 Not Found", "", "{}"),
        });
        assert_eq!(essayer(&ancien), Err(Erreur::TropAncien));
        let autre = serveur_d_essai(|_, _| http("404 Not Found", "", "<html>non</html>"));
        assert_eq!(essayer(&autre), Err(Erreur::PasNotak));
        let page = serveur_d_essai(|_, _| http("200 OK", "", "<!doctype html><title>Bienvenue</title>"));
        assert_eq!(essayer(&page), Err(Erreur::PasNotak));
        let imposteur = serveur_d_essai(|_, ici| http("200 OK", "", &format!(r#"{{"produit":"autre","version":"1","origine":"{ici}"}}"#)));
        assert_eq!(essayer(&imposteur), Err(Erreur::PasNotak));
        let sans_version = serveur_d_essai(|_, ici| http("200 OK", "", &format!(r#"{{"produit":"notak","origine":"{ici}"}}"#)));
        assert_eq!(essayer(&sans_version), Err(Erreur::PasNotak));
        let origine_douteuse = serveur_d_essai(|_, _| http("200 OK", "", r#"{"produit":"notak","version":"1","origine":42}"#));
        assert_eq!(essayer(&origine_douteuse), Err(Erreur::PasNotak));
        let en_panne = serveur_d_essai(|_, _| http("500 Internal Server Error", "", "{}"));
        assert_eq!(essayer(&en_panne), Err(Erreur::PasNotak));
        let bavard = serveur_d_essai(|_, ici| http("200 OK", "", &format!(r#"{{"produit":"notak","version":"1","origine":"{ici}","x":"{}"}}"#, "a".repeat(CORPS_MAX))));
        assert_eq!(essayer(&bavard), Err(Erreur::PasNotak));
    }

    #[test]
    fn injoignable_ou_trop_lent() {
        let ecoute = TcpListener::bind("127.0.0.1:0").unwrap();
        let ferme = format!("http://127.0.0.1:{}", ecoute.local_addr().unwrap().port());
        drop(ecoute);
        assert_eq!(essayer(&ferme), Err(Erreur::Injoignable));
        let muet = serveur_d_essai(|_, _| None);
        assert_eq!(essayer(&muet), Err(Erreur::Delai));
    }

    fn manifestes() -> BTreeMap<String, Manifest> {
        let texte = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/gen/schemas/acl-manifests.json")).expect("gen/schemas, écrit par build.rs");
        serde_json::from_str(&texte).unwrap()
    }

    fn permission_connue(manifestes: &BTreeMap<String, Manifest>, id: &str) -> bool {
        let (cle, nom) = id.rsplit_once(':').unwrap_or(("__app-acl__", id));
        manifestes.get(cle).is_some_and(|m| m.permissions.contains_key(nom))
    }

    #[test]
    fn chaque_droit_donne_a_un_serveur_existe() {
        // Une permission inconnue arrêterait l'app au moment de joindre le serveur (`add_capability`).
        let m = manifestes();
        for p in DROITS_SERVEUR {
            assert!(permission_connue(&m, p), "{p} n'est pas dans gen/schemas/acl-manifests.json");
        }
        let CapabilityFile::Capability(c) = capacite(1, "https://notak.exemple.fr").unwrap().build() else { panic!("une capacité") };
        assert!(!c.local);
        let resolue = Resolved::resolve(&m, BTreeMap::from([(c.identifier.clone(), c)]), Target::current()).unwrap();
        let commandes: BTreeSet<&str> = resolue.allowed_commands.keys().map(String::as_str).collect();
        for attendue in ["acces", "revenir_ici", "ouvrir_fichier", "fichiers_ouverts", "lire_fichier_ouvert", "ecrire_fichier", "plugin:event|listen", "plugin:window|start_dragging"] {
            assert!(commandes.contains(attendue), "{attendue}");
        }
        for interdite in ["joindre_serveur", "oublier_serveur", "regler_maj_auto", "confier_copie", "plugin:event|emit", "plugin:opener|open_url"] {
            assert!(!commandes.contains(interdite), "{interdite}");
        }
        for (commande, resolus) in &resolue.allowed_commands {
            for r in resolus {
                let ExecutionContext::Remote { url } = &r.context else { panic!("{commande} : la page locale n'a rien à faire ici") };
                assert!(url.test(&Url::parse("https://notak.exemple.fr/t/abc?x#y").unwrap()), "{commande}");
                assert!(!url.test(&Url::parse("https://notak.exemple.fr.evil.fr/").unwrap()), "{commande}");
                assert!(!url.test(&Url::parse("http://notak.exemple.fr/").unwrap()), "{commande}");
                assert!(!url.test(&Url::parse("https://notak.exemple.fr:8443/").unwrap()), "{commande}");
                assert!(!url.test(&Url::parse("tauri://localhost/").unwrap()), "{commande}");
            }
        }
    }

    #[test]
    fn chaque_origine_acceptee_fait_un_motif_lisible() {
        for o in ["https://notak.exemple.fr", "https://notak.exemple.fr:8443", "http://localhost:3005", "http://127.0.0.1", "https://xn--caf-dma.fr", "https://192.168.1.20"] {
            assert_eq!(normaliser(o).as_deref(), Ok(o));
            assert!(capacite(2, o).is_ok(), "{o}");
        }
        assert!(capacite(1, "https://notak.exemple.fr/chemin").is_err());
        assert!(capacite(1, "pas une origine").is_err());
    }

    #[test]
    fn chaque_droit_de_la_page_embarquee_existe() {
        let m = manifestes();
        let texte = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/principale.json")).unwrap();
        let c: Capability = serde_json::from_str(&texte).unwrap();
        assert!(c.local && c.remote.is_none(), "la page embarquée, et elle seule");
        let ids: Vec<String> = serde_json::from_str::<Value>(&texte).unwrap()["permissions"].as_array().unwrap().iter().map(|p| p.as_str().unwrap().to_string()).collect();
        for p in &ids {
            assert!(permission_connue(&m, p), "{p}");
        }
        let resolue = Resolved::resolve(&m, BTreeMap::from([(c.identifier.clone(), c)]), Target::current()).unwrap();
        for attendue in ["acces", "joindre_serveur", "revenir_ici", "oublier_serveur", "regler_maj_auto", "confier_copie", "ouvrir_fichier", "fichiers_ouverts", "lire_fichier_ouvert"] {
            assert!(resolue.allowed_commands.contains_key(attendue), "{attendue}");
        }
        // La photo de la fenêtre ne sert qu'au signalement, sur la page d'un serveur.
        assert!(!resolue.allowed_commands.contains_key("capturer_fenetre"));
    }
}
