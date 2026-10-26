/// Ce que la fenêtre a le droit d'afficher : l'application elle-même, le serveur Notak que la personne vient de joindre
/// (`acces.rs`) et, dans leurs cadres, les lecteurs intégrés que la CSP laisse entrer (`frame-src`, tirée de
/// `packages/tableau/src/securite.ts`). Un autre site ne se charge jamais dans la fenêtre de Notak : un lien cliqué
/// s'ouvre dans le navigateur de la personne (`ouvrir_dehors`), et la fenêtre refuse d'aller ailleurs.
///
/// C'est aussi d'ici que la coque sait qui l'appelle (`Appelant`) : la page embarquée, la page du serveur choisi, ou
/// une autre, à qui elle ne répond pas.
use std::sync::{Arc, PoisonError, RwLock};

use tauri::utils::config::{Config, FrontendDist};
use tauri::Url;

/// Le serveur où la fenêtre est allée, s'il y en a un : son origine (`https://notak.exemple.fr`). Partagé entre la
/// garde de navigation, qui le laisse se charger, et les commandes, qui ne répondent qu'à lui ; vidé dès que la
/// fenêtre revient chez elle.
#[derive(Clone, Default)]
pub struct ServeurCourant(Arc<RwLock<Option<String>>>);

impl ServeurCourant {
    pub fn lire(&self) -> Option<String> {
        self.0.read().unwrap_or_else(PoisonError::into_inner).clone()
    }

    pub fn poser(&self, origine: Option<String>) {
        *self.0.write().unwrap_or_else(PoisonError::into_inner) = origine;
    }
}

/// Qui appelle une commande, d'après l'adresse de la page.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Appelant {
    /// L'application embarquée.
    Locale,
    /// Une page du serveur où la fenêtre est allée, et de lui seul.
    Serveur,
    /// Tout le reste, y compris un serveur joint plus tôt : sa capacité dure jusqu'au redémarrage (Tauri n'en retire
    /// pas), mais la coque ne lui répond plus.
    Autre,
}

/// Les origines permises, lues une fois dans la configuration, et le serveur du moment.
#[derive(Clone)]
pub struct Origines {
    /// L'application quand elle n'est pas embarquée : Vite en développement.
    app: Vec<String>,
    /// Les lecteurs intégrés, chargés dans un cadre de la page (sur macOS et Linux, leurs navigations passent par ici).
    cadres: Vec<String>,
    pub serveur: ServeurCourant,
}

impl Origines {
    pub fn de(config: &Config, serveur: ServeurCourant) -> Self {
        let mut app = Vec::new();
        if let Some(FrontendDist::Url(u)) = &config.build.frontend_dist {
            app.push(u.origin().ascii_serialization());
        }
        if cfg!(debug_assertions) {
            if let Some(u) = &config.build.dev_url {
                app.push(u.origin().ascii_serialization());
            }
        }
        let cadres = config.app.security.csp.as_ref().map(|csp| sources(&csp.to_string(), "frame-src")).unwrap_or_default();
        Self { app, cadres, serveur }
    }

    fn de_l_app(&self, url: &Url) -> bool {
        match (url.scheme(), url.host_str()) {
            // Les fichiers embarqués : `tauri://localhost` sur macOS et Linux, `http://tauri.localhost` sous Windows. Sans
            // port : `http://tauri.localhost:9999`, la webview le cherche sur cette machine, chez qui écoute ce port.
            ("tauri", Some("localhost")) | ("http" | "https", Some("tauri.localhost")) => url.port().is_none(),
            _ => self.app.contains(&url.origin().ascii_serialization()),
        }
    }

    /// L'origine telle qu'on la compare à celle du serveur, en HTTP(S) seulement.
    fn du_serveur(&self, url: &Url) -> bool {
        matches!(url.scheme(), "http" | "https") && self.serveur.lire().is_some_and(|s| s == url.origin().ascii_serialization())
    }

    /// Une origine que l'application occupe déjà : on ne la prend pas pour un serveur.
    pub fn est_de_l_app(&self, origine: &str) -> bool {
        Url::parse(origine).is_ok_and(|u| self.de_l_app(&u))
    }

    /// La fenêtre, ou l'un de ses cadres, peut-elle aller là ? Sur un serveur, la fenêtre ne revient à l'application
    /// que par la coque (`acces::revenir`, qui oublie le serveur d'abord) : la page d'un serveur ne mène pas d'elle-même
    /// la fenêtre sur la page embarquée, qui a plus de droits que la sienne.
    pub fn permise(&self, url: &Url) -> bool {
        let chez_soi = |u: &Url| self.de_l_app(u) && self.serveur.lire().is_none();
        match url.scheme() {
            // Une page vide que la page écrit elle-même (l'impression d'un document en PDF).
            "about" => matches!(url.path(), "blank" | "srcdoc"),
            // Un fichier de l'espace montré dans un cadre (un PDF) : seulement s'il vient de l'application ou du serveur.
            "blob" => Url::parse(url.path()).is_ok_and(|interne| chez_soi(&interne) || self.du_serveur(&interne)),
            "http" | "https" | "tauri" => chez_soi(url) || self.du_serveur(url) || self.cadres.contains(&url.origin().ascii_serialization()),
            _ => false,
        }
    }

