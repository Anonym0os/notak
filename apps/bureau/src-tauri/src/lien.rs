/// Un lien `notak://` cliqué ailleurs (une fiche de Silak, un courriel) ouvre sa page dans Notak plutôt que dans le
/// navigateur. Le lien, c'est l'adresse de la page avec `notak:` à la place de `https:` :
///
/// - `notak://notak.exemple.fr/?dossier=<dossier>` : un dossier, dans la bibliothèque ;
/// - `notak://notak.exemple.fr/?dossier=<dossier>&element=<élément>` : ce qu'il range (une page, une photo…) ;
/// - `notak://notak.exemple.fr/t/<toile>` : une toile ;
/// - `notak://notak.exemple.fr/` : la bibliothèque ;
/// - `notak://notak.exemple.fr/relier?source=…&cle=…&titre=…&retour=…` : le dossier de la fiche d'un autre outil, à
///   créer d'un clic s'il n'existe pas encore.
///
/// Le système le remet à la coque (`RunEvent::Opened` : `Info.plist` déclare le schéma sur le Mac, `Info.ios.plist` sur
/// un iPhone ou un iPad), qui le relit sans lui faire confiance : n'importe quelle page web peut en ouvrir un.
/// - **Seulement ces chemins-là**, aux identifiants de Notak (`[A-Za-z0-9_-]`), et pour `/relier` à ceux d'une fiche
///   (`relier`) : l'adresse où va la fenêtre est
///   reconstruite ici, rien du lien n'y passe tel quel. Un lien qui n'a pas cette forme ne mène nulle part.
/// - **Seulement un serveur auquel Notak est relié** : le serveur retenu, ou celui où est la fenêtre. Pour un autre,
///   Notak le dit, et n'ouvre rien d'autre : un lien ne choisit pas de serveur à la place de la personne.
/// - **Pas plus de trois en dix secondes** : une page qui s'emballe ne fait pas valser la fenêtre.
///
/// `notak://` seul et `notak://autorise` ne mènent à aucune page : ils ramènent Notak au premier plan, sans rien dire
/// (`ramene_seulement`). C'est où renvoie la page d'accord de la connexion par code (`apps/web/src/serveur/appareil.ts`).
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Url};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::acces::{self, normaliser, Acces};
use crate::appel::{Cadence, Erreur};
use crate::langue::en_francais;
use crate::navigation::Origines;

pub const SCHEMA: &str = "notak";

/// Ce qu'un lien demande : la page `vers` du serveur `origine`.
#[derive(Debug, PartialEq, Eq)]
pub struct Lien {
    pub origine: String,
    pub vers: Url,
}

