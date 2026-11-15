// Le geste du bord de la vue web (revenir, avancer) ne mène qu'aux pages du site où l'on est : les toiles de
// l'appareil, ou le serveur Notak où la fenêtre est allée. Sur une toile, il ne vaut que juste après y être arrivé : le
// doigt qui part du bord, ensuite, déplace la toile.
import UIKit
import WebKit

/// Garde les deux gestes du bord que WebKit installe (`allowsBackForwardNavigationGestures`) : chacun ne mène qu'à une
/// entrée de l'historique du même site que la page, et, sur une toile, seulement dans l'instant qui suit l'arrivée.
///
/// WebKit ne les arrête qu'au bout de l'historique de la fenêtre, et celui-ci garde aussi les pages d'un autre site :
/// celles de l'appareil quand on est passé sur un serveur pendant la séance, celles du serveur quand on en est revenu.
/// La coque refuse d'y retourner (`navigation.rs`), mais WebKit a déjà fait glisser leur aperçu, qui restait à l'écran le
/// temps qu'il y renonce. Les retours de la page elle-même (les boutons de la souris, ⌘[) ne voient déjà que ses propres
/// entrées (`precedentSuivant.ts`).
///
/// Une toile se tire au doigt, et le pouce part souvent du bord de l'écran : le geste du retour y ramenait à la
/// bibliothèque au lieu de déplacer la toile. Il n'y vaut donc que le temps de se raviser (`DUREE_DU_RETOUR_SUR_UNE_TOILE`)
/// après l'arrivée sur la toile, par un toucher, un retour ou un lien ; passé ce délai, le bord est rendu à la page, et
/// le doigt qui en part tire la toile comme ailleurs. Le geste d'avancer suit la même règle : du bord droit aussi, le
/// pouce tire la toile. Hors des toiles (la bibliothèque, les réglages), les deux gestes valent toujours.
///
/// La coque reconnaît la toile à son adresse, `/t/<toile>` (et `/t/<toile>/e/<élément>`, un élément ouvert en grand :
/// une carte mentale, un croquis, une image se tirent aussi), la même dans l'app et sur un serveur (`adresse.ts`). Elle
/// voit chaque arrivée elle-même, celles que la page pousse dans l'historique comme celles du geste : rien n'est demandé
/// à la page, et une page d'un serveur plus ancien ou plus récent que la coque est gardée de même. Une adresse qu'elle ne
/// reconnaît pas garde le geste, comme avant.
///
/// On coupe le geste du sens fermé, pas `allowsBackForwardNavigationGestures` : sans lui, WebKit cesse aussi de
/// photographier la page qu'on quitte, et le geste suivant ferait glisser un panneau blanc à la place de la page d'avant.
final class GardeDuBord {
  /// Le temps de se raviser après l'arrivée sur une toile : un retour d'un pouce, pas plus.
  static let DUREE_DU_RETOUR_SUR_UNE_TOILE: TimeInterval = 1.5
  /// Un geste en cours n'est pas coupé sous le doigt : on revient voir à ce rythme qu'il soit fini.
  private static let REPRISE_APRES_UN_GESTE: TimeInterval = 0.25

  private weak var vue: WKWebView?
  private var observations: [NSKeyValueObservation] = []
  /// La page où l'on est arrivé en dernier (son origine et son chemin), et quand.
  private var arrivee: (page: String?, instant: Date)?
  /// Le prochain réglage prévu : la fin du temps de se raviser, ou la fin d'un geste en cours.
  private var prochain: DispatchWorkItem?