    /// Qui est la page à cette adresse. Plus strict que `permise` : la page embarquée n'a que l'adresse de cette
    /// plateforme (`http://tauri.localhost` ailleurs que sous Windows serait un serveur de la machine).
    pub fn appelant(&self, url: &Url) -> Appelant {
        let locale = match (url.scheme(), url.host_str()) {
            ("tauri", Some("localhost")) => !cfg!(windows) && url.port().is_none(),
            ("http" | "https", Some("tauri.localhost")) => cfg!(windows) && url.port().is_none(),
            _ => self.app.contains(&url.origin().ascii_serialization()),
        };
        if locale {
            Appelant::Locale
        } else if self.du_serveur(url) {
            Appelant::Serveur
        } else {
            Appelant::Autre
        }
    }
}

/// L'adresse où la fenêtre a ouvert l'application, pour l'y ramener : celle de Tauri (`tauri://localhost/`, ou
/// `http://tauri.localhost/` sous Windows), ou Vite en développement.
pub fn racine_locale(config: &Config) -> Url {
    if tauri::is_dev() {
        if let Some(u) = &config.build.dev_url {
            return u.clone();
        }
    }
    if let Some(FrontendDist::Url(u)) = &config.build.frontend_dist {
        return u.clone();
    }
    Url::parse(if cfg!(windows) { "http://tauri.localhost/" } else { "tauri://localhost/" }).expect("adresse fixe")
}

/// Une adresse qui mène au monde : le web, un courriel, un numéro. Rien d'autre ne part vers le système.
pub fn vers_dehors(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http" | "mailto" | "tel")
}