/// Un identifiant de toile ou de dossier (`ID_TABLEAU`, `apps/serveur/src/app.ts`).
fn tableau(id: &str) -> bool {
    (8..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// Un identifiant d'élément (`ID_ELEMENT`, même fichier).
fn element(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// Les paramètres de `/relier` (`apps/web/src/serveur/Relier.tsx`) : la source et la fiche, obligatoires, aux formes
/// qu'en accepte le serveur (`NOM_SOURCE`, `CLE_FICHE` d'`apps/serveur/src/rattachements.ts`) ; le titre du dossier et
/// l'adresse de retour à la fiche, facultatifs, une fois chacun. La page ne crée rien sans un clic, et le serveur
/// refuse un retour qui n'est pas chez l'outil : ils passent tels quels, bornés. Rend la requête, réécrite.
fn relier(parametres: &[(String, String)]) -> Option<String> {
    let (mut source, mut cle, mut titre, mut retour) = (None, None, None, None);
    for (k, v) in parametres {
        let place = match k.as_str() {
            "source" => &mut source,
            "cle" => &mut cle,
            "titre" => &mut titre,
            "retour" => &mut retour,
            _ => return None,
        };
        if place.replace(v.as_str()).is_some() {
            return None;
        }
    }
    let source = source.filter(|s| {
        (1..=32).contains(&s.len())
            && s.bytes().next().is_some_and(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
            && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    })?;
    let cle = cle.filter(|c| {
        (1..=128).contains(&c.len())
            && c.bytes().next().is_some_and(|b| b.is_ascii_alphanumeric())
            && c.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'.' | b'_' | b'-'))
    })?;
    let mut q = url::form_urlencoded::Serializer::new(String::new());
    q.append_pair("source", source).append_pair("cle", cle);
    if let Some(t) = titre {
        if t.chars().count() > 200 || t.chars().any(char::is_control) {
            return None;
        }
        q.append_pair("titre", t);
    }
    if let Some(r) = retour {
        let lu = Url::parse(r).ok().filter(|u| r.len() <= 2000 && u.scheme() == "https" && u.username().is_empty() && u.password().is_none())?;
        q.append_pair("retour", lu.as_str());
    }
    Some(q.finish())
}

/// Un lien qui ne fait que ramener Notak au premier plan : `notak://`, « Revenir dans Notak » de la page d'accord lue
/// dans Safari ; `notak://autorise`, où elle renvoie l'accord donné (la feuille de connexion d'iOS le reçoit d'ordinaire
/// elle-même, `AppareilPlugin.swift`). Rien d'autre : ni chemin, ni paramètre, ni port.
pub fn ramene_seulement(url: &Url) -> bool {
    url.scheme() == SCHEMA
        // `notak://` n'a pas d'hôte, mais une autorité, vide : `notak:t/abcdefgh` n'en a pas.
        && url.has_authority()
        && url.host_str().is_none_or(|h| h.eq_ignore_ascii_case("autorise"))
        && matches!(url.path(), "" | "/")
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

/// Relit un lien `notak://` ; rien s'il n'a pas l'une des formes permises.
pub fn lire(url: &Url) -> Option<Lien> {
    if url.scheme() != SCHEMA || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return None;
    }
    // Hors des schémas du web, l'hôte se lit tel quel : `normaliser` le relit comme celui d'une adresse `https`, en
    // minuscules et en punycode, et refuse ce qu'il refuserait tapé à la main.
    let hote = url.host_str().filter(|h| !h.is_empty())?;
    let origine = normaliser(&match url.port() {
        Some(p) => format!("{hote}:{p}"),
        None => hote.to_string(),
    })
    .ok()?;
    let mut vers = Url::parse(&format!("{origine}/")).ok()?;
    let mut parametres = Vec::new();
    if let Some(q) = url.query() {
        for (cle, valeur) in url::form_urlencoded::parse(q.as_bytes()) {
            parametres.push((cle.into_owned(), valeur.into_owned()));
        }
    }
    match url.path() {
        "" | "/" => match parametres.as_slice() {
            [] => {}
            [(d, dossier)] if d == "dossier" && tableau(dossier) => vers.set_query(Some(&format!("dossier={dossier}"))),
            [(d, dossier), (e, el)] if d == "dossier" && e == "element" && tableau(dossier) && element(el) => {
                vers.set_query(Some(&format!("dossier={dossier}&element={el}")))
            }
            _ => return None,
        },
        "/relier" => {
            let q = relier(&parametres)?;
            vers.set_path("/relier");
            vers.set_query(Some(&q));
        }
        chemin => {
            let toile = chemin.strip_prefix("/t/").filter(|t| tableau(t))?;
            if !parametres.is_empty() || url.query().is_some() {
                return None;
            }
            vers.set_path(&format!("/t/{toile}"));
        }
    }
    Some(Lien { origine, vers })
}

/// Combien de liens la coque suit coup sur coup.
const LIENS_MAX: usize = 3;
const LIENS_DUREE: Duration = Duration::from_secs(10);
static CADENCE: Cadence = Cadence::new(LIENS_MAX, LIENS_DUREE);

/// Les adresses que le système remet à la coque : les liens `notak://`, et eux seuls (les fichiers vont à
/// `fichiers.rs`). Le dernier lien l'emporte : deux pages ne s'ouvrent pas l'une sur l'autre.
pub fn recevoir(app: &AppHandle, urls: &[Url]) {
    let Some(url) = urls.iter().rev().find(|u| u.scheme() == SCHEMA) else { return };
    if ramene_seulement(url) {
        montrer(app);
        return;
    }
    if !CADENCE.permise(Instant::now()) {
        eprintln!("Notak : trop de liens coup sur coup, celui-ci ne s'ouvre pas");
        return;
    }
    let (Some(etat), Some(garde)) = (app.try_state::<Acces>(), app.try_state::<Origines>()) else { return };
    montrer(app);
    let francais = en_francais();
    let Some(lien) = lire(url) else {
        dire(app, textes(francais, ICI, Refus::Illisible, ""));
        return;
    };
    let hote = Url::parse(&lien.origine).ok().and_then(|u| u.host_str().map(str::to_string)).unwrap_or_default();
    let relie = etat.reglage.lire().serveur.as_deref() == Some(lien.origine.as_str())
        || garde.serveur.lire().as_deref() == Some(lien.origine.as_str());
    if !relie {
        dire(app, textes(francais, ICI, Refus::PasRelie, &hote));
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match acces::ouvrir_lien(&app, &lien.origine, lien.vers).await {
            Ok(()) | Err(Erreur::Annule) => {}
            Err(e) => {
                eprintln!("Notak : le lien vers {hote} ne s'est pas ouvert ({e:?})");
                dire(&app, textes(francais, ICI, Refus::Injoignable, &hote));
            }
        }
    });
}

/// La fenêtre de Notak, devant les autres. Sur un iPhone ou un iPad, le système y a déjà mis l'app.
fn montrer(app: &AppHandle) {
    #[cfg(desktop)]
    if let Some(f) = app.get_webview_window("principale") {
        let _ = f.unminimize();
        let _ = f.show();
        let _ = f.set_focus();
    }
    #[cfg(mobile)]
    let _ = app;
}

/// Où se dit un refus : sur le Mac, on clique, et l'on change de serveur par le menu de l'app ; sur un iPhone ou un
/// iPad, on touche, et l'on change de serveur dans Compte (le rond de la bibliothèque, ou les réglages).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Appareil {
    Mac,
    Ios,
}

