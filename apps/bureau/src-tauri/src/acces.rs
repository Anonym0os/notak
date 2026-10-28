/// Joindre un serveur Notak depuis l'app : la personne tape une adresse dans la page embarquée, la coque vérifie que
/// c'est bien un serveur Notak, puis y envoie la fenêtre. Ses pages reçoivent alors une partie des droits de la coque,
/// et elles seules.
///
/// - **L'adresse est relue ici**, pas dans la page : `https` seulement (du HTTP simple pour cet ordinateur, et par défaut
///   pour `localhost` tapé sans schéma), ni identifiants, ni paramètres, ni chemin, ni IPv6 ; un nom international en
///   punycode. On n'en garde que l'origine.
/// - **On vérifie avant d'y aller** (`GET /api/sante`, sans suivre de redirection, 10 s, 64 Kio au plus) : un serveur
///   qui se dit ailleurs, ou une redirection, n'emmène pas la fenêtre ; on propose l'adresse (`redirige`), la personne
///   décide. Un certificat refusé se dit comme tel.
/// - **Une capacité par origine**, ajoutée une fois : quelques commandes, jamais celles qui choisissent un serveur ou
///   règlent la coque (`DROITS_SERVEUR`). Tauri n'en retire pas : une page d'un serveur quitté garde la sienne jusqu'au
///   redémarrage, mais la fenêtre n'y retourne plus (`navigation.rs`) et la coque ne lui répond plus (`appel::exiger`).
/// - **Les chemins choisis par une page ne servent pas à l'autre** : changer de page oublie ceux d'« Enregistrer sous ».
/// - **Une page muette ramène chez soi** : si le serveur ne se signale pas (`acces`) dans les 20 s, la fenêtre revient
///   à l'écran d'accès (`?acces&erreur=muette`).
/// - **Revenir chez soi n'est qu'un coup d'œil** (`revenir`, `?ici`) : la jonction en cours s'arrête, rien n'est retenu.
///   Où Notak s'ouvre se choisit dans ses réglages (`regler_ouverture`).
///
/// La page embarquée ne joint jamais un serveur d'après les paramètres de son adresse (`?acces`, `?ici`, `erreur=…`) :
/// elle ne fait que les afficher, ou s'en abstenir. Seuls ses réglages (`acces`) et ce que tape la personne mènent
/// ailleurs.
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::CapabilityBuilder;
use tauri::utils::acl::RemoteUrlPattern;
use tauri::{AppHandle, Manager, State, Url, Webview};
use url::Host;

use crate::appel::{exiger, Cadence, Erreur, LOCALE, LOCALE_OU_SERVEUR, SERVEUR};
#[cfg(desktop)]
use crate::fichiers::Ouverts;
use crate::navigation::{Appelant, Origines, ServeurCourant};
use crate::reglages::{Ouvrir, Reglage};
#[cfg(desktop)]
use crate::Emplacements;

/// Ce que peut une page du serveur choisi, sur un ordinateur. Ni `joindre_serveur`, ni `oublier_serveur`, ni
/// `regler_maj_auto`, ni `regler_ouverture`, ni `confier_copie`, ni `annuler_jonction` : un serveur ne choisit pas où va
/// la fenêtre, et ne règle pas la coque.
#[cfg(desktop)]
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
    "allow-lire-fichier-choisi",
    "allow-capturer-fenetre",
    "allow-ouvrir-fichier",
    "allow-fichiers-ouverts",
    "allow-lire-fichier-ouvert",
    "allow-ecarter-fichier-ouvert",
    "allow-ouvrir-dans-le-navigateur",
];

/// Sur un iPhone ou un iPad : se signaler et revenir aux toiles de l'appareil, ouvrir dans Safari la page d'accord de
/// la connexion par code, et ce que la page embarquée y a déjà (`capabilities/mobile.json`) : le plugin `appareil`
/// (le thème de la vue, le clavier, un retour haptique) et les liens vers le monde. Rien qui choisisse un serveur.
#[cfg(mobile)]
pub const DROITS_SERVEUR: &[&str] = &["allow-acces", "allow-revenir-ici", "allow-ouvrir-dans-le-navigateur", "appareil:default", "opener:default"];

/// Une page qu'on quitte (pour un serveur, ou pour revenir) ne laisse rien à la suivante : ni les chemins choisis par
/// « Enregistrer sous », ni les copies confiées pour un autre serveur que `garder`. Sur iOS, il n'y a ni l'un ni l'autre.
fn oublier_les_fichiers(app: &AppHandle, emplacements: bool, garder: Option<&str>) {
    #[cfg(desktop)]
    {
        if emplacements {
            app.state::<Emplacements>().vider();
        }
        app.state::<Ouverts>().retirer_confiees(garder);
    }
    #[cfg(mobile)]
    let _ = (app, emplacements, garder);
}

const DELAI: Duration = Duration::from_secs(10);
const CORPS_MAX: usize = 64 * 1024;
/// Le temps qu'a la page d'un serveur pour se signaler.
const GRACE: Duration = Duration::from_secs(20);

