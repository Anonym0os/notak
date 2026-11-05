//! La langue des quelques mots que la coque dit elle-même : son menu (`menu.rs`), ses fenêtres (`fichiers.rs`,
//! `lien.rs`). Le français ou l'anglais, comme la page.

/// Une langue (`fr-FR`, `en`…) est-elle le français ? Sans langue connue, le français, celle de Notak par défaut.
pub fn francais(langue: Option<&str>) -> bool {
    langue.is_none_or(|l| l.trim().get(..2).is_some_and(|d| d.eq_ignore_ascii_case("fr")))
}

/// La première langue choisie dans les réglages du Mac, de l'iPhone ou de l'iPad.
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub fn en_francais() -> bool {
    francais(objc2_foundation::NSLocale::preferredLanguages().firstObject().map(|l| l.to_string()).as_deref())
}

/// Ailleurs, la coque ne lit pas la langue du système : le français.
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
pub fn en_francais() -> bool {
    francais(None)
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn le_francais_se_reconnait_a_ses_deux_lettres() {
        for (langue, fr) in [(Some("fr-FR"), true), (Some("fr"), true), (Some("FR-ca"), true), (Some("en-US"), false), (Some("de"), false), (Some(""), false), (None, true)] {
            assert_eq!(francais(langue), fr, "{langue:?}");
        }
    }
}
