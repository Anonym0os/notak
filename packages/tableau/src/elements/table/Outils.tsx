import { useEffect, useState } from 'react'
import type { Element, FormatCellule, Id, Table, TypeCellule } from '../../coeur/tableau'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { type NomIcone, Icone } from '../../icones'
import { type Langue, langue, t } from '../../langue'
import { fermerMenus, useMenu } from '../../menuUnique'
import { lireHex } from '../note/couleurs'
import type { ContexteToile, PropsOutils } from '../types'
import {
  bornerPlages,
  cellulesPouvant,
  choisirType,
  droitsDe,
  insererAutourColonnes,
  insererAutourLignes,
  poserFormat,
} from './actions'
import { ouvrirEdition } from './edition'
import { demanderTitre, focaliser, poserEtat, useEtatTable } from './etat'
import { COULEURS_TEXTE, FOND_ENTETE, FONDS_CELLULE, SURLIGNAGES, alignementDe } from './formats'
import {
  COLONNES_MAX,
  LIGNES_MAX,
  type Plage,
  appliquerFormat,
  formatsDe,
  insererColonnes,
  insererLignes,
  nombreColonnes,
  normaliserPlage,
} from './grille'
import { entreesTable } from './menu'
import { modifierTable, modifierTables } from './modifier'

/**
 * Les outils de la barre de sélection pour une table. Des cellules choisies : le style du texte, le type, la couleur
 * de la cellule, une formule, l'alignement, + colonne, + ligne et « ••• » (le menu du clic droit). La table seule :
 * son titre, + ligne, + colonne. Tout ce qui touche des cellules s'applique à toutes les cellules de toutes les plages.
 */
export function OutilsTable({ elements, contexte }: PropsOutils<Table>) {
  const un = elements.length === 1 ? elements[0]! : null
  const etat = useEtatTable(un?.id ?? '')
  if (contexte.services.lectureSeule) return null
  // Les cellules choisies que l'historique ou un retrait ont laissées hors de la table ne comptent plus.
  const plages = un ? bornerPlages(etat.plages, un.contenu) : []
  if (un && plages.length > 0) return <OutilsCellules element={un} plages={plages} contexte={contexte} />
  return <OutilsElement elements={elements} contexte={contexte} />
}

/* ───────────── La table seule ───────────── */

function OutilsElement({ elements, contexte }: { elements: Element<Table>[]; contexte: ContexteToile }) {
  const ids = elements.map((e) => e.id)
  const avecTitre = elements.every((e) => e.contenu.avecTitre)
  const basculerTitre = () => {
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: { ...e.contenu, avecTitre: !avecTitre } })))
    if (!avecTitre && elements.length === 1) demanderTitre(elements[0]!.id)
  }
  return (
    <>
      <BoutonOutil icone="titre" titre={t('table.titre.titre')} libelle={t('table.titre')} actif={avecTitre} onClick={basculerTitre} />
      <BoutonOutil
        icone="ligneAjout"
        titre={t('table.ajouterLigne')}
        libelle={t('table.ligne')}
        flottant={<><Icone nom="ajouter" taille={14} /> {t('table.ligne')}</>}
        desactive={elements.some((e) => e.contenu.cellules.length >= LIGNES_MAX)}
        onClick={() => modifierTables(contexte, ids, (tab) => ({ table: insererLignes(tab, tab.cellules.length, 1) }))}
      />
      <BoutonOutil
        icone="colonneAjout"
        titre={t('table.ajouterColonne')}
        libelle={t('type.colonne')}
        flottant={<><Icone nom="ajouter" taille={14} /> {t('type.colonne')}</>}
        desactive={elements.some((e) => nombreColonnes(e.contenu.cellules) >= COLONNES_MAX)}
        onClick={() => modifierTables(contexte, ids, (tab, l) => ({ table: insererColonnes(tab, nombreColonnes(tab.cellules), 1, undefined, l) }))}
      />
    </>
  )
}

/* ───────────── Les cellules choisies ───────────── */