/// L'origine d'un serveur Notak, à partir de ce que la personne a tapé. Sans schéma, `https`, sauf pour cet ordinateur
/// (`localhost:3005`), où un serveur d'essai parle HTTP.
pub fn normaliser(adresse: &str) -> Result<String, Erreur> {
    let adresse = adresse.trim();
    if adresse.is_empty() || adresse.len() > 2048 || adresse.chars().any(char::is_control) {
        return Err(Erreur::AdresseInvalide);
    }
    let url = if adresse.contains("://") {
        Url::parse(adresse)
    } else {
        Url::parse(&format!("https://{adresse}")).and_then(|u| if de_cet_ordinateur(&u) { Url::parse(&format!("http://{adresse}")) } else { Ok(u) })
    };
    origine_de(&url.map_err(|_| Erreur::AdresseInvalide)?)
}

/// `localhost` ou `127.0.0.1` : cet ordinateur.
fn de_cet_ordinateur(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(d)) => d == "localhost",
        Some(Host::Ipv4(ip)) => ip == Ipv4Addr::LOCALHOST,
        _ => false,
    }
}

/// L'origine d'une adresse déjà lue, si c'est celle d'un serveur possible, à sa racine.
fn origine_de(url: &Url) -> Result<String, Erreur> {
    let locale = de_cet_ordinateur(url);
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

/// Un serveur joint à `origine` qui se dit à `declaree` : on propose son adresse. Sauf s'il se dit sur cet ordinateur
/// sans y avoir été joint : son `NOTAK_ORIGINE` est restée à sa valeur par défaut (`http://localhost:3005`), et
/// proposer d'y aller enverrait la personne sur sa propre machine.
fn se_dit_ailleurs(origine: &str, declaree: String) -> Erreur {
    let ici = |o: &str| Url::parse(o).is_ok_and(|u| de_cet_ordinateur(&u));
    if ici(&declaree) && !ici(origine) {
        Erreur::MalRegle
    } else {
        Erreur::Redirige { vers: declaree }
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
            return Err(se_dit_ailleurs(origine, declaree));
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
    /// Le serveur où est la fenêtre, le même que celui de la garde (`Origines`) : il ne change que sous le verrou de la
    /// visite, avec elle.
    serveur: ServeurCourant,
    /// Les origines qui ont déjà leur capacité.
    accordes: Mutex<Vec<String>>,
    visite: Mutex<Visite>,
    /// Un serveur à la fois : deux demandes rapprochées ne partent pas chacune de leur côté.
    joindre: tauri::async_runtime::Mutex<()>,
    /// Change à chaque renoncement (`abandonner`) : une jonction en cours qui la voit changer n'emmène pas la fenêtre,
    /// et ne retient rien.
    annulations: AtomicU64,
    /// Les pages du serveur ouvertes récemment dans le navigateur (`ouvrir_dans_le_navigateur`).
    navigateur: Cadence,
}

impl Acces {
    pub fn new(reglage: Reglage, racine: Url, serveur: ServeurCourant) -> Self {
        Self {
            reglage,
            racine,
            serveur,
            accordes: Mutex::new(Vec::new()),
            visite: Mutex::new(Visite::default()),
            joindre: tauri::async_runtime::Mutex::new(()),
            annulations: AtomicU64::new(0),
            navigateur: Cadence::new(NAVIGATEUR_MAX, NAVIGATEUR_DUREE),
        }
    }

    /// Commence la visite de `origine`, si personne n'a renoncé depuis `vu` : il devient le serveur de la fenêtre, et le
    /// passage vers `racine` se pose avec lui. Sous le verrou de la visite, comme `abandonner` : l'un passe avant
    /// l'autre, jamais au milieu, et le serveur et le passage changent ensemble. Rend le numéro de la visite et le jeton
    /// du passage.
    fn commencer_visite(&self, passage: &Passage, origine: &str, racine: Url, vu: u64) -> Option<(u64, u64)> {
        let mut v = self.visite.lock().unwrap_or_else(PoisonError::into_inner);
        if self.annulations.load(Ordering::SeqCst) != vu {
            return None;
        }
        self.serveur.poser(Some(origine.to_string()));
        *v = Visite { numero: v.numero + 1, origine: Some(origine.to_string()), vivante: false };
        Some((v.numero, passage.poser(racine)))
    }

    /// Une page du serveur de la fenêtre commence à se charger (un rechargement, un lien) : une nouvelle visite, qui a
    /// de nouveau son délai pour se signaler. Rien pour une autre adresse, ni quand la fenêtre n'a plus de serveur.
    fn visite_rechargee(&self, url: &Url) -> Option<u64> {
        let mut v = self.visite.lock().unwrap_or_else(PoisonError::into_inner);
        let courant = self.serveur.lire()?;
        if url.origin().ascii_serialization() != courant {
            return None;
        }
        *v = Visite { numero: v.numero + 1, origine: Some(courant), vivante: false };
        Some(v.numero)
    }

    /// Renonce au serveur : la jonction en cours finit sur `annule`, la fenêtre n'a plus de serveur ni de visite à
    /// guetter. Rend vrai si une page de serveur était en route sans s'être signalée : la fenêtre est peut-être déjà
    /// partie la chercher. `retour` dit, d'après cela, où ramener la fenêtre : ce passage se pose sous le même verrou
    /// (un passage vers le serveur posé juste avant ne l'emmènera plus), et son jeton est rendu.
    fn abandonner(&self, passage: &Passage, retour: impl FnOnce(bool) -> Option<Url>) -> (bool, Option<u64>) {
        let mut v = self.visite.lock().unwrap_or_else(PoisonError::into_inner);
        self.annulations.fetch_add(1, Ordering::SeqCst);
        let en_route = v.origine.is_some() && !v.vivante;
        self.serveur.poser(None);
        *v = Visite { numero: v.numero + 1, origine: None, vivante: false };
        (en_route, retour(en_route).map(|vers| passage.poser(vers)))
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

/// Vérifie l'adresse tapée, puis y envoie la fenêtre. `garder` : Notak s'ouvrira désormais sur ce serveur, à la place
/// de celui retenu jusque-là, dont la session s'en va (il n'apparaît plus nulle part pour être oublié). Qu'elle
/// échoue, et la copie confiée pour elle (`confier_copie`) s'en va : elle n'attend pas le serveur suivant.
#[tauri::command]
pub async fn joindre_serveur(
    app: AppHandle,
    webview: Webview,
    garde: State<'_, Origines>,
    etat: State<'_, Acces>,
    adresse: String,
    garder: bool,
) -> Result<Joint, Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    let vu = etat.annulations.load(Ordering::SeqCst);
    let joint = joindre(&app, &webview, &garde, &etat, &adresse, garder, vu).await;
    if joint.is_err() {
        oublier_les_fichiers(&app, false, None);
    }
    joint
}

#[allow(clippy::too_many_arguments)]
async fn joindre(
    app: &AppHandle,
    webview: &Webview,
    garde: &Origines,
    etat: &Acces,
    adresse: &str,
    garder: bool,
    vu: u64,
) -> Result<Joint, Erreur> {
    let _seul = etat.joindre.lock().await;
    let origine = normaliser(adresse)?;
    if garde.est_de_l_app(&origine) {
        return Err(Erreur::AdresseInvalide);
    }
    let version = app.package_info().version.to_string();
    let joint = verifier(&client(true, DELAI, &version)?, &origine).await?;
    etat.accorder(app, &origine)?;
    let racine = Url::parse(&format!("{origine}/")).map_err(|_| Erreur::AdresseInvalide)?;
    let passage = app.state::<Passage>();
    // La garde d'abord, avec le passage : la navigation qui suit passe par elle. La personne a renoncé entre-temps (les
    // toiles d'ici, le menu) : la fenêtre reste où elle est.
    let (numero, jeton) = etat.commencer_visite(&passage, &origine, racine, vu).ok_or(Erreur::Annule)?;
    // Un autre serveur n'a pas à trouver la copie confiée pour un autre.
    oublier_les_fichiers(app, true, Some(&origine));
    if let Err(e) = partir(app, jeton) {
        etat.abandonner(&passage, |_| None);
        return Err(e);
    }
    guetter(app.clone(), numero);
    // Abandonnée pendant que la fenêtre partait (`annuler_jonction`, le menu) : qui a renoncé l'a ramenée, par un
    // passage posé après le nôtre, et rien n'est retenu.
    if etat.annulations.load(Ordering::SeqCst) != vu {
        return Err(Erreur::Annule);
    }
    if garder {
        let mut avant = None;
        if let Err(e) = etat.reglage.changer(|r| {
            r.ouvrir = Ouvrir::Serveur;
            avant = r.serveur.replace(origine.clone());
        }) {
            eprintln!("Notak : le serveur choisi n'a pas pu être retenu ({e})");
        }
        if let Some(avant) = avant.filter(|a| *a != origine) {
            if let Err(e) = effacer_session(webview, &avant) {
                eprintln!("Notak : la session du serveur d'avant n'a pas pu être fermée ({e:?})");
            }
        }
    }
    Ok(joint)
}

/// Combien de pages du serveur s'ouvrent coup sur coup dans le navigateur : la connexion par code en ouvre une ; un
/// serveur qui s'emballe n'en ouvre pas des dizaines.
const NAVIGATEUR_MAX: usize = 3;
const NAVIGATEUR_DUREE: Duration = Duration::from_secs(10);

/// Une adresse que la page du serveur `courant` peut ouvrir dans le navigateur : une page de ce serveur, et de lui seul
/// (même schéma, même hôte, même port), sans identifiants.
fn adresse_ouvrable(adresse: &str, courant: Option<&str>) -> Result<Url, Erreur> {
    let url = Url::parse(adresse).map_err(|_| Erreur::AdresseInvalide)?;
    let courant = courant.ok_or(Erreur::Interdit)?;
    if !matches!(url.scheme(), "https" | "http") || !url.username().is_empty() || url.password().is_some() || url.origin().ascii_serialization() != courant {
        return Err(Erreur::Interdit);
    }
    Ok(url)
}

/// Une page du serveur, ouverte dans le navigateur de la personne. La page d'accord de la connexion par code s'ouvre
/// après une requête : WebKit refuse alors `window.open`, qui n'est plus le fruit d'un clic. Seules les pages du
/// serveur choisi passent par ici, et pas plus de trois en dix secondes.
#[tauri::command]
pub async fn ouvrir_dans_le_navigateur(app: AppHandle, webview: Webview, garde: State<'_, Origines>, etat: State<'_, Acces>, adresse: String) -> Result<(), Erreur> {
    exiger(&webview, &garde, SERVEUR)?;
    let url = adresse_ouvrable(&adresse, garde.serveur.lire().as_deref())?;
    if !etat.navigateur.permise(Instant::now()) {
        return Err(Erreur::TropVite);
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url.as_str(), None::<&str>).map_err(Erreur::echec)
}

/// Renonce à la jonction en cours (la porte : « Ouvrir les toiles de cet ordinateur » pendant qu'on attend le serveur ;
/// « Annuler », ou la fenêtre « Se connecter » fermée, pendant « Connexion… »). Pendant la vérification, elle finit sur
/// `annule` sans emmener la fenêtre. Si la fenêtre est déjà partie chercher la page du serveur, elle revient à `ecran`
/// (les toiles d'ici, `?ici`, par défaut) : une nouvelle navigation remplace la sienne, ce que `window.stop` ne garantit
/// pas partout. Rend vrai dans ce cas : la page qui a demandé va être remplacée. Rien n'est retenu.
#[tauri::command]
pub async fn annuler_jonction(app: AppHandle, webview: Webview, garde: State<'_, Origines>, ecran: Option<Ecran>) -> Result<bool, Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    let etat = app.state::<Acces>();
    let vers = adresse_d_ici(&etat.racine, ecran.unwrap_or(Ecran::Local), None);
    let (en_route, jeton) = etat.abandonner(&app.state::<Passage>(), |en_route| en_route.then_some(vers));
    if !en_route {
        return Ok(false);
    }
    rentrer(&app, jeton)?;
    Ok(true)
}

/// D'une page à l'autre (la page embarquée et celle du serveur), la fenêtre passe par une page vide. Une requête à la
/// coque encore en route quand la fenêtre part est coupée, et le script de Tauri la renvoie aussitôt par `postMessage` :
/// la coque la juge alors sur l'adresse de la fenêtre, déjà la page d'après. Vu dans l'app : une pièce jointe demandée
/// par la page du serveur s'ouvrait sans accord, prise pour une demande de la page embarquée (qui a plus de droits).
/// Par la page vide, une telle requête tombe sur une page sans aucun droit ; et tant que dure le passage, la coque ne
/// répond à personne (`appel::exiger`).
///
/// Chaque passage a son jeton, et seul le dernier posé mène quelque part : le minuteur ou la page vide d'un passage
/// révolu ne touche pas à celui d'après. Un passage se pose sous le verrou de la visite, avec le serveur qu'il rejoint
/// ou qu'il quitte (`commencer_visite`, `abandonner`) : le dernier posé va toujours là où la garde le laisse aller.
#[derive(Default)]
pub struct Passage(Mutex<EnRoute>);

#[derive(Default)]
struct EnRoute {
    jeton: u64,
    vers: Option<Url>,
}

impl Passage {
    pub fn en_cours(&self) -> bool {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).vers.is_some()
    }

    /// Un passage vers `vers`, qui remplace celui en cours : son jeton.
    fn poser(&self, vers: Url) -> u64 {
        let mut p = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        p.jeton += 1;
        p.vers = Some(vers);
        p.jeton
    }

    /// Le jeton du passage en cours, s'il y en a un.
    fn courant(&self) -> Option<u64> {
        let p = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        p.vers.is_some().then_some(p.jeton)
    }

    /// Termine le passage `jeton`, s'il est toujours le dernier : où il allait.
    fn finir(&self, jeton: u64) -> Option<Url> {
        let mut p = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if p.jeton != jeton {
            return None;
        }
        p.vers.take()
    }
}

/// Le temps laissé aux requêtes de la page d'avant pour être refusées, une fois la page vide chargée ; et, faute de
/// nouvelles d'elle, celui au bout duquel la fenêtre repart quand même.
const PASSAGE_APRES: Duration = Duration::from_millis(150);
const PASSAGE_AU_PLUS: Duration = Duration::from_millis(2000);

/// Envoie la fenêtre sur la page vide, pour le passage `jeton` (déjà posé) ; elle en repart vers où il va.
fn partir(app: &AppHandle, jeton: u64) -> Result<(), Erreur> {
    let passage = app.state::<Passage>();
    // Un passage posé depuis a pris la main : c'est lui qui emmène la fenêtre.
    if passage.courant() != Some(jeton) {
        return Ok(());
    }
    if let Err(e) = fenetre(app).and_then(|f| f.navigate(Url::parse("about:blank").expect("adresse fixe")).map_err(Erreur::echec)) {
        passage.finir(jeton);
        return Err(e);
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(PASSAGE_AU_PLUS).await;
        continuer(&app, jeton);
    });
    Ok(())
}

/// La page vide est chargée : la fenêtre peut aller où va le passage en cours.
pub fn page_vide_chargee(app: &AppHandle) {
    let Some(jeton) = app.state::<Passage>().courant() else { return };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(PASSAGE_APRES).await;
        continuer(&app, jeton);
    });
}