const ICI: Appareil = if cfg!(target_os = "ios") { Appareil::Ios } else { Appareil::Mac };

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Refus {
    /// Le lien n'a pas l'une des formes permises.
    Illisible,
    /// Notak n'est pas relié à ce serveur.
    PasRelie,
    /// Le serveur n'a pas répondu comme il faut.
    Injoignable,
}

/// Le titre et le texte de la fenêtre qui dit pourquoi un lien ne s'ouvre pas.
fn textes(francais: bool, appareil: Appareil, refus: Refus, hote: &str) -> (String, String) {
    use Appareil::{Ios, Mac};
    match (refus, francais, appareil) {
        (Refus::Illisible, true, _) => (
            "Ce lien ne s'ouvre pas dans Notak".into(),
            "Il ne mène ni à un dossier, ni à une page, ni à une toile d'un serveur Notak.".into(),
        ),
        (Refus::Illisible, false, _) => ("This link can't open in Notak".into(), "It doesn't lead to a folder, a page or a board on a Notak server.".into()),
        (Refus::PasRelie, true, Mac) => (
            format!("Notak n'est pas relié à {hote}"),
            format!("Ce lien ouvre une page de {hote}. Pour l'ouvrir ici, connectez Notak à ce serveur (Notak › Changer de serveur…), puis cliquez de nouveau sur le lien."),
        ),
        (Refus::PasRelie, false, Mac) => (
            format!("Notak isn't connected to {hote}"),
            format!("This link opens a page on {hote}. To open it here, connect Notak to that server (Notak › Change server…), then click the link again."),
        ),
        (Refus::PasRelie, true, Ios) => (
            format!("Notak n'est pas relié à {hote}"),
            format!("Ce lien ouvre une page de {hote}. Pour l'ouvrir ici, connectez Notak à ce serveur depuis Compte, puis touchez de nouveau le lien."),
        ),
        (Refus::PasRelie, false, Ios) => (
            format!("Notak isn't connected to {hote}"),
            format!("This link opens a page on {hote}. To open it here, connect Notak to that server from Account, then tap the link again."),
        ),
        (Refus::Injoignable, true, Mac) => (format!("{hote} ne répond pas"), "Le lien ne s'est pas ouvert. Vérifiez votre connexion, puis cliquez de nouveau sur le lien.".into()),
        (Refus::Injoignable, false, Mac) => (format!("{hote} isn't responding"), "The link didn't open. Check your connection, then click the link again.".into()),
        (Refus::Injoignable, true, Ios) => (format!("{hote} ne répond pas"), "Le lien ne s'est pas ouvert. Vérifiez votre connexion, puis touchez de nouveau le lien.".into()),
        (Refus::Injoignable, false, Ios) => (format!("{hote} isn't responding"), "The link didn't open. Check your connection, then tap the link again.".into()),
    }
}