interface Cellules {
  id: Id
  contexte: ContexteToile
  table: Table
  plages: readonly Plage[]
  /** Le format de la première cellule choisie : c'est lui que les outils montrent. */
  format: FormatCellule | null
  /** Applique ce changement à toutes les cellules choisies, d'un pas ; `garder` laisse le menu ouvert. */
  appliquer(f: (tab: Table) => Table, garder?: boolean): void
}

function OutilsCellules({ element, plages, contexte }: { element: Element<Table>; plages: readonly Plage[]; contexte: ContexteToile }) {
  const { id } = element
  const table = element.contenu
  const premiere = normaliserPlage(plages[0]!)
  const format = formatsDe(table)[premiere.l1]?.[premiere.c1] ?? null
  const appliquer = (f: (tab: Table) => Table, garder = false) => {
    modifierTable(contexte, id, (tab) => ({ table: f(tab) }))
    if (!garder) {
      fermerMenus()
      focaliser(id)
    }
  }
  const c: Cellules = { id, contexte, table, plages, format, appliquer }
  const droits = droitsDe(table, plages)
  const cellulesChoisies = droits.lignes * droits.colonnes
  const unique = plages.length === 1 && cellulesChoisies === 1
  const formule = () => {
    const brut = table.cellules[premiere.l1]?.[premiere.c1] ?? ''
    fermerMenus()
    ouvrirEdition(contexte, id, premiere.l1, premiere.c1, { texte: brut.startsWith('=') ? brut : '=' })
  }
  return (
    <>
      <OutilTexte c={c} />
      <OutilType c={c} />
      <OutilFond c={c} />
      <BoutonOutil icone="formule" titre={t('table.formule.titre')} libelle={t('table.formule')} desactive={!unique} onClick={formule} />
      <OutilAlignement c={c} />
      <BoutonOutil
        icone="colonneAjout"
        titre={t('table.ajouterColonne')}
        libelle={t('type.colonne')}
        flottant={<><Icone nom="ajouter" taille={14} /> {t('type.colonne')}</>}
        desactive={!droits.insererColonnes}
        onClick={() => {
          modifierTable(contexte, id, (tab, l) => insererAutourColonnes(tab, l, plages, 'droite'))
          focaliser(id)
        }}
      />
      <BoutonOutil
        icone="ligneAjout"
        titre={t('table.ajouterLigneSous')}
        libelle={t('table.ligne')}
        flottant={<><Icone nom="ajouter" taille={14} /> {t('table.ligne')}</>}
        desactive={!droits.insererLignes}
        onClick={() => {
          modifierTable(contexte, id, (tab, l) => insererAutourLignes(tab, l, plages, 'dessous'))
          focaliser(id)
        }}
      />
      <OutilPlus c={c} />
    </>
  )
}

/** Une pastille de couleur dans une palette. */
function Pastille({ valeur, nom, actif, survol, choisir }: { valeur: string; nom: string; actif: boolean; survol?: { entrer(): void; sortir(): void }; choisir(): void }) {
  return (
    <button
      type="button"
      role="menuitem"
      title={nom}
      aria-label={nom}
      aria-pressed={actif}
      style={{ background: valeur }}
      onClick={choisir}
      onPointerEnter={survol?.entrer}
      onPointerLeave={survol?.sortir}
    />
  )
}

const nuance = (nom: string) => t(`table.nuance.${nom}`)

/* ── Style de texte : couleur et surlignage ── */

