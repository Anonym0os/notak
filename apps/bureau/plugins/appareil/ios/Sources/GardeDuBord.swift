// Le geste du bord de la vue web (revenir, avancer) ne mène qu'aux pages du site où l'on est : les toiles de
// l'appareil, ou le serveur Notak où la fenêtre est allée.
import UIKit
import WebKit

/// Garde les deux gestes du bord que WebKit installe (`allowsBackForwardNavigationGestures`) : chacun ne mène qu'à une
/// entrée de l'historique du même site que la page.
///
/// WebKit ne les arrête qu'au bout de l'historique de la fenêtre, et celui-ci garde aussi les pages d'un autre site :
/// celles de l'appareil quand on est passé sur un serveur pendant la séance, celles du serveur quand on en est revenu.
/// La coque refuse d'y retourner (`navigation.rs`), mais WebKit a déjà fait glisser leur aperçu, qui restait à l'écran le
/// temps qu'il y renonce. Les retours de la page elle-même (les boutons de la souris, ⌘[) ne voient déjà que ses propres
/// entrées (`precedentSuivant.ts`).
///
/// On coupe le geste du sens fermé, pas `allowsBackForwardNavigationGestures` : sans lui, WebKit cesse aussi de
/// photographier la page qu'on quitte, et le geste suivant ferait glisser un panneau blanc à la place de la page d'avant.
final class GardeDuBord {
  private weak var vue: WKWebView?
  private var observations: [NSKeyValueObservation] = []

  init(_ vue: WKWebView) {
    self.vue = vue
    observations = [
      vue.observe(\.url, options: [.initial]) { [weak self] _, _ in self?.regler() },
      vue.observe(\.canGoBack) { [weak self] _, _ in self?.regler() },
      vue.observe(\.canGoForward) { [weak self] _, _ in self?.regler() },
      // L'adresse change dès qu'une page commence à venir ; l'historique ne la prend qu'en l'affichant, avant la fin du
      // chargement.
      vue.observe(\.isLoading) { [weak self] _, _ in self?.regler() },
    ]
  }

  /// L'origine d'une adresse (`https://notak.exemple.fr:8443`) ; rien pour une page qui n'en a pas à elle, comme la page
  /// vide d'un passage de la coque (`about:blank`).
  static func origine(_ url: URL?) -> String? {
    guard let url = url, let schema = url.scheme?.lowercased(), let hote = url.host?.lowercased(), !hote.isEmpty else { return nil }
    return "\(schema)://\(hote)\(url.port.map { ":\($0)" } ?? "")"
  }

  /// Le geste peut-il mener de la page `ici` à l'entrée `la` ? Sans entrée, WebKit ne glisse pas : rien à couper.
  static func permis(de ici: URL?, vers la: URL?) -> Bool {
    guard let la = la else { return true }
    guard let site = origine(ici) else { return false }
    return site == origine(la)
  }

  private func regler() {
    guard let vue = vue else { return }
    let historique = vue.backForwardList
    let ici = historique.currentItem?.url
    let reculer = Self.permis(de: ici, vers: historique.backItem?.url)
    let avancer = Self.permis(de: ici, vers: historique.forwardItem?.url)
    // Le retour part du bord gauche, ou du droit dans une langue qui s'écrit de droite à gauche.
    let bordDuRetour: UIRectEdge = vue.effectiveUserInterfaceLayoutDirection == .rightToLeft ? .right : .left
    let gestes = ((vue.gestureRecognizers ?? []) + (vue.scrollView.gestureRecognizers ?? []))
      .compactMap { $0 as? UIScreenEdgePanGestureRecognizer }
    for geste in gestes {
      let actif = geste.edges.contains(bordDuRetour) ? reculer : avancer
      if geste.isEnabled != actif { geste.isEnabled = actif }
    }
  }
}
