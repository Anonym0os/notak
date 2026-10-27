// Le natif iOS de Notak, et rien de plus que ce qu'une page ne sait pas faire :
// - `infos` : où l'on tourne (téléphone ou tablette, système, modèle, version de l'app, zones sûres) ;
// - `reglerTheme` : la couleur de la vue derrière la page et le style de la barre d'état, pour que les bords (encoche,
//   barre d'accueil) soient du thème et qu'aucun blanc ne paraisse au lancement ni en sombre ;
// - `capturerFenetre` : la page telle qu'elle est peinte, en PNG, pour un signalement (comme `capturer_fenetre` sur
//   macOS) ; la vue ne photographie qu'elle-même, aucune autorisation d'enregistrement d'écran ;
// - `haptique` : un retour au doigt (une aimantation, une suppression) ;
// - `partager` : la feuille de partage d'iOS pour un fichier (Enregistrer dans Fichiers, AirDrop, Mail…), là où une
//   page ne sait ni télécharger ni ouvrir « Enregistrer sous » ;
// - l'événement `clavier` : la hauteur du clavier à l'écran et la durée de son animation, avant qu'il n'arrive.
// Le nom de chaque méthode est le camelCase de la commande déclarée dans `build.rs`.
import SwiftRs
import Tauri
import UIKit
import WebKit

struct ArgsTheme: Decodable {
  /// `clair` ou `sombre` : ce que la page affiche, une fois le réglage « système » résolu.
  let theme: String
  /// `#rrggbb` : le fond de la toile dans ce thème (`--notak-fond`).
  let fond: String
}

struct ArgsPartage: Decodable {
  /// Le nom du fichier proposé (« Voyage.notak », « Voyage.pdf ») : il sert tel quel dans Fichiers ou AirDrop.
  let nom: String
  /// Ses octets, en base64.
  let donnees: String
}

struct ArgsHaptique: Decodable {
  /// `leger`, `moyen`, `fort`, `selection`, `succes`, `avertissement`, `erreur`.
  let sorte: String
}

class AppareilPlugin: Plugin {
  private weak var vue: WKWebView?
  private var observateurs: [NSObjectProtocol] = []
  private var gardeDefilement: NSKeyValueObservation?

