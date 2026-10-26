import type { Textes } from '@notak/tableau'

/** Textes de la piste « serveur », réunis à ceux de `../langue.ts` (fichier temporaire, replié dans `langue.ts` à la fin). */
export const fr: Textes = {
  // Les refus des codes d'appareil (la page « Autoriser l'app de bureau »), dits à partir du code de Better Auth.
  'erreur.appareil_inconnu': 'Ce code n’est pas reconnu, ou il a déjà servi.',
  'erreur.appareil_expire': 'Ce code a expiré.',
  'erreur.appareil_autre_compte': 'Cette demande a été ouverte avec un autre compte : connectez-vous avec le compte qui l’a ouverte, ou relancez la connexion dans l’app.',

  // Quitter ce serveur (« Changer de serveur », « Toiles de cet ordinateur », « Ouvrir sur cet ordinateur ») : la coque a refusé.
  'serveur.retourImpossible': 'Impossible de quitter ce serveur pour le moment. Réessayez.',

  // L'écran de connexion dans l'app de bureau.
  'serveur.connexion.serveur': 'Serveur :',
  'serveur.connexion.changer': 'Changer de serveur',
  'serveur.connexion.local': 'Ouvrir les toiles de cet ordinateur',
  'serveur.connexion.ouvreNavigateur': 'Ces connexions se terminent dans votre navigateur.',
  'serveur.connexion.ssoNavigateur':
    'Votre navigateur s’ouvrira sur ce serveur : saisissez-y votre adresse professionnelle, et Notak vous enverra vers le service de connexion de votre entreprise.',
  'serveur.connexion.continuerNavigateur': 'Continuer dans le navigateur',
  'serveur.connexion.oubliNavigateur': 'Le lien reçu s’ouvrira dans votre navigateur : changez-y le mot de passe, puis revenez ici pour vous connecter.',
  'serveur.connexion.lienNavigateur': 'Ce lien s’ouvrira dans votre navigateur : changez-y le mot de passe, puis revenez ici pour vous connecter.',
  'serveur.session.finie': 'Votre session a pris fin. Reconnectez-vous pour continuer.',

  // L'attente de la connexion par le navigateur.
  'serveur.code.titre': 'Terminez la connexion dans votre navigateur',
  'serveur.code.titreFin': 'La connexion n’a pas abouti',
  'serveur.code.demande': 'Demande d’un code à {hote}…',
  'serveur.code.accorde': 'Autorisé : ouverture de votre session…',
  'serveur.code.aide': 'Votre navigateur s’ouvre sur {hote}. Connectez-vous comme d’habitude sur cette page, vérifiez le code, puis autorisez l’app.',
  'serveur.code.etiquette': 'Code à retrouver dans le navigateur',
  'serveur.code.expireDans': 'Ce code expire dans {duree}.',
  'serveur.code.rouvrir': 'Rouvrir le navigateur',
  'serveur.code.siRien': 'Si votre navigateur ne s’est pas ouvert, utilisez le bouton ci-dessus.',
  'serveur.code.recommencer': 'Recommencer',
  'serveur.code.retour': 'Retour à la connexion',
  'serveur.code.expire': 'Ce code n’est plus valable : il a expiré, ou il a déjà servi. Recommencez pour en obtenir un nouveau.',
  'serveur.code.refuse': 'La connexion a été refusée dans le navigateur. Si ce n’était pas voulu, recommencez.',
  'serveur.code.reseau': 'Le serveur ne répond pas. Vérifiez votre connexion, puis recommencez.',
  'serveur.code.ancien': 'Ce serveur ne sait pas encore connecter l’app par le navigateur. Utilisez votre mot de passe, ou demandez à son administrateur de le mettre à jour.',
  'serveur.code.session': 'La connexion a été autorisée, mais cette fenêtre n’a pas reçu votre session. Recommencez, ou utilisez votre mot de passe.',

  // La page du navigateur où l'on autorise l'app de bureau.
  'serveur.autoriser.titre': 'Autoriser l’app Notak de bureau ?',
  'serveur.autoriser.intro': 'Une app Notak de bureau demande à se connecter au compte {nom} ({email}) sur ce serveur.',
  'serveur.autoriser.connexion': 'Connectez-vous pour autoriser l’app Notak de bureau.',
  'serveur.autoriser.comparer': 'Comparez ce code avec celui de l’app',
  'serveur.autoriser.depuis': 'Adresse IP de l’app',
  'serveur.autoriser.quand': 'Date de la demande',
  'serveur.autoriser.cettePage': 'Votre adresse IP actuelle',
  'serveur.autoriser.inconnue': 'Inconnue',
  'serveur.autoriser.alInstant': 'à l’instant',
  'serveur.autoriser.autreReseau':
    'L’adresse d’où l’app a fait cette demande diffère de la vôtre (cela arrive avec un VPN, ou en changeant de réseau) : si vous n’avez pas lancé la connexion vous-même, refusez.',
  'serveur.autoriser.origineInconnue': 'Le serveur ne sait plus d’où cette demande est partie (il a redémarré depuis). Si vous n’avez pas lancé la connexion vous-même, refusez.',
  'serveur.autoriser.seulement':
    'N’autorisez que si vous venez de lancer la connexion dans l’app Notak et que ce code est le même. Sans réponse de votre part, rien ne se passe : le code s’éteint au bout de dix minutes.',
  'serveur.autoriser.autoriser': 'Autoriser',
  'serveur.autoriser.refuser': 'Refuser',
  'serveur.autoriser.fait': 'C’est fait : revenez dans l’app Notak.',
  'serveur.autoriser.faitAide': 'Elle est connectée à votre compte. Vous pouvez fermer cet onglet.',
  'serveur.autoriser.refusee': 'Demande refusée.',
  'serveur.autoriser.refuseeAide': 'L’app Notak ne sera pas connectée. Vous pouvez fermer cet onglet.',
  'serveur.autoriser.impossible': 'Cette demande ne peut pas être traitée',
  'serveur.autoriser.relancer': 'Relancez la connexion dans l’app Notak : un nouveau code s’y affichera.',
  'serveur.autoriser.dejaFait': 'Ce code a déjà été utilisé.',
  'serveur.autoriser.saisieTitre': 'Quel code l’app affiche-t-elle ?',
  'serveur.autoriser.saisieChamp': 'Code affiché dans l’app Notak',
  'serveur.autoriser.continuer': 'Continuer',
  'serveur.autoriser.codeMalForme': 'Ce code n’a pas le bon format : des lettres et des chiffres, huit en tout.',

  // Le menu du compte dans l'app de bureau.
  'serveur.compte.changerServeur': 'Changer de serveur…',
  'serveur.compte.toilesLocales': 'Toiles de cet ordinateur',
  'serveur.compte.toilesLocales.detail': 'Pour cette fois, sans serveur ni compte',

  // La nouvelle version du serveur, dite à ses admins.
  'serveur.maj.titre': 'Mise à jour du serveur',
  'serveur.maj.disponible': 'Notak {version} est disponible (ce serveur : {actuelle}).',
  'serveur.maj.copier': 'Copier la commande',
  'serveur.maj.copiee': 'Copiée : à lancer sur le serveur',
  'serveur.maj.commande': 'À lancer sur le serveur, dans le dossier de Notak (celui du compose.yaml) :',
  'serveur.maj.copieEchec': 'La copie a échoué : copiez la commande à la main.',
  'serveur.maj.notes': 'Notes de version',

  // Une copie qui attend, pendant la connexion ou quand le serveur ne répond pas : elle s'ouvrira une fois connecté.
  'serveur.attente.fichier.one': 'Une copie Notak attend : connectez-vous pour l’importer sur {hote}, ou ouvrez-la sur cet ordinateur.',
  'serveur.attente.fichier.other': '{n} copies Notak attendent : connectez-vous pour les importer sur {hote}, ou ouvrez-les sur cet ordinateur.',
  'serveur.attente.confiee': 'Une copie de vos toiles de cet ordinateur attend : connectez-vous pour l’importer sur {hote}.',

  // Les copies remises à l'app par le système, et les toiles de cet ordinateur confiées à ce serveur.
  'serveur.ouverts.titre': '« {nom} »',
  'serveur.ouverts.titreConfiee': 'Importer les toiles de cet ordinateur sur {hote} ?',
  'serveur.ouverts.confiee':
    'Une copie de vos toiles de cet ordinateur est prête. Elle s’ajoutera à votre accueil sur {hote}, comme une nouvelle toile. Rien n’est supprimé sur cet ordinateur : vos toiles y restent.',
  'serveur.ouverts.confieeNote':
    'Si vous ne l’importez pas, elle ne vous sera pas reproposée. Pour en refaire une, ouvrez « Où sont mes toiles ? » sur les toiles de cet ordinateur, puis « Copier mes toiles sur {hote} ».',
  'serveur.ouverts.fichier': 'Copie Notak de {taille}, ouverte depuis votre ordinateur. L’importer l’ajoute à votre accueil sur {hote}.',
  'serveur.ouverts.ouvrirIciNote': '« Ouvrir sur cet ordinateur » la garde parmi les toiles de cet ordinateur, sans serveur. Pour cette fois seulement : le démarrage de Notak ne change pas.',
  'serveur.ouverts.importerSur': 'Importer sur {hote}',
  'serveur.ouverts.importer': 'Importer',
  'serveur.ouverts.ouvrirIci': 'Ouvrir sur cet ordinateur',
  'serveur.ouverts.pasMaintenant': 'Ne pas importer',
  'serveur.ouverts.encours': 'Import en cours…',
  'serveur.ouverts.illisible': 'Cette copie n’a pas pu être lue. Ouvrez-la de nouveau depuis votre ordinateur.',
  'serveur.ouverts.abimee': 'Cette copie est abîmée : elle ne peut pas s’ouvrir. Essayez une autre sauvegarde.',
  'serveur.ouverts.tropGrosse': 'Cette copie est trop volumineuse pour s’ouvrir. Refaites-en une plus légère.',
}