fn continuer(app: &AppHandle, jeton: u64) {
    let Some(vers) = app.state::<Passage>().finir(jeton) else { return };
    let Some(vers) = destination(&app.state::<Origines>(), vers, &app.state::<Acces>().racine) else {
        eprintln!("Notak : la fenêtre n'a plus nulle part où aller");
        return;
    };
    if let Err(e) = fenetre(app).and_then(|f| f.navigate(vers).map_err(Erreur::echec)) {
        eprintln!("Notak : la fenêtre n'a pas pu changer de page ({e:?})");
    }
}

/// Où mène un passage qui s'achève : là où il allait, si la garde l'y laisse encore. Sinon (son serveur quitté sans que
/// la fenêtre soit rappelée), l'écran d'accès, plutôt que la page vide, d'où rien ne ramène hors de macOS.
fn destination(garde: &Origines, vers: Url, racine: &Url) -> Option<Url> {
    if garde.permise(&vers) {
        return Some(vers);
    }
    let acces = adresse_d_ici(racine, Ecran::Acces, None);
    garde.permise(&acces).then_some(acces)
}

fn fenetre(app: &AppHandle) -> Result<tauri::WebviewWindow, Erreur> {
    app.get_webview_window("principale").ok_or_else(|| Erreur::echec("la fenêtre de Notak n'est pas là"))
}

