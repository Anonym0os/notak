import { EditorContent, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentTexte, NoeudTexte } from '../../coeur/tableau'
import { BarreTexte } from '../note/Barre'
import { EXTENSIONS_NOTE } from '../note/extensions'
import { Surcouche } from '../surcouche'
import type { PropsOutils, PropsRendu } from '../types'
import { compterMots, mesure, premiersBlocs } from './texte'
import { t } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'

/** Le texte tel qu'une note le dessine : mêmes extensions, en lecture seule. */
const Lu = memo(function Lu({ texte }: { texte: NoeudTexte }) {
  const rendu = useMemo(() => renderToReactElement({ content: texte, extensions: EXTENSIONS_NOTE }), [texte])
  return <div className="notak-texte">{rendu}</div>
})

export function RenduDocument({ element, enEdition, contexte, brouillon }: PropsRendu<DocumentTexte>) {
  const c = element.contenu
  // Qui ne peut pas écrire peut lire en grand.
  const [enLecture, setEnLecture] = useState(false)
  const lectureSeule = !!contexte.services.lectureSeule
  const apercu = useMemo(() => premiersBlocs(c.texte), [c.texte])
  return (
    <div className="notak-document" onDoubleClick={lectureSeule ? () => setEnLecture(true) : undefined}>
      <div className="notak-document-titre" data-vide={c.titre.trim() ? undefined : ''}>
        {c.titre.trim() || t('commun.sansTitre')}
      </div>
      {compterMots(c.texte) > 0 && (
        <div className="notak-document-apercu">
          <Lu texte={apercu} />
        </div>
      )}
      <div className="notak-document-pied">{compterMots(c.texte) > 0 ? mesure(c.texte) : lectureSeule ? t('document.vide') : t('document.ecrire')}</div>
      {enEdition && <Grand contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />}
      {enLecture && <Lecture contenu={c} fermer={() => setEnLecture(false)} />}
    </div>
  )
}

function Lecture({ contenu, fermer }: { contenu: DocumentTexte; fermer(): void }) {
  return (
    <Surcouche etiquette={contenu.titre || t('type.document')} className="notak-document-fond" fermer={fermer}>
      <article className="notak-document-feuille">
        <h2 className="notak-document-grand-titre">{contenu.titre.trim() || t('commun.sansTitre')}</h2>
        <div className="notak-document-corps">
          <Lu texte={contenu.texte} />
        </div>
        <footer className="notak-document-bas">
          <span>{mesure(contenu.texte)}</span>
          <button type="button" onClick={fermer}>
            {t('commun.fermer')}
          </button>
        </footer>
      </article>
    </Surcouche>
  )
}

/**
 * Le document ouvert en grand : le titre, la barre de mise en forme de la note et le texte, sur une feuille
 * au-dessus de la toile. Ce qu'on tape part au brouillon ; Échap ou « Terminer » referment.
 */
function Grand({ contenu, ecrire, finir }: { contenu: DocumentTexte; ecrire(c: DocumentTexte): void; finir(): void }) {
  const [titre, setTitre] = useState(contenu.titre)
  const [lien, setLien] = useState<string | null>(null)
  // Le titre et le texte changent chacun de leur côté : le brouillon porte toujours les deux derniers.
  const dernier = useRef({ titre: contenu.titre, texte: contenu.texte })
  const champTitre = useRef<HTMLInputElement>(null)
  const poser = (suite: Partial<typeof dernier.current>) => {
    dernier.current = { ...dernier.current, ...suite }
    ecrire({ ...contenu, ...dernier.current })
  }
  const editeur = useEditor({
    extensions: EXTENSIONS_NOTE,
    content: contenu.texte,
    editorProps: { attributes: { class: 'notak-texte', 'aria-label': t('document.texte') } },
    onUpdate: ({ editor }) => poser({ texte: editor.getJSON() as NoeudTexte }),
  })
  const [mots, setMots] = useState(() => mesure(contenu.texte))
  useEffect(() => {
    if (!editeur) return
    const maj = () => setMots(mesure(editeur.getJSON() as NoeudTexte))
    editeur.on('update', maj)
    return () => void editeur.off('update', maj)
  }, [editeur])
  // Un document neuf s'ouvre sur son titre ; un document écrit, au bout de son texte.
  useEffect(() => {
    if (!editeur || editeur.isDestroyed) return
    if (!contenu.titre.trim() && compterMots(contenu.texte) === 0) champTitre.current?.focus()
    else editeur.commands.focus('end')
  }, [editeur])

  return (
    <Surcouche etiquette={t('type.document')} className="notak-document-fond" fermer={finir}>
      <div className="notak-document-feuille">
        <input
          ref={champTitre}
          className="notak-document-grand-titre"
          type="text"
          aria-label={t('document.titre')}
          placeholder={t('commun.sansTitre')}
          maxLength={300}
          value={titre}
          onChange={(e) => {
            setTitre(e.target.value)
            poser({ titre: e.target.value })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              editeur?.commands.focus('start')
            }
          }}
        />
        <div className="notak-document-barre">{editeur && <BarreTexte editor={editeur} lien={lien} surLien={setLien} />}</div>
        <div className="notak-document-corps">
          <EditorContent editor={editeur} />
        </div>
        <footer className="notak-document-bas">
          <span>{mots}</span>
          <button type="button" onClick={finir}>
            {t('commun.terminer')}
          </button>
        </footer>
      </div>
    </Surcouche>
  )
}

export function OutilsDocument({ elements, contexte }: PropsOutils<DocumentTexte>) {
  if (elements.length !== 1) return null
  return (
    <BoutonOutil icone="ouvrir" secondaire titre={t('document.ouvrirGrand')} libelle={t('commun.ouvrir')} onClick={() => contexte.commencerEdition(elements[0]!.id)} />
  )
}