  public override func load(webview: WKWebView) {
    vue = webview
    // La page a son propre défilement et son propre zoom : pas de rebond ni de marge que le système ajouterait.
    webview.scrollView.bounces = false
    webview.scrollView.contentInsetAdjustmentBehavior = .never
    // Quand le clavier monte, iOS fait défiler la page entière pour montrer le champ : la barre du haut sortait de
    // l'écran et la barre du bas sautait. La page reste où elle est ; c'est elle qui place ce qu'on écrit au-dessus du
    // clavier (`--clavier`, la toile recadre la note).
    webview.scrollView.isScrollEnabled = false
    gardeDefilement = webview.scrollView.observe(\.contentOffset, options: [.new]) { vue, _ in
      if vue.contentOffset != .zero { vue.contentOffset = .zero }
    }
    // Ni pincement ni double toucher n'agrandissent la page entière : la toile zoome seule, et une page agrandie
    // cacherait les boutons qui permettent d'en sortir.
    webview.scrollView.minimumZoomScale = 1
    webview.scrollView.maximumZoomScale = 1
    webview.scrollView.pinchGestureRecognizer?.isEnabled = false
    // iOS 26 floute ce qui passe sous la barre d'état et la barre d'accueil, comme sous les barres d'une liste :
    // la page pose elle-même ses boutons hors des zones sûres, ce voile ne ferait que couper la pastille du zoom.
    if #available(iOS 26.0, *) {
      for bord in [webview.scrollView.topEdgeEffect, webview.scrollView.bottomEdgeEffect,
                   webview.scrollView.leftEdgeEffect, webview.scrollView.rightEdgeEffect] {
        bord.isHidden = true
      }
    }
    // Le geste du bord gauche fait le retour de l'historique : chaque toile, la bibliothèque et l'élément ouvert en
    // grand ont leur adresse (`adresse.ts`), et le retour y ramène comme le bouton ‹.
    webview.allowsBackForwardNavigationGestures = true
    masquerBarreDuClavier(webview)
    webview.isOpaque = false
    let centre = NotificationCenter.default
    observateurs.append(
      centre.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { [weak self] n in
        self?.clavier(n)
      })
    observateurs.append(
      centre.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { [weak self] n in
        self?.clavier(n, cache: true)
      })
  }

  /// La barre « ˄ ˅ ✓ » qu'iOS pose au-dessus du clavier d'un formulaire : Notak a sa propre barre (celle d'une note
  /// qu'on écrit), et celle-ci mange une ligne d'écran. La vue de contenu de la webview prend une sous-classe qui ne
  /// rend aucune barre d'accessoires, comme le fait le plugin Keyboard de Capacitor (`hideFormAccessoryBar`).
  private func masquerBarreDuClavier(_ vue: WKWebView) {
    guard let contenu = vue.scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }),
          let base: AnyClass = object_getClass(contenu) else { return }
    let nom = "\(NSStringFromClass(base))_NotakSansBarre"
    var classe: AnyClass? = NSClassFromString(nom)
    if classe == nil, let neuve = objc_allocateClassPair(base, nom, 0) {
      let selecteur = #selector(getter: UIResponder.inputAccessoryView)
      let rien: @convention(block) (AnyObject) -> AnyObject? = { _ in nil }
      if let methode = class_getInstanceMethod(UIView.self, selecteur) {
        class_addMethod(neuve, selecteur, imp_implementationWithBlock(rien), method_getTypeEncoding(methode))
      }
      objc_registerClassPair(neuve)
      classe = neuve
    }
    if let classe = classe { object_setClass(contenu, classe) }
  }

  deinit {
    observateurs.forEach(NotificationCenter.default.removeObserver)
  }

  /// La hauteur visible du clavier dans la fenêtre (0 quand il se range), et la durée de son animation.
  private func clavier(_ n: Notification, cache: Bool = false) {
    let duree = (n.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
    var hauteur: CGFloat = 0
    if !cache, let fenetre = vue?.window, let cadre = (n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue {
      let visible = fenetre.bounds.intersection(fenetre.convert(cadre, from: nil))
      hauteur = visible.isNull ? 0 : visible.height
    }
    trigger("clavier", data: ["hauteur": Double(hauteur), "duree": duree])
  }

  @objc public func infos(_ invoke: Invoke) {
    let appareil = UIDevice.current
    let idiome: String
    switch appareil.userInterfaceIdiom {
    case .pad: idiome = "tablette"
    case .phone: idiome = "telephone"
    default: idiome = "ordinateur"
    }
    let zones = vue?.window?.safeAreaInsets ?? .zero
    let info = Bundle.main.infoDictionary ?? [:]
    invoke.resolve([
      "plateforme": "ios",
      "idiome": idiome,
      "systeme": appareil.systemVersion,
      "modele": modele(),
      "version": (info["CFBundleShortVersionString"] as? String) ?? "",
      "build": (info["CFBundleVersion"] as? String) ?? "",
      "zonesSures": ["haut": Double(zones.top), "droite": Double(zones.right), "bas": Double(zones.bottom), "gauche": Double(zones.left)],
    ])
  }

  /// « iPad14,3 », tel que le système le nomme ; la page n'en fait qu'un libellé d'appareil dans un dossier partagé.
  private func modele() -> String {
    var info = utsname()
    uname(&info)
    return withUnsafePointer(to: &info.machine) { p in
      p.withMemoryRebound(to: CChar.self, capacity: Int(_SYS_NAMELEN)) { String(cString: $0) }
    }
  }

  @objc public func reglerTheme(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ArgsTheme.self)
    guard let couleur = UIColor(hex: args.fond) else {
      return invoke.reject("couleur illisible : \(args.fond)")
    }
    DispatchQueue.main.async { [weak self] in
      guard let vue = self?.vue else { return invoke.resolve() }
      vue.backgroundColor = couleur
      vue.scrollView.backgroundColor = couleur
      vue.superview?.backgroundColor = couleur
      self?.manager.viewController?.view.backgroundColor = couleur
      // Le style de la barre d'état suit l'apparence de la fenêtre : claire sur un fond sombre, et l'inverse.
      vue.window?.overrideUserInterfaceStyle = args.theme == "sombre" ? .dark : .light
      invoke.resolve()
    }
  }

  @objc public func capturerFenetre(_ invoke: Invoke) {
    DispatchQueue.main.async { [weak self] in
      guard let vue = self?.vue else { return invoke.reject("pas de vue") }
      vue.takeSnapshot(with: nil) { image, erreur in
        guard let png = image?.pngData() else {
          return invoke.reject("la photo de la fenêtre a échoué", error: erreur)
        }
        invoke.resolve(["png": png.base64EncodedString(), "echelle": Double(image?.scale ?? 1)])
      }
    }
  }

  /// Écrit le fichier dans un dossier temporaire et ouvre la feuille de partage ; rend `fait` (la personne a choisi où
  /// l'envoyer) et l'activité choisie. Le dossier s'efface quand la feuille se referme.
  @objc public func partager(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ArgsPartage.self)
    guard let octets = Data(base64Encoded: args.donnees) else {
      return invoke.reject("données illisibles")
    }
    // Un nom, jamais un chemin : rien ne s'écrit hors du dossier du partage.
    let nom = (args.nom as NSString).lastPathComponent
    let dossier = FileManager.default.temporaryDirectory.appendingPathComponent("partage-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    let fichier = dossier.appendingPathComponent(nom.isEmpty ? "Notak" : nom)
    try octets.write(to: fichier)
    DispatchQueue.main.async { [weak self] in
      guard let vc = self?.manager.viewController else {
        try? FileManager.default.removeItem(at: dossier)
        return invoke.reject("pas de vue où présenter la feuille")
      }
      let feuille = UIActivityViewController(activityItems: [fichier], applicationActivities: nil)
      // Sur un iPad, la feuille est un popover : elle part du bas de l'écran, sans flèche.
      if let pop = feuille.popoverPresentationController {
        pop.sourceView = vc.view
        pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 80, width: 1, height: 1)
        pop.permittedArrowDirections = []
      }
      feuille.completionWithItemsHandler = { activite, fait, _, erreur in
        try? FileManager.default.removeItem(at: dossier)
        if let erreur = erreur {
          return invoke.reject("le partage a échoué", error: erreur)
        }
        invoke.resolve(["fait": fait, "activite": activite?.rawValue ?? ""])
      }
      vc.present(feuille, animated: true)
    }
  }

  @objc public func haptique(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ArgsHaptique.self)
    DispatchQueue.main.async {
      switch args.sorte {
      case "leger": UIImpactFeedbackGenerator(style: .light).impactOccurred()
      case "moyen": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
      case "fort": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
      case "selection": UISelectionFeedbackGenerator().selectionChanged()
      case "succes": UINotificationFeedbackGenerator().notificationOccurred(.success)
      case "avertissement": UINotificationFeedbackGenerator().notificationOccurred(.warning)
      case "erreur": UINotificationFeedbackGenerator().notificationOccurred(.error)
      default: break
      }
      invoke.resolve()
    }
  }
}

extension UIColor {
  /// `#rrggbb` ou `#rgb` ; `nil` pour tout le reste (la page n'envoie que ce qu'elle a calculé elle-même).
  convenience init?(hex: String) {
    var h = hex.trimmingCharacters(in: .whitespaces)
    if h.hasPrefix("#") { h.removeFirst() }
    if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
    self.init(
      red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
  }
}

@_cdecl("init_plugin_appareil")
func initPlugin() -> Plugin {
  return AppareilPlugin()
}