/// Une page du serveur commence à se charger (un rechargement, un lien qui quitte l'application d'une page) : elle a
/// de nouveau 20 s pour se signaler. Sans cela, un serveur tombé pendant la séance laisserait, au rechargement suivant,
/// une page d'erreur sans issue (pas de menu hors de macOS).
pub fn page_chargee(app: &AppHandle, url: &Url) {
    if let Some(numero) = app.state::<Acces>().visite_rechargee(url) {
        guetter(app.clone(), numero);
    }
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
    /// Les toiles de cet ordinateur, pour un coup d'œil (`?ici`) : la page embarquée ne joint aucun serveur d'office.
    Local,
    /// L'écran pour choisir un serveur.
    Acces,
}

/// L'adresse de la page embarquée qui montre cet écran.
fn adresse_d_ici(racine: &Url, ecran: Ecran, erreur: Option<&str>) -> Url {
    let mut url = racine.clone();
    url.set_query(Some(&match (ecran, erreur) {
        (Ecran::Local, _) => "ici".to_string(),
        (Ecran::Acces, Some(e)) => format!("acces&erreur={e}"),
        (Ecran::Acces, None) => "acces".to_string(),
    }));
    url
}

/// Ramène la fenêtre dans l'application : la jonction en cours s'arrête, le serveur n'est plus permis, ni les chemins
/// qu'il avait choisis, ni la copie confiée pour lui. Rien n'est retenu : où Notak s'ouvre ne change pas. La page le
/// demande (`revenir_ici`), le menu de l'app (`menu.rs`), ou le guet d'une page muette.
pub fn revenir(app: &AppHandle, ecran: Ecran, erreur: Option<&str>) -> Result<(), Erreur> {
    let etat = app.state::<Acces>();
    let vers = adresse_d_ici(&etat.racine, ecran, erreur);
    let (_, jeton) = etat.abandonner(&app.state::<Passage>(), |_| Some(vers));
    rentrer(app, jeton)
}