function OutilTexte({ c }: { c: Cellules }) {
  const menu = useMenu()
  const { format } = c
  return (
    <OutilAvecMenu menu={menu} icone="texte" titre={t('table.texte.titre')} libelle={t('table.texte')} pastille={format?.surligne ?? format?.couleur}>
      <div className="notak-note-palette" role="menu">
        <span className="notak-decor-titre">{t('table.texte.couleur')}</span>
        <div className="notak-note-pastilles">
          <button type="button" role="menuitem" className="notak-pastille-aucune" title={t('table.nuance.defaut')} aria-label={t('table.nuance.defaut')} aria-pressed={!format?.couleur} onClick={() => c.appliquer((tab) => poserFormat(tab, c.plages, { couleur: undefined }))} />
          {COULEURS_TEXTE.map((x) => (
            <Pastille key={x.nom} valeur={x.valeur} nom={nuance(x.nom)} actif={format?.couleur === x.valeur} choisir={() => c.appliquer((tab) => poserFormat(tab, c.plages, { couleur: x.valeur, surligne: undefined }))} />
          ))}
        </div>
        <span className="notak-decor-titre">{t('table.texte.surlignage')}</span>
        <div className="notak-note-pastilles">
          <button type="button" role="menuitem" className="notak-pastille-aucune" title={t('table.nuance.aucune')} aria-label={t('table.nuance.aucune')} aria-pressed={!format?.surligne} onClick={() => c.appliquer((tab) => poserFormat(tab, c.plages, { surligne: undefined }))} />
          {SURLIGNAGES.map((x) => (
            <Pastille key={x.nom} valeur={x.valeur} nom={nuance(x.nom)} actif={format?.surligne === x.valeur} choisir={() => c.appliquer((tab) => poserFormat(tab, c.plages, { surligne: x.valeur, couleur: undefined }))} />
          ))}
        </div>
      </div>
    </OutilAvecMenu>
  )
}

/* ── Type de cellule ── */

const TYPES: readonly (TypeCellule | undefined)[] = [undefined, 'nombre', 'monnaie', 'pourcent', 'texte', 'date', 'case']
const NOMS_TYPE: Record<TypeCellule | 'auto', string> = {
  auto: 'table.type.auto',
  nombre: 'table.type.nombre',
  monnaie: 'table.type.monnaie',
  pourcent: 'table.type.pourcent',
  texte: 'table.type.texte',
  date: 'table.type.date',
  case: 'table.type.case',
}
const DEVISES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'SEK', 'CAD', 'AUD']
const AFFICHAGES_DEVISE = ['symboleEtroit', 'symbole', 'code', 'nom'] as const
const FORMATS_DATE = ['aucun', 'long', 'court', 'chiffres', 'chiffresCourts', 'tirets', 'jour'] as const
const FORMATS_HEURE = ['aucune', '12h', '12hs', '24h', '24hs'] as const

const nomDevise = (code: string, lg: Langue) => {
  try {
    return `${code} · ${new Intl.DisplayNames(lg === 'fr' ? 'fr-FR' : 'en-US', { type: 'currency' }).of(code) ?? code}`
  } catch {
    return code
  }
}