export const en: Textes = {
  'erreur.appareil_inconnu': 'This code isn’t recognized, or it has already been used.',
  'erreur.appareil_expire': 'This code has expired.',
  'erreur.appareil_autre_compte': 'This request was opened with another account: sign in with the account that opened it, or start the sign-in again in the app.',

  'serveur.retourImpossible': 'Can’t leave this server right now. Try again.',

  'serveur.connexion.serveur': 'Server:',
  'serveur.connexion.changer': 'Change server',
  'serveur.connexion.local': 'Open the boards on this computer',
  'serveur.connexion.ouvreNavigateur': 'These sign-ins finish in your browser.',
  'serveur.connexion.ssoNavigateur': 'Your browser will open on this server: enter your work email there, and Notak will send you to your company’s sign-in service.',
  'serveur.connexion.continuerNavigateur': 'Continue in the browser',
  'serveur.connexion.oubliNavigateur': 'The link you receive opens in your browser: change the password there, then come back here to sign in.',
  'serveur.connexion.lienNavigateur': 'This link opens in your browser: change the password there, then come back here to sign in.',
  'serveur.session.finie': 'Your session has ended. Sign in again to continue.',

  'serveur.code.titre': 'Finish signing in using your browser',
  'serveur.code.titreFin': 'Signing in didn’t work',
  'serveur.code.demande': 'Asking {hote} for a code…',
  'serveur.code.accorde': 'Authorized: opening your session…',
  'serveur.code.aide': 'Your browser is opening {hote}. Sign in on that page as usual, check the code, then authorize the app.',
  'serveur.code.etiquette': 'Code to find in the browser',
  'serveur.code.expireDans': 'This code expires in {duree}.',
  'serveur.code.rouvrir': 'Reopen the browser',
  'serveur.code.siRien': 'If your browser didn’t open, use the button above.',
  'serveur.code.recommencer': 'Start over',
  'serveur.code.retour': 'Back to sign in',
  'serveur.code.expire': 'This code is no longer valid: it has expired, or it has already been used. Start over to get a new one.',
  'serveur.code.refuse': 'Sign-in was refused in the browser. If that wasn’t intended, start over.',
  'serveur.code.reseau': 'The server isn’t answering. Check your connection, then start over.',
  'serveur.code.ancien': 'This server can’t yet sign the app in through the browser. Use your password, or ask its administrator to update it.',
  'serveur.code.session': 'Sign-in was authorized, but this window didn’t receive your session. Start over, or use your password.',

  'serveur.autoriser.titre': 'Authorize the Notak desktop app?',
  'serveur.autoriser.intro': 'A Notak desktop app is asking to sign in to the account {nom} ({email}) on this server.',
  'serveur.autoriser.connexion': 'Sign in to authorize the Notak desktop app.',
  'serveur.autoriser.comparer': 'Compare this code with the one in the app',
  'serveur.autoriser.depuis': 'IP address of the app',
  'serveur.autoriser.quand': 'Date of the request',
  'serveur.autoriser.cettePage': 'Your current IP address',
  'serveur.autoriser.inconnue': 'Unknown',
  'serveur.autoriser.alInstant': 'just now',
  'serveur.autoriser.autreReseau':
    'The address this request came from differs from yours (this happens with a VPN, or after changing networks): if you didn’t start the sign-in yourself, refuse it.',
  'serveur.autoriser.origineInconnue': 'The server no longer knows where this request came from (it has restarted since). If you didn’t start the sign-in yourself, refuse it.',
  'serveur.autoriser.seulement':
    'Only authorize if you just started signing in from the Notak app and this code is the same. Without an answer from you nothing happens: the code expires after ten minutes.',
  'serveur.autoriser.autoriser': 'Authorize',
  'serveur.autoriser.refuser': 'Refuse',
  'serveur.autoriser.fait': 'Done: go back to the Notak app.',
  'serveur.autoriser.faitAide': 'It is signed in to your account. You can close this tab.',
  'serveur.autoriser.refusee': 'Request refused.',
  'serveur.autoriser.refuseeAide': 'The Notak app won’t be signed in. You can close this tab.',
  'serveur.autoriser.impossible': 'This request can’t be handled',
  'serveur.autoriser.relancer': 'Start the sign-in again in the Notak app: a new code will appear there.',
  'serveur.autoriser.dejaFait': 'This code has already been used.',
  'serveur.autoriser.saisieTitre': 'Which code does the app show?',
  'serveur.autoriser.saisieChamp': 'Code shown in the Notak app',
  'serveur.autoriser.continuer': 'Continue',
  'serveur.autoriser.codeMalForme': 'This code isn’t in the right format: eight letters and digits.',

  'serveur.compte.changerServeur': 'Change server…',
  'serveur.compte.toilesLocales': 'Boards on this computer',
  'serveur.compte.toilesLocales.detail': 'Just this time, no server or account',

  'serveur.maj.titre': 'Server update',
  'serveur.maj.disponible': 'Notak {version} is available (this server: {actuelle}).',
  'serveur.maj.copier': 'Copy the command',
  'serveur.maj.copiee': 'Copied: run it on the server',
  'serveur.maj.commande': 'Run this on the server, in the Notak folder (the one with compose.yaml):',
  'serveur.maj.copieEchec': 'Copying failed: copy the command by hand.',
  'serveur.maj.notes': 'Release notes',

  'serveur.attente.fichier.one': 'A Notak copy is waiting: sign in to import it to {hote}, or open it on this computer.',
  'serveur.attente.fichier.other': '{n} Notak copies are waiting: sign in to import them to {hote}, or open them on this computer.',
  'serveur.attente.confiee': 'A copy of your boards on this computer is waiting: sign in to import it to {hote}.',

  'serveur.ouverts.titre': '“{nom}”',
  'serveur.ouverts.titreConfiee': 'Import the boards on this computer to {hote}?',
  'serveur.ouverts.confiee':
    'A copy of your boards on this computer is ready. It will be added to your home on {hote} as a new board. Nothing is deleted on this computer: your boards stay there.',
  'serveur.ouverts.confieeNote':
    'If you don’t import it, it won’t be offered again. To make a new one, open “Where are my boards?” on the boards on this computer, then “Copy my boards to {hote}”.',
  'serveur.ouverts.fichier': 'A Notak copy ({taille}), opened from your computer. Importing it adds it to your home on {hote}.',
  'serveur.ouverts.ouvrirIciNote': '“Open on this computer” keeps it among the boards on this computer, without a server. Just this time: where Notak starts doesn’t change.',
  'serveur.ouverts.importerSur': 'Import to {hote}',
  'serveur.ouverts.importer': 'Import',
  'serveur.ouverts.ouvrirIci': 'Open on this computer',
  'serveur.ouverts.pasMaintenant': 'Don’t import',
  'serveur.ouverts.encours': 'Importing…',
  'serveur.ouverts.illisible': 'This copy couldn’t be read. Open it again from your computer.',
  'serveur.ouverts.abimee': 'This copy is damaged and can’t be opened. Try another backup.',
  'serveur.ouverts.tropGrosse': 'This copy is too large to open. Make a lighter one.',
}