/// La fenêtre, déjà sans serveur (`abandonner`), part pour la page embarquée par le passage `jeton`, s'il y en a un.
fn rentrer(app: &AppHandle, jeton: Option<u64>) -> Result<(), Erreur> {
    oublier_les_fichiers(app, true, None);
    jeton.map_or(Ok(()), |j| partir(app, j))
}

/// Revient aux toiles de cet ordinateur ou à l'écran d'accès, sans rien changer aux réglages.
#[tauri::command]
pub async fn revenir_ici(app: AppHandle, webview: Webview, garde: State<'_, Origines>, ecran: Ecran) -> Result<(), Erreur> {
    exiger(&webview, &garde, LOCALE_OU_SERVEUR)?;
    revenir(&app, ecran, None)
}

/// Où s'ouvre Notak au lancement : les toiles de cet ordinateur, ou le serveur mémorisé (il en faut un).
#[tauri::command]
pub async fn regler_ouverture(webview: Webview, garde: State<'_, Origines>, etat: State<'_, Acces>, ouvrir: Ouvrir) -> Result<(), Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    if ouvrir == Ouvrir::Serveur && etat.reglage.lire().serveur.is_none() {
        return Err(Erreur::Interdit);
    }
    etat.reglage
        .changer(|r| {
            // Oublié entre-temps : il n'y a plus de serveur où s'ouvrir.
            if ouvrir == Ouvrir::Local || r.serveur.is_some() {
                r.ouvrir = ouvrir;
            }
        })
        .map_err(Erreur::echec)
}