function OutilType({ c }: { c: Cellules }) {
  const menu = useMenu()
  const lg = langue()
  const actif = c.format?.type
  const choisir = (type: TypeCellule | undefined) => c.appliquer((tab) => choisirType(tab, c.plages, type, lg), true)
  /** Une option du type actif : elle ne touche que les cellules qui ont ce type. */
  const option = (patch: Partial<FormatCellule>) =>
    c.appliquer((tab) => appliquerFormat(tab, c.plages, (f) => (f?.type === actif ? ({ ...f, ...patch } as FormatCellule) : f)), true)
  const f = c.format ?? {}
  const decimales = (
    <label className="notak-table-option">
      <span>{t('table.opt.decimales')}</span>
      <select value={f.decimales === undefined ? (actif === 'nombre' ? 'auto' : '2') : String(f.decimales)} onChange={(e) => option({ decimales: e.target.value === 'auto' ? undefined : Number(e.target.value) })}>
        {actif === 'nombre' && <option value="auto">{t('table.opt.decimalesAuto')}</option>}
        {Array.from({ length: 21 }, (_, n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )
  const interrupteur = (cle: 'sansMilliers' | 'comptable' | 'heureEntreParentheses', libelle: string, inverse = false) => (
    <label className="notak-table-option notak-table-option-coche">
      <input type="checkbox" checked={inverse ? !f[cle] : !!f[cle]} onChange={(e) => option({ [cle]: inverse ? !e.target.checked || undefined : e.target.checked || undefined })} />
      <span>{libelle}</span>
    </label>
  )
  const date = f.date ?? 'chiffres'
  const heure = f.heure ?? 'aucune'
  return (
    <OutilAvecMenu menu={menu} icone="diese" titre={t('table.type.titre')} libelle={t('table.type')}>
      <div className="notak-note-palette notak-table-menu-type" role="menu">
        {TYPES.map((type) => {
          const peut = cellulesPouvant(c.table, c.plages, type, lg).length > 0
          const courant = type === actif
          return (
            <button key={type ?? 'auto'} type="button" role="menuitemradio" aria-checked={courant} className="notak-menu-rang" disabled={!peut} onClick={() => choisir(type)}>
              <span className="notak-menu-rang-texte">{t(NOMS_TYPE[type ?? 'auto'])}</span>
              {courant && <Icone nom="coche" taille={14} />}
            </button>
          )
        })}
        {(actif === 'nombre' || actif === 'monnaie' || actif === 'pourcent') && (
          <div className="notak-table-options">
            {decimales}
            {interrupteur('sansMilliers', t('table.opt.milliers'), true)}
            {actif === 'monnaie' && (
              <>
                {interrupteur('comptable', t('table.opt.comptable'))}
                <label className="notak-table-option">
                  <span>{t('table.opt.devise')}</span>
                  <select value={f.devise ?? 'EUR'} onChange={(e) => option({ devise: e.target.value })}>
                    {(DEVISES.includes(f.devise ?? 'EUR') ? DEVISES : [...DEVISES, f.devise!]).map((d) => (
                      <option key={d} value={d}>
                        {nomDevise(d, lg)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="notak-table-option">
                  <span>{t('table.opt.affichageDevise')}</span>
                  <select value={f.affichageDevise ?? 'symboleEtroit'} onChange={(e) => option({ affichageDevise: e.target.value as (typeof AFFICHAGES_DEVISE)[number] })}>
                    {AFFICHAGES_DEVISE.map((a) => (
                      <option key={a} value={a}>
                        {t(`table.opt.${a}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        )}
        {actif === 'date' && (
          <div className="notak-table-options">
            <label className="notak-table-option">
              <span>{t('table.opt.date')}</span>
              <select value={date} onChange={(e) => option({ date: e.target.value as (typeof FORMATS_DATE)[number], ...(e.target.value === 'aucun' && heure === 'aucune' ? { heure: '24h' as const } : {}) })}>
                {FORMATS_DATE.map((d) => (
                  <option key={d} value={d}>
                    {t(`table.date.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="notak-table-option">
              <span>{t('table.opt.heure')}</span>
              <select value={heure} onChange={(e) => option({ heure: e.target.value as (typeof FORMATS_HEURE)[number], ...(e.target.value === 'aucune' && date === 'aucun' ? { date: 'chiffres' as const } : {}) })}>
                {FORMATS_HEURE.map((h) => (
                  <option key={h} value={h}>
                    {t(`table.heure.${h}`)}
                  </option>
                ))}
              </select>
            </label>
            {date !== 'aucun' && heure !== 'aucune' && interrupteur('heureEntreParentheses', t('table.opt.heureParentheses'))}
          </div>
        )}
      </div>
    </OutilAvecMenu>
  )
}

/* ── Couleur de la cellule ── */

function OutilFond({ c }: { c: Cellules }) {
  const menu = useMenu()
  const [saisie, setSaisie] = useState(c.format?.fond?.startsWith('#') ? c.format.fond : '')
  const hex = lireHex(saisie)
  const apercu = (v: string | null | undefined) => poserEtat(c.id, { apercuFond: v })
  // Le menu qui se ferme ne laisse pas un aperçu derrière lui.
  useEffect(() => () => apercu(undefined), [])
  const poser = (v: string | undefined) => {
    apercu(undefined)
    c.appliquer((tab) => poserFormat(tab, c.plages, { fond: v }))
  }
  const fond = c.format?.fond
  return (
    <OutilAvecMenu menu={menu} icone="palette" titre={t('table.fond.titre')} libelle={t('table.fond')} pastille={fond === 'entete' ? FOND_ENTETE.clair : fond}>
      <div className="notak-note-palette" role="menu">
        <div className="notak-note-pastilles">
          <button
            type="button"
            role="menuitem"
            className="notak-pastille-aucune"
            title={t('table.nuance.aucune')}
            aria-label={t('table.nuance.aucune')}
            aria-pressed={!fond}
            onClick={() => poser(undefined)}
            onPointerEnter={() => apercu(null)}
            onPointerLeave={() => apercu(undefined)}
          />
          {FONDS_CELLULE.map((x) => (
            <Pastille
              key={x.nom}
              valeur={x.valeur === 'entete' ? FOND_ENTETE.clair : x.valeur}
              nom={nuance(x.nom)}
              actif={fond === x.valeur}
              choisir={() => poser(x.valeur)}
              survol={{ entrer: () => apercu(x.valeur), sortir: () => apercu(undefined) }}
            />
          ))}
        </div>
        <input
          className="notak-note-hex"
          value={saisie}
          placeholder="#a1b2c3"
          aria-label={t('table.fond.libre')}
          aria-invalid={saisie !== '' && !hex}
          onChange={(e) => {
            setSaisie(e.target.value)
            const v = lireHex(e.target.value)
            apercu(v ?? undefined)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && hex) poser(hex)
          }}
        />
      </div>
    </OutilAvecMenu>
  )
}

/* ── Alignement ── */

function OutilAlignement({ c }: { c: Cellules }) {
  const menu = useMenu()
  const brut = c.table.cellules[normaliserPlage(c.plages[0]!).l1]?.[normaliserPlage(c.plages[0]!).c1] ?? ''
  const h = alignementDe(c.format, brut.startsWith('='))
  const v = c.format?.vertical ?? 'haut'
  const icone: Record<typeof h, NomIcone> = { gauche: 'alignerGauche', centre: 'alignerCentreH', droite: 'alignerDroite' }
  const horizontaux = ['gauche', 'centre', 'droite'] as const
  const verticaux = [['haut', 'alignerHaut'], ['milieu', 'alignerCentreV'], ['bas', 'alignerBas']] as const
  return (
    <OutilAvecMenu menu={menu} icone={icone[h]} titre={t('table.alignement.titre')} libelle={t('table.alignement')}>
      <div className="notak-note-palette notak-table-alignements" role="menu">
        <div>
          {horizontaux.map((x) => (
            <button key={x} type="button" role="menuitemradio" aria-checked={h === x} aria-pressed={h === x} title={t(`table.align.${x}`)} aria-label={t(`table.align.${x}`)} onClick={() => c.appliquer((tab) => poserFormat(tab, c.plages, { alignement: x }))}>
              <Icone nom={icone[x]} />
            </button>
          ))}
        </div>
        <div>
          {verticaux.map(([x, ic]) => (
            <button key={x} type="button" role="menuitemradio" aria-checked={v === x} aria-pressed={v === x} title={t(`table.align.${x}`)} aria-label={t(`table.align.${x}`)} onClick={() => c.appliquer((tab) => poserFormat(tab, c.plages, { vertical: x }))}>
              <Icone nom={ic} />
            </button>
          ))}
        </div>
      </div>
    </OutilAvecMenu>
  )
}

/* ── « ••• » : le menu du clic droit, sans le presse-papiers ── */

function OutilPlus({ c }: { c: Cellules }) {
  const menu = useMenu()
  // Le menu se relit à chaque rendu : la sélection a pu changer.
  const entrees = menu[0] ? entreesTable(c.contexte, c.id, false) : []
  const propres = entrees.filter((e, i, tout) => e !== null || (i > 0 && i < tout.length - 1 && tout[i - 1] !== null))
  return (
    <OutilAvecMenu menu={menu} icone="plus" titre={t('table.plus.titre')} libelle={t('table.plus')}>
      <div className="notak-note-palette notak-table-menu-plus" role="menu">
        {propres.map((e, i) =>
          e === null ? (
            <hr key={`s${i}`} />
          ) : (
            <button
              key={e.libelle}
              type="button"
              role="menuitem"
              className="notak-menu-rang"
              disabled={e.desactive}
              onClick={() => {
                menu[1](false)
                e.faire()
              }}
            >
              <span className="notak-menu-rang-texte">{e.libelle}</span>
              {e.raccourci && <kbd>{e.raccourci}</kbd>}
            </button>
          ),
        )}
      </div>
    </OutilAvecMenu>
  )
}