fn dire(app: &AppHandle, (titre, texte): (String, String)) {
    app.dialog().message(texte).title(titre).kind(MessageDialogKind::Warning).show(|_| {});
}

#[cfg(test)]
mod essais {
    use super::*;

    fn lu(adresse: &str) -> Option<(String, String)> {
        lire(&Url::parse(adresse).unwrap()).map(|l| (l.origine, l.vers.to_string()))
    }

    #[test]
    fn un_lien_mene_a_un_dossier_a_ce_qu_il_range_ou_a_une_toile() {
        let o = || "https://notak.silak.fr".to_string();
        assert_eq!(lu("notak://notak.silak.fr/?dossier=Abc_123-xyz"), Some((o(), "https://notak.silak.fr/?dossier=Abc_123-xyz".into())));
        assert_eq!(
            lu("notak://notak.silak.fr/?dossier=Abc_123-xyz&element=e1"),
            Some((o(), "https://notak.silak.fr/?dossier=Abc_123-xyz&element=e1".into()))
        );
        assert_eq!(lu("notak://notak.silak.fr/t/abcdefgh"), Some((o(), "https://notak.silak.fr/t/abcdefgh".into())));
        assert_eq!(lu("notak://notak.silak.fr/"), Some((o(), "https://notak.silak.fr/".into())));
        assert_eq!(lu("notak://notak.silak.fr"), Some((o(), "https://notak.silak.fr/".into())));
        // L'hôte se relit comme celui d'une adresse tapée : en minuscules, avec son port ; cet ordinateur, en HTTP.
        assert_eq!(lu("notak://Notak.Silak.FR:8443/t/abcdefgh"), Some(("https://notak.silak.fr:8443".into(), "https://notak.silak.fr:8443/t/abcdefgh".into())));
        assert_eq!(lu("notak://localhost:3005/t/abcdefgh"), Some(("http://localhost:3005".into(), "http://localhost:3005/t/abcdefgh".into())));
    }

    #[test]
    fn un_lien_ouvre_la_page_qui_cree_le_dossier_d_une_fiche() {
        let o = || "https://notak.silak.fr".to_string();
        assert_eq!(
            lu("notak://notak.silak.fr/relier?source=silak&cle=societe:01a1-2b&titre=OPTIQUE%20MAUCORT&retour=https%3A%2F%2Fapp.silak.fr%2Fcrm%2Fsocietes%2F01a1"),
            Some((o(), "https://notak.silak.fr/relier?source=silak&cle=societe%3A01a1-2b&titre=OPTIQUE+MAUCORT&retour=https%3A%2F%2Fapp.silak.fr%2Fcrm%2Fsocietes%2F01a1".into()))
        );
        assert_eq!(lu("notak://notak.silak.fr/relier?source=silak&cle=societe:42"), Some((o(), "https://notak.silak.fr/relier?source=silak&cle=societe%3A42".into())));
        for adresse in [
            "notak://notak.silak.fr/relier",
            "notak://notak.silak.fr/relier?source=silak",
            "notak://notak.silak.fr/relier?cle=societe:42",
            "notak://notak.silak.fr/relier?source=Silak&cle=societe:42",
            "notak://notak.silak.fr/relier?source=silak&cle=:42",
            "notak://notak.silak.fr/relier?source=silak&cle=societe/42",
            "notak://notak.silak.fr/relier?source=silak&cle=societe:42&cle=societe:43",
            "notak://notak.silak.fr/relier?source=silak&cle=societe:42&en_plus=1",
            "notak://notak.silak.fr/relier?source=silak&cle=societe:42&retour=http://app.silak.fr/",
            "notak://notak.silak.fr/relier?source=silak&cle=societe:42&retour=javascript:alert(1)",
            "notak://notak.silak.fr/relier?source=silak&cle=societe:42&titre=a%0Ab",
            "notak://notak.silak.fr/relier/plus?source=silak&cle=societe:42",
        ] {
            assert_eq!(lu(adresse), None, "{adresse}");
        }
    }