  init(_ vue: WKWebView) {
    self.vue = vue
    observations = [
      // L'adresse d'une page que la page pousse dans l'historique (`pushState`) arrive avec son entrée ; au cas où
      // l'entrée viendrait juste après, on revient voir au tour suivant, pour ne pas manquer l'arrivée sur une toile.
      vue.observe(\.url, options: [.initial]) { [weak self] _, _ in
        self?.regler()
        DispatchQueue.main.async { self?.regler() }
      },
      vue.observe(\.canGoBack) { [weak self] _, _ in self?.regler() },
      vue.observe(\.canGoForward) { [weak self] _, _ in self?.regler() },
      // L'adresse change dès qu'une page commence à venir ; l'historique ne la prend qu'en l'affichant, avant la fin du
      // chargement.
      vue.observe(\.isLoading) { [weak self] _, _ in self?.regler() },
    ]
  }

  deinit {
    prochain?.cancel()
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

  /// Une toile, ou un élément ouvert en grand sur elle : `/t/<toile>`, `/t/<toile>/e/<élément>`.
  static func estUneToile(_ url: URL?) -> Bool {
    guard let url = url, origine(url) != nil else { return false }
    let morceaux = url.path.split(separator: "/", omittingEmptySubsequences: true)
    return morceaux.count >= 2 && morceaux[0] == "t"
  }

  /// La page, pour reconnaître une arrivée : son origine et son chemin. Ni la requête ni l'ancre ne font une autre page.
  static func page(_ url: URL?) -> String? {
    guard let url = url, let site = origine(url) else { return nil }
    return site + url.path
  }

  /// Combien de temps le bord fait encore le geste, sur la page `ici` où l'on est arrivé à `arrivee` : toujours (`nil`)
  /// hors d'une toile, et rien (`0`) une fois le temps de se raviser passé.
  static func resteAuBord(sur ici: URL?, arrivee: Date, maintenant: Date) -> TimeInterval? {
    guard estUneToile(ici) else { return nil }
    return max(0, DUREE_DU_RETOUR_SUR_UNE_TOILE - maintenant.timeIntervalSince(arrivee))
  }

  private func regler() {
    prochain?.cancel()
    prochain = nil
    guard let vue = vue else { return }
    let historique = vue.backForwardList
    let ici = historique.currentItem?.url
    let maintenant = Date()
    // Une arrivée : l'historique a pris une autre page (un toucher, un lien, un geste, le retour de la page).
    let page = Self.page(ici)
    if arrivee == nil || arrivee?.page != page { arrivee = (page, maintenant) }
    let reste = Self.resteAuBord(sur: ici, arrivee: arrivee?.instant ?? maintenant, maintenant: maintenant)
    let auBord = reste.map { $0 > 0 } ?? true
    let reculer = auBord && Self.permis(de: ici, vers: historique.backItem?.url)
    let avancer = auBord && Self.permis(de: ici, vers: historique.forwardItem?.url)
    // Le retour part du bord gauche, ou du droit dans une langue qui s'écrit de droite à gauche.
    let bordDuRetour: UIRectEdge = vue.effectiveUserInterfaceLayoutDirection == .rightToLeft ? .right : .left
    let gestes = ((vue.gestureRecognizers ?? []) + (vue.scrollView.gestureRecognizers ?? []))
      .compactMap { $0 as? UIScreenEdgePanGestureRecognizer }
    var enCours = false
    for geste in gestes {
      let actif = geste.edges.contains(bordDuRetour) ? reculer : avancer
      guard geste.isEnabled != actif else { continue }
      // Couper un geste sous le doigt l'annulerait au milieu de son glissé : il finit d'abord.
      if !actif, [.began, .changed].contains(geste.state) {
        enCours = true
        continue
      }
      geste.isEnabled = actif
    }
    // Sur une toile, le bord revient à la page à la fin du temps de se raviser ; après un geste en cours, on revient voir.
    let attente = enCours ? Self.REPRISE_APRES_UN_GESTE : reste.flatMap { $0 > 0 ? $0 : nil }
    if let attente = attente {
      let suite = DispatchWorkItem { [weak self] in self?.regler() }
      prochain = suite
      DispatchQueue.main.asyncAfter(deadline: .now() + attente, execute: suite)
    }
  }
}
