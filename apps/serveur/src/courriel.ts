import { createTransport } from 'nodemailer'

// Le serveur n'envoie de courriel que si on lui a donné un SMTP (`NOTAK_SMTP_URL`). Sans lui, ce qui devait partir
// (un lien de réinitialisation, une vérification d'adresse) est écrit dans le journal du serveur : c'est à
// l'administrateur de le transmettre. On ne le montre jamais à celui qui l'a demandé, qui pourrait n'être pas le
// titulaire de l'adresse.

export interface Courriel {
  a: string
  sujet: string
  texte: string
}

export interface Courrier {
  /** Vrai si les courriels partent vraiment ; faux s'ils ne vont qu'au journal. */
  readonly actif: boolean
  envoyer(c: Courriel): Promise<void>
}

export function creerCourrier(smtp: string | undefined, expediteur: string, journal: (ligne: string) => void = console.log): Courrier {
  if (!smtp) {
    return {
      actif: false,
      async envoyer(c) {
        journal(`Notak : courriel non envoyé (pas de NOTAK_SMTP_URL) à ${c.a} — ${c.sujet}\n${c.texte}`)
      },
    }
  }
  const transport = createTransport(smtp)
  return {
    actif: true,
    async envoyer(c) {
      await transport.sendMail({ from: expediteur, to: c.a, subject: c.sujet, text: c.texte })
    },
  }
}
