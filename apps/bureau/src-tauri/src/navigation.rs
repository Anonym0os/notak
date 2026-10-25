/// Ce que la fenêtre a le droit d'afficher : l'application elle-même et, dans leurs cadres, les lecteurs intégrés que
/// sa CSP laisse entrer (`frame-src`, tirée de `packages/tableau/src/securite.ts`). Un autre site ne se charge jamais
/// dans la fenêtre de Notak : un lien cliqué s'ouvre dans le navigateur de la personne (`ouvrir_dehors`), et la
/// fenêtre refuse d'aller ailleurs.
use tauri::utils::config::{Config, FrontendDist};
use tauri::Url;

/// Les origines permises, lues une fois dans la configuration.
pub struct Origines {
    /// L'application : celle qui est embarquée, ou le serveur d'une coque construite pour lui, et Vite en développement.
    app: Vec<String>,
    /// Les lecteurs intégrés, chargés dans un cadre de la page (sur macOS et Linux, leurs navigations passent par ici).
    cadres: Vec<String>,
}

impl Origines {
    pub fn de(config: &Config) -> Self {
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
        Self { app, cadres }
    }

    fn de_l_app(&self, url: &Url) -> bool {
        match (url.scheme(), url.host_str()) {
            // Les fichiers embarqués : `tauri://localhost` sur macOS et Linux, `http://tauri.localhost` sous Windows.
            ("tauri", Some("localhost")) | ("http" | "https", Some("tauri.localhost")) => true,
            _ => self.app.contains(&url.origin().ascii_serialization()),
        }
    }

    /// La fenêtre, ou l'un de ses cadres, peut-elle aller là ?
    pub fn permise(&self, url: &Url) -> bool {
        match url.scheme() {
            // Une page vide que la page écrit elle-même (l'impression d'un document en PDF).
            "about" => matches!(url.path(), "blank" | "srcdoc"),
            // Un fichier de l'espace montré dans un cadre (un PDF) : seulement s'il vient de l'application.
            "blob" => Url::parse(url.path()).is_ok_and(|interne| self.de_l_app(&interne)),
            "http" | "https" | "tauri" => self.de_l_app(url) || self.cadres.contains(&url.origin().ascii_serialization()),
            _ => false,
        }
    }
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
        assert!(!o.permise(&url("blob:https://exemple.fr/0b6f6e2c")));
        assert!(!o.permise(&url("data:text/html,<script>alert(1)</script>")));
        assert!(!o.permise(&url("file:///etc/passwd")));
        assert!(!o.permise(&url("javascript:alert(1)")));
    }

    #[test]
    fn une_coque_de_serveur_va_sur_son_serveur() {
        let o = Origines { app: vec!["https://notak.exemple.fr".into()], cadres: vec![] };
        assert!(o.permise(&url("https://notak.exemple.fr/t/abc")));
        assert!(!o.permise(&url("https://notak.exemple.fr.evil.fr/")));
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