/// Oublie le serveur mémorisé, et la session qu'on y avait (ses cookies) ; Notak s'ouvre de nouveau ici. Les copies de
/// ses toiles gardées pour le hors-ligne restent : elles sont dans le stockage de la page du serveur, que la coque ne
/// sait pas vider pour une seule origine.
#[tauri::command]
pub async fn oublier_serveur(
    app: AppHandle,
    webview: Webview,
    garde: State<'_, Origines>,
    etat: State<'_, Acces>,
) -> Result<(), Erreur> {
    exiger(&webview, &garde, LOCALE)?;
    let mut oublie = None;
    // Oublié en mémoire même si le fichier ne s'écrit pas : les cookies partent quand même.
    let ecrit = etat.reglage.changer(|r| {
        oublie = r.serveur.take();
        r.ouvrir = Ouvrir::Local;
    });
    oublier_les_fichiers(&app, false, None);
    if let Some(origine) = oublie {
        // La fenêtre partait chez lui : elle n'y va plus, et revient à l'écran d'accès si elle était déjà en route.
        if garde.serveur.lire().as_deref() == Some(origine.as_str()) {
            let vers = adresse_d_ici(&etat.racine, Ecran::Acces, None);
            if let (_, Some(jeton)) = etat.abandonner(&app.state::<Passage>(), |en_route| en_route.then_some(vers)) {
                rentrer(&app, Some(jeton))?;
            }
        }
        effacer_session(&webview, &origine)?;
    }
    ecrit.map_err(Erreur::echec)
}

/// Retire les cookies d'un serveur, et avec eux la session qu'on y avait : ceux de toute la fenêtre partagent un magasin.
fn effacer_session(webview: &Webview, origine: &str) -> Result<(), Erreur> {
    let url = Url::parse(&format!("{origine}/")).map_err(Erreur::echec)?;
    for cookie in webview.cookies_for_url(url).map_err(Erreur::echec)? {
        webview.delete_cookie(cookie).map_err(Erreur::echec)?;
    }
    Ok(())
}