/// Les sources d'une directive de la CSP (`frame-src 'self' https://a https://b` → `https://a`, `https://b`), sans
/// les mots-clés entre apostrophes ni les schémas seuls (`blob:`).
fn sources(csp: &str, directive: &str) -> Vec<String> {
    csp.split(';')
        .map(str::trim)
        .find_map(|d| d.strip_prefix(directive).filter(|reste| reste.starts_with(' ')))
        .map(|reste| reste.split_whitespace().filter(|s| s.contains("://")).map(|s| s.trim_end_matches('/').to_string()).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod essais {
    use super::*;

    fn origines() -> Origines {
        Origines {
            app: vec![],
            cadres: sources("default-src 'self'; frame-src 'self' blob: https://www.youtube-nocookie.com https://player.vimeo.com; worker-src 'self'", "frame-src"),
            serveur: ServeurCourant::default(),
        }
    }
    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn lit_les_cadres_de_la_csp() {
        assert_eq!(origines().cadres, vec!["https://www.youtube-nocookie.com", "https://player.vimeo.com"]);
        assert!(sources("frame-srcx https://a.fr", "frame-src").is_empty());
    }

    #[test]
    fn l_application_et_ses_lecteurs_seulement() {
        let o = origines();
        assert!(o.permise(&url("tauri://localhost/t/abc")));
        assert!(o.permise(&url("http://tauri.localhost/")));
        assert!(o.permise(&url("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")));
        assert!(o.permise(&url("about:blank")));
        assert!(o.permise(&url("blob:tauri://localhost/0b6f6e2c-1f0a-4b1e-9d0e-2a3b4c5d6e7f")));
        assert!(!o.permise(&url("https://exemple.fr/")));
        assert!(!o.permise(&url("https://www.youtube-nocookie.com.exemple.fr/")));
        assert!(!o.permise(&url("http://localhost:5173/")));
        assert!(!o.permise(&url("http://tauri.localhost:9999/")));
        assert!(!o.permise(&url("https://tauri.localhost:8443/")));
        assert!(!o.permise(&url("tauri://localhost:1234/")));
        assert!(!o.permise(&url("blob:http://tauri.localhost:9999/0b6f6e2c")));
        assert!(!o.permise(&url("blob:https://exemple.fr/0b6f6e2c")));
        assert!(!o.permise(&url("data:text/html,<script>alert(1)</script>")));
        assert!(!o.permise(&url("file:///etc/passwd")));
        assert!(!o.permise(&url("javascript:alert(1)")));
    }

    #[test]
    fn une_coque_de_serveur_va_sur_son_serveur() {
        let o = Origines { app: vec!["https://notak.exemple.fr".into()], cadres: vec![], serveur: ServeurCourant::default() };
        assert!(o.permise(&url("https://notak.exemple.fr/t/abc")));
        assert!(!o.permise(&url("https://notak.exemple.fr.evil.fr/")));
    }

    #[test]
    fn la_fenetre_va_sur_le_serveur_choisi_et_lui_seul() {
        let o = origines();
        assert!(!o.permise(&url("https://notak.exemple.fr/")));
        o.serveur.poser(Some("https://notak.exemple.fr".into()));
        assert!(o.permise(&url("https://notak.exemple.fr/")));
        assert!(o.permise(&url("https://notak.exemple.fr/t/abc?x=1#y")));
        assert!(o.permise(&url("https://NOTAK.exemple.fr:443/")));
        assert!(o.permise(&url("blob:https://notak.exemple.fr/0b6f6e2c")));
        assert!(!o.permise(&url("http://notak.exemple.fr/")));
        assert!(!o.permise(&url("https://notak.exemple.fr:8443/")));
        assert!(!o.permise(&url("https://notak.exemple.fr.evil.fr/")));
        assert!(!o.permise(&url("https://evil.fr/notak.exemple.fr")));
        assert!(!o.permise(&url("wss://notak.exemple.fr/")));
        // Ses lecteurs restent permis ; l'application, seulement quand la coque y ramène la fenêtre (le serveur oublié).
        assert!(o.permise(&url("https://player.vimeo.com/video/1")));
        assert!(!o.permise(&url("tauri://localhost/")));
        assert!(!o.permise(&url("http://tauri.localhost/?acces")));
        assert!(!o.permise(&url("blob:tauri://localhost/0b6f6e2c")));
        // Revenue chez elle, la fenêtre ne retourne plus sur le serveur.
        o.serveur.poser(None);
        assert!(o.permise(&url("tauri://localhost/?acces&erreur=muette")));
        assert!(!o.permise(&url("https://notak.exemple.fr/")));
        assert!(!o.permise(&url("blob:https://notak.exemple.fr/0b6f6e2c")));
    }

    #[test]
    fn qui_appelle() {
        let o = origines();
        let ici = if cfg!(windows) { "http://tauri.localhost/t/abc" } else { "tauri://localhost/t/abc" };
        let pas_ici = if cfg!(windows) { "tauri://localhost/" } else { "http://tauri.localhost/" };
        assert_eq!(o.appelant(&url(ici)), Appelant::Locale);
        assert_eq!(o.appelant(&url(pas_ici)), Appelant::Autre);
        // Un autre port de la même adresse est un serveur de la machine, pas la page embarquée.
        assert_eq!(o.appelant(&url("http://tauri.localhost:9999/")), Appelant::Autre);
        assert_eq!(o.appelant(&url("https://tauri.localhost:8443/")), Appelant::Autre);
        assert_eq!(o.appelant(&url("tauri://localhost:1234/")), Appelant::Autre);
        assert_eq!(o.appelant(&url("https://notak.exemple.fr/")), Appelant::Autre);
        o.serveur.poser(Some("https://notak.exemple.fr".into()));
        assert_eq!(o.appelant(&url("https://notak.exemple.fr/t/abc")), Appelant::Serveur);
        assert_eq!(o.appelant(&url(ici)), Appelant::Locale);
        assert_eq!(o.appelant(&url("http://notak.exemple.fr/")), Appelant::Autre);
        assert_eq!(o.appelant(&url("https://notak.exemple.fr:8443/")), Appelant::Autre);
        assert_eq!(o.appelant(&url("https://sous.notak.exemple.fr/")), Appelant::Autre);
        assert_eq!(o.appelant(&url("https://player.vimeo.com/")), Appelant::Autre);
        assert_eq!(o.appelant(&url("blob:https://notak.exemple.fr/0b6f6e2c")), Appelant::Autre);
        assert_eq!(o.appelant(&url("about:blank")), Appelant::Autre);
        // Un serveur joint plus tôt n'est plus le serveur.
        o.serveur.poser(Some("https://autre.exemple.fr".into()));
        assert_eq!(o.appelant(&url("https://notak.exemple.fr/")), Appelant::Autre);
        assert_eq!(o.appelant(&url("https://autre.exemple.fr/")), Appelant::Serveur);
        // Vite, en développement, est l'application.
        let dev = Origines { app: vec!["http://localhost:5173".into()], cadres: vec![], serveur: ServeurCourant::default() };
        assert_eq!(dev.appelant(&url("http://localhost:5173/")), Appelant::Locale);
        assert!(dev.est_de_l_app("http://localhost:5173"));
        assert!(dev.est_de_l_app("https://tauri.localhost"));
        assert!(!dev.est_de_l_app("http://tauri.localhost:9999"));
        assert!(!dev.est_de_l_app("https://notak.exemple.fr"));
    }

    #[test]
    fn l_application_a_une_adresse_d_ou_revenir() {
        let mut config = Config::default();
        config.build.frontend_dist = None;
        let r = racine_locale(&config);
        assert_eq!(r.path(), "/");
        assert_eq!(origines().appelant(&r), Appelant::Locale);
    }

    #[test]
    fn seul_le_monde_part_vers_le_systeme() {
        assert!(vers_dehors(&url("https://exemple.fr")));
        assert!(vers_dehors(&url("mailto:a@b.fr")));
        assert!(!vers_dehors(&url("file:///Applications/Calculator.app")));
        assert!(!vers_dehors(&url("smb://serveur/partage")));
        assert!(!vers_dehors(&url("javascript:alert(1)")));
    }
}