    #[test]
    fn un_lien_d_une_autre_forme_ne_mene_nulle_part() {
        for adresse in [
            // Un autre schéma, des identifiants, un fragment.
            "https://notak.silak.fr/t/abcdefgh",
            "notak://moi:secret@notak.silak.fr/t/abcdefgh",
            "notak://notak.silak.fr/t/abcdefgh#ailleurs",
            // Un autre chemin, ou un chemin qui sort de ceux de Notak.
            "notak://notak.silak.fr/api/sante",
            "notak://notak.silak.fr/t/abcdefgh/plus",
            "notak://notak.silak.fr/t/../api/moi",
            "notak://notak.silak.fr/t/%2E%2E%2Fapi",
            "notak://notak.silak.fr//ailleurs.fr/t/abcdefgh",
            // Des paramètres de trop, dans le désordre, répétés, ou des identifiants que Notak ne donne pas.
            "notak://notak.silak.fr/t/abcdefgh?dossier=abcdefgh",
            "notak://notak.silak.fr/?dossier=abcdefgh&retour=https://ailleurs.fr",
            "notak://notak.silak.fr/?element=e1&dossier=abcdefgh",
            "notak://notak.silak.fr/?dossier=abcdefgh&dossier=ijklmnop",
            "notak://notak.silak.fr/?dossier=court",
            "notak://notak.silak.fr/?dossier=abc%26defgh",
            "notak://notak.silak.fr/?dossier=abcdefgh&element=",
            "notak://notak.silak.fr/?vue=corbeille",
            "notak://notak.silak.fr/t/abcdefgh?",
            // Un hôte qu'on ne joindrait pas à la main : l'application elle-même, une IPv6, rien.
            "notak://tauri.localhost/t/abcdefgh",
            "notak://[::1]/t/abcdefgh",
            "notak:///t/abcdefgh",
            "notak:t/abcdefgh",
        ] {
            assert_eq!(lu(adresse), None, "{adresse}");
        }
    }

    #[test]
    fn notak_seul_et_la_fin_de_la_connexion_ne_font_que_ramener_notak() {
        for adresse in ["notak://", "notak:///", "notak://autorise", "notak://autorise/", "notak://Autorise"] {
            assert!(ramene_seulement(&Url::parse(adresse).unwrap()), "{adresse}");
        }
        for adresse in [
            "notak://notak.silak.fr",
            "notak://notak.silak.fr/",
            "notak://autorise/t/abcdefgh",
            "notak://autorise?dossier=abcdefgh",
            "notak://autorise#plus",
            "notak://autorise:8443",
            "notak://moi@autorise",
            "notak://?dossier=abcdefgh",
            "notak:///t/abcdefgh",
            "notak:",
            "notak:autorise",
            "https://autorise/",
        ] {
            assert!(!ramene_seulement(&Url::parse(adresse).unwrap()), "{adresse}");
        }
    }

    #[test]
    fn chaque_refus_se_dit_dans_les_deux_langues_et_sur_chaque_appareil() {
        for appareil in [Appareil::Mac, Appareil::Ios] {
            for refus in [Refus::Illisible, Refus::PasRelie, Refus::Injoignable] {
                let (fr, en) = (textes(true, appareil, refus, "notak.silak.fr"), textes(false, appareil, refus, "notak.silak.fr"));
                assert_ne!(fr, en);
                if refus != Refus::Illisible {
                    assert!(fr.0.contains("notak.silak.fr") && en.0.contains("notak.silak.fr"));
                }
            }
        }
        // Chacun dit où l'on change de serveur, et le geste qui relance le lien.
        let pas_relie = |francais, appareil| textes(francais, appareil, Refus::PasRelie, "notak.silak.fr").1;
        assert!(pas_relie(true, Appareil::Mac).contains("Notak › Changer de serveur…") && pas_relie(true, Appareil::Mac).contains("cliquez"));
        assert!(pas_relie(false, Appareil::Mac).contains("Notak › Change server…") && pas_relie(false, Appareil::Mac).contains("click"));
        assert!(pas_relie(true, Appareil::Ios).contains("depuis Compte") && pas_relie(true, Appareil::Ios).contains("touchez"));
        assert!(pas_relie(false, Appareil::Ios).contains("from Account") && pas_relie(false, Appareil::Ios).contains("tap"));
        for francais in [true, false] {
            assert!(!textes(francais, Appareil::Ios, Refus::Injoignable, "x").1.contains("cli"));
        }
        assert_eq!(ICI, if cfg!(target_os = "ios") { Appareil::Ios } else { Appareil::Mac });
    }
}