/// La recherche automatique des mises à jour, réglée une fois pour la coque (sur iOS, c'est l'App Store).
#[cfg_attr(mobile, allow(dead_code))]
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
            // Cet ordinateur, tapé sans schéma : un serveur d'essai, en HTTP ; `https://` se tape si on le veut.
            ("localhost:3005", "http://localhost:3005"),
            ("LocalHost:3005/", "http://localhost:3005"),
            ("localhost", "http://localhost"),
            ("127.0.0.1:3005", "http://127.0.0.1:3005"),
            ("https://localhost:3443", "https://localhost:3443"),
            // Ailleurs, sans schéma : HTTPS, même sur le réseau local.
            ("192.168.1.5:3005", "https://192.168.1.5:3005"),
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
            ("localhost.:3005", Erreur::AdresseInvalide),
            ("localhost:3005/notak", Erreur::Chemin),
            ("localhost:0", Erreur::AdresseInvalide),
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
        // Toutes, et rien d'autre : une commande ajoutée ici par mégarde (choisir un serveur, régler la coque) se voit.
        let attendues = BTreeSet::from([
            "acces",
            "revenir_ici",
            "preparer_mise_a_jour",
            "installer_mise_a_jour",
            "choisir_emplacement",
            "ecrire_fichier",
            "lire_fichier_choisi",
            "capturer_fenetre",
            "ouvrir_fichier",
            "fichiers_ouverts",
            "lire_fichier_ouvert",
            "ecarter_fichier_ouvert",
            "ouvrir_dans_le_navigateur",
            "plugin:event|listen",
            "plugin:event|unlisten",
            "plugin:window|start_dragging",
            "plugin:window|internal_toggle_maximize",
        ]);
        assert_eq!(commandes, attendues);
        for interdite in ["joindre_serveur", "oublier_serveur", "regler_maj_auto", "regler_ouverture", "confier_copie", "annuler_jonction", "plugin:event|emit", "plugin:opener|open_url"] {
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
        let commandes: BTreeSet<&str> = resolue.allowed_commands.keys().map(String::as_str).collect();
        let attendues = BTreeSet::from([
            "acces",
            "joindre_serveur",
            "annuler_jonction",
            "revenir_ici",
            "oublier_serveur",
            "regler_maj_auto",
            "regler_ouverture",
            "preparer_mise_a_jour",
            "installer_mise_a_jour",
            "choisir_emplacement",
            "ecrire_fichier",
            "lire_fichier_choisi",
            "ouvrir_fichier",
            "fichiers_ouverts",
            "lire_fichier_ouvert",
            "ecarter_fichier_ouvert",
            "confier_copie",
            "nuage_ouvrir",
            "nuage_lister",
            "nuage_lire",
            "nuage_ecrire",
            "nuage_supprimer",
            "nuage_telecharger",
            "plugin:event|listen",
            "plugin:event|unlisten",
            "plugin:window|start_dragging",
            "plugin:window|internal_toggle_maximize",
        ]);
        assert_eq!(commandes, attendues);
        // La photo de la fenêtre ne sert qu'au signalement, et le navigateur qu'à la connexion par code : sur la page
        // d'un serveur.
        assert!(!commandes.contains("capturer_fenetre"));
        assert!(!commandes.contains("ouvrir_dans_le_navigateur"));
    }

    #[test]
    fn chaque_commande_de_la_coque_a_un_droit() {
        // Toute commande que `build.rs` déclare est donnée à l'une des deux pages : une oubliée ne servirait personne.
        let texte = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/build.rs")).unwrap();
        let declarees: BTreeSet<String> = texte.lines().filter_map(|l| l.trim().strip_prefix('"')?.strip_suffix("\",")).map(str::to_string).collect();
        assert!(declarees.len() > 10, "{declarees:?}");
        let locale = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/principale.json")).unwrap();
        for commande in &declarees {
            let droit = format!("allow-{}", commande.replace('_', "-"));
            assert!(locale.contains(&format!("\"{droit}\"")) || DROITS_SERVEUR.contains(&droit.as_str()), "{commande} n'est permise à aucune page");
        }
    }

    const ICI: &str = "https://notak.exemple.fr";

    fn etat() -> Acces {
        Acces::new(Reglage::new(None), Url::parse("tauri://localhost/").unwrap(), ServeurCourant::default())
    }

    fn racine(origine: &str) -> Url {
        Url::parse(&format!("{origine}/")).unwrap()
    }

    #[test]
    fn un_serveur_reste_a_sa_valeur_par_defaut_ne_fait_pas_proposer_cet_ordinateur() {
        for declaree in ["http://localhost:3005", "http://127.0.0.1:3005", "https://localhost:3443"] {
            for tapee in ["https://notak.exemple.fr", "https://192.168.1.5:3005"] {
                assert_eq!(se_dit_ailleurs(tapee, declaree.into()), Erreur::MalRegle, "{tapee} → {declaree}");
            }
        }
        // Un essai sur cet ordinateur, joint par l'autre nom de la machine : on propose celui qu'il donne.
        assert_eq!(se_dit_ailleurs("http://127.0.0.1:3005", "http://localhost:3005".into()), Erreur::Redirige { vers: "http://localhost:3005".into() });
        assert_eq!(
            se_dit_ailleurs("https://notak.exemple.fr", "https://www.notak.exemple.fr".into()),
            Erreur::Redirige { vers: "https://www.notak.exemple.fr".into() }
        );
    }

    #[test]
    fn chaque_passage_a_son_jeton_et_seul_le_dernier_mene_quelque_part() {
        let p = Passage::default();
        assert!(!p.en_cours());
        assert_eq!(p.courant(), None);
        let un = p.poser(racine(ICI));
        let deux = p.poser(Url::parse("tauri://localhost/?ici").unwrap());
        assert_eq!(p.courant(), Some(deux));
        // Le minuteur du premier passage, devenu orphelin, ne vide pas le second avant son heure.
        assert_eq!(p.finir(un), None);
        assert!(p.en_cours());
        assert_eq!(p.finir(deux).map(String::from), Some("tauri://localhost/?ici".into()));
        assert!(!p.en_cours());
        // Fini une fois : la page vide et le minuteur du même passage n'emmènent pas la fenêtre deux fois.
        assert_eq!(p.finir(deux), None);
        assert_eq!(p.courant(), None);
    }

    #[test]
    fn le_dernier_passage_va_la_ou_la_garde_laisse_aller() {
        let serveur = ServeurCourant::default();
        let ici = Url::parse("tauri://localhost/").unwrap();
        let a = Acces::new(Reglage::new(None), ici.clone(), serveur.clone());
        let garde = Origines::de(&tauri::utils::config::Config::default(), serveur);
        let p = Passage::default();
        // La jonction pose son passage avec le serveur ; une annulation qui la voit en route pose le retour après lui.
        let vu = a.annulations.load(Ordering::SeqCst);
        let (_, vers_serveur) = a.commencer_visite(&p, ICI, racine(ICI), vu).unwrap();
        assert_eq!(destination(&garde, racine(ICI), &ici), Some(racine(ICI)), "tant qu'on y va, le serveur est permis");
        let local = adresse_d_ici(&ici, Ecran::Local, None);
        let (en_route, retour) = a.abandonner(&p, |en_route| en_route.then(|| local.clone()));
        assert!(en_route);
        assert_eq!(p.finir(vers_serveur), None, "le passage vers le serveur n'emmène plus la fenêtre");
        let vers = p.finir(retour.unwrap()).unwrap();
        assert_eq!(destination(&garde, vers, &ici), Some(local));
        // Un renoncement sans retour : le serveur n'est plus permis, la fenêtre va à l'écran d'accès, pas sur la page vide.
        let vu = a.annulations.load(Ordering::SeqCst);
        let (_, jeton) = a.commencer_visite(&p, ICI, racine(ICI), vu).unwrap();
        assert_eq!(a.abandonner(&p, |_| None), (true, None));
        let vers = p.finir(jeton).unwrap();
        assert_eq!(destination(&garde, vers, &ici).map(String::from), Some("tauri://localhost/?acces".into()));
        // Une jonction abandonnée avant de partir ne pose aucun passage.
        assert_eq!(a.commencer_visite(&p, ICI, racine(ICI), vu), None);
        assert!(!p.en_cours());
    }

    #[test]
    fn une_page_de_serveur_muette_se_reconnait() {
        let a = etat();
        let (n, _) = a.commencer_visite(&Passage::default(), ICI, racine(ICI), 0).unwrap();
        assert_eq!(a.serveur.lire().as_deref(), Some(ICI));
        assert!(a.muette(n));
        // Un autre serveur qui se signale ne compte pas.
        a.signe_de_vie("https://autre.exemple.fr");
        assert!(a.muette(n));
        a.signe_de_vie(ICI);
        assert!(!a.muette(n));
        // Un rechargement : une visite neuve, qui doit se signaler de nouveau ; l'ancien numéro ne compte plus.
        let m = a.visite_rechargee(&Url::parse(&format!("{ICI}/t/abc")).unwrap()).unwrap();
        assert!(!a.muette(n));
        assert!(a.muette(m));
        // Une page d'une autre adresse ne recommence rien.
        assert_eq!(a.visite_rechargee(&Url::parse("https://autre.exemple.fr/").unwrap()), None);
        assert!(a.muette(m));
    }

    #[test]
    fn renoncer_arrete_la_jonction_et_la_visite() {
        let a = etat();
        let p = Passage::default();
        // Pendant la vérification : rien n'est en route ; la jonction qui finit ensuite ne part pas.
        let vu = a.annulations.load(Ordering::SeqCst);
        assert_eq!(a.abandonner(&p, |en_route| en_route.then(|| racine("tauri://localhost"))), (false, None));
        assert_eq!(a.commencer_visite(&p, ICI, racine(ICI), vu), None);
        assert_eq!(a.serveur.lire(), None);
        assert!(!p.en_cours());
        // La fenêtre est partie, la page ne s'est pas signalée : on le sait, et plus rien ne la guette.
        let vu = a.annulations.load(Ordering::SeqCst);
        let (n, _) = a.commencer_visite(&p, ICI, racine(ICI), vu).unwrap();
        assert!(a.abandonner(&p, |_| None).0);
        assert!(!a.muette(n));
        assert_eq!(a.serveur.lire(), None);
        assert_ne!(a.annulations.load(Ordering::SeqCst), vu, "la jonction qui l'a lancée ne retient rien");
        // Plus de serveur : un chargement tardif de sa page ne recommence pas de visite.
        assert_eq!(a.visite_rechargee(&racine(ICI)), None);
        // Une page vivante n'est plus « en route ».
        let vu = a.annulations.load(Ordering::SeqCst);
        a.commencer_visite(&p, ICI, racine(ICI), vu).unwrap();
        a.signe_de_vie(ICI);
        assert!(!a.abandonner(&p, |_| None).0);
    }

    #[test]
    fn revenir_chez_soi_est_un_coup_d_oeil_ou_l_ecran_d_acces() {
        let r = Url::parse("tauri://localhost/").unwrap();
        assert_eq!(adresse_d_ici(&r, Ecran::Local, None).as_str(), "tauri://localhost/?ici");
        assert_eq!(adresse_d_ici(&r, Ecran::Acces, None).as_str(), "tauri://localhost/?acces");
        assert_eq!(adresse_d_ici(&r, Ecran::Acces, Some("muette")).as_str(), "tauri://localhost/?acces&erreur=muette");
        let vite = Url::parse("http://localhost:5173/?vieux=1").unwrap();
        assert_eq!(adresse_d_ici(&vite, Ecran::Local, None).as_str(), "http://localhost:5173/?ici");
    }

    #[test]
    fn une_page_du_serveur_seulement_s_ouvre_dehors() {
        for bonne in ["https://notak.exemple.fr/t/abc?x#y", "https://notak.exemple.fr:443/", "https://NOTAK.exemple.fr/appareil?code=ABCD"] {
            assert!(adresse_ouvrable(bonne, Some(ICI)).is_ok(), "{bonne}");
        }
        for mauvaise in [
            "https://notak.exemple.fr.evil.fr/",
            "https://sous.notak.exemple.fr/",
            "https://notak.exemple.fr:8443/",
            "http://notak.exemple.fr/",
            "https://moi@notak.exemple.fr/",
            "https://moi:x@notak.exemple.fr/",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,x",
            "mailto:a@b.fr",
            "blob:https://notak.exemple.fr/0b6f",
        ] {
            assert_eq!(adresse_ouvrable(mauvaise, Some(ICI)), Err(Erreur::Interdit), "{mauvaise}");
        }
        assert_eq!(adresse_ouvrable("pas une adresse", Some(ICI)), Err(Erreur::AdresseInvalide));
        assert_eq!(adresse_ouvrable("https://notak.exemple.fr/", None), Err(Erreur::Interdit));
        // Trois en dix secondes, pas une de plus.
        let a = etat();
        let t = Instant::now();
        for _ in 0..NAVIGATEUR_MAX {
            assert!(a.navigateur.permise(t));
        }
        assert!(!a.navigateur.permise(t + Duration::from_secs(1)));
        assert!(a.navigateur.permise(t + NAVIGATEUR_DUREE));
    }
}
