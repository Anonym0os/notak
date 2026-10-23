import { useEffect, useRef } from 'react'
import type { Element, FormatCellule, Id, Table, TypeCellule } from '../../coeur/tableau'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { type NomIcone, Icone } from '../../icones'
import { langue, t } from '../../langue'
import { Raccourci } from '../../Menus'
import { fermerMenus, useMenu } from '../../menuUnique'
import type { ContexteToile, PropsOutils } from '../types'
import {
  bornerPlages,
  cellulesDe,
  cellulesPouvant,
  choisirType,
  droitsDe,
  insererAutourColonnes,
  insererAutourLignes,
  poserFormat,
} from './actions'
import { ouvrirEdition } from './edition'
import { demanderTitre, focaliser, poserEtat, useEtatTable } from './etat'
import { COULEURS_TEXTE, FOND_ENTETE, FONDS_CELLULE, SURLIGNAGES, afficher, alignementDe, couleurSurlignage, couleurTexte, localeDe, regional } from './formats'
import { dateVersSerie } from './formules'
import { type Plage, appliquerFormat, formatsDe, normaliserPlage } from './grille'
import { entreesTable } from './menu'
import { modifierTable } from './modifier'

/**
 * Les outils de la barre de sélection pour une table. Des cellules choisies : le style du texte, le type, la couleur
 * de la cellule, une formule, l'alignement, + colonne, + ligne et « ••• » (le menu du clic droit). La table seule :
 * son titre. Tout ce qui touche des cellules s'applique à toutes les cellules de toutes les plages ; un outil montre
 * ce qu'elles ont en commun, rien quand elles diffèrent. Les menus restent ouverts après un choix.
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
  const avecTitre = elements.every((e) => e.contenu.avecTitre)
  const basculerTitre = () => {
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: { ...e.contenu, avecTitre: !avecTitre } })))
    if (!avecTitre && elements.length === 1) demanderTitre(elements[0]!.id)
  }
  return (
    <>
      <BoutonOutil icone="titre" titre={t('table.titre.titre')} libelle={t('table.titre')} actif={avecTitre} onClick={basculerTitre} />
    </>
  )
}

/* ───────────── Les cellules choisies ───────────── */

/** Ce que les cellules choisies ont en commun : une clé qui diffère d'une cellule à l'autre reste vide. */
export function formatCommun(table: Table, plages: readonly Plage[]): { format: FormatCellule; mixte: ReadonlySet<keyof FormatCellule> } {
  const formats = formatsDe(table)
  const tous = cellulesDe(plages, table).map(([l, c]) => formats[l]?.[c] ?? null)
  const cles = new Set(tous.flatMap((f) => (f ? (Object.keys(f) as (keyof FormatCellule)[]) : [])))
  const format: Record<string, unknown> = {}
  const mixte = new Set<keyof FormatCellule>()
  for (const k of cles) {
    const v = tous[0]?.[k]
    if (tous.every((f) => f?.[k] === v)) {
      if (v !== undefined) format[k] = v
    } else mixte.add(k)
  }
  return { format: format as FormatCellule, mixte }
}

interface Cellules {
  id: Id
  contexte: ContexteToile
  table: Table
  plages: readonly Plage[]
  /** Ce que les cellules choisies ont en commun : c'est lui que les outils montrent. */
  format: FormatCellule
  mixte: ReadonlySet<keyof FormatCellule>
  /** Applique ce changement à toutes les cellules choisies, d'un pas ; le menu reste ouvert. */
  appliquer(f: (tab: Table) => Table): void
}

function OutilsCellules({ element, plages, contexte }: { element: Element<Table>; plages: readonly Plage[]; contexte: ContexteToile }) {
  const { id } = element
  const table = element.contenu
  const premiere = normaliserPlage(plages[0]!)
  const { format, mixte } = formatCommun(table, plages)
  const appliquer = (f: (tab: Table) => Table) => modifierTable(contexte, id, (tab) => ({ table: f(tab) }))
  const c: Cellules = { id, contexte, table, plages, format, mixte, appliquer }
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
        titre={`${t('table.ajouterColonne')} (⌥→)`}
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
        titre={`${t('table.ajouterLigneSous')} (⌥↓)`}
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

const nuance = (nom: string) => t(`table.nuance.${nom}`)
const enCss = (nom: string) => nom.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

/* ── Style de texte : couleur et surlignage ── */

function OutilTexte({ c }: { c: Cellules }) {
  const menu = useMenu()
  const { format, mixte } = c
  const couleur = mixte.has('couleur') ? null : (format.couleur ?? '')
  const surligne = mixte.has('surligne') ? null : (format.surligne ?? '')
  // Re-choisir la couleur déjà posée l'ôte ; « défaut » ôte couleur et surlignage.
  const poser = (patch: { couleur?: string; surligne?: string }) => c.appliquer((tab) => poserFormat(tab, c.plages, { couleur: undefined, surligne: undefined, ...patch }))
  const pastille = format.surligne ? couleurSurlignage(format.surligne) : format.couleur ? couleurTexte(format.couleur) : undefined
  return (
    <OutilAvecMenu menu={menu} icone="texte" titre={t('table.texte.titre')} libelle={t('table.texte')} pastille={pastille}>
      <div className="notak-note-palette notak-table-palette-texte" role="menu">
        <span className="notak-decor-titre">{t('table.texte.couleur')}</span>
        <div className="notak-note-pastilles">
          <button type="button" role="menuitemradio" data-vide title={nuance('defaut')} aria-label={nuance('defaut')} aria-checked={couleur === '' && surligne === ''} onClick={() => poser({})}>
            A
          </button>
          {COULEURS_TEXTE.map((x) => (
            <button key={x.nom} type="button" role="menuitemradio" data-texte={x.nom} title={nuance(x.nom)} aria-label={nuance(x.nom)} aria-checked={couleur === x.nom} onClick={() => poser(couleur === x.nom ? {} : { couleur: x.nom })}>
              A
            </button>
          ))}
        </div>
        <span className="notak-decor-titre">{t('table.texte.surlignage')}</span>
        <div className="notak-note-pastilles">
          {SURLIGNAGES.map((x) => (
            <button key={x.nom} type="button" role="menuitemradio" data-surligne={enCss(x.nom)} title={nuance(x.nom)} aria-label={nuance(x.nom)} aria-checked={surligne === x.nom} onClick={() => poser(surligne === x.nom ? {} : { surligne: x.nom })}>
              A
            </button>
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
const AVEC_OPTIONS = new Set<TypeCellule | undefined>(['nombre', 'monnaie', 'pourcent', 'date'])

/** Le signe d'un type, sur sa ligne du menu et dans la tuile. */
function SigneType({ type }: { type: TypeCellule | undefined }) {
  if (type === 'date') return <Icone nom="calendrier" taille={18} />
  if (type === 'case') return <Icone nom="coche" taille={18} />
  const signes: Partial<Record<TypeCellule, string>> = { nombre: '123', monnaie: '$', pourcent: '%', texte: 'AB' }
  const signe = (type && signes[type]) ?? 'A'
  return <span className="notak-table-signe" data-auto={!type || undefined}>{signe}</span>
}

const AFFICHAGES_DEVISE = ['symboleEtroit', 'symbole', 'code', 'nom'] as const
const MODES_DEVISE = { symboleEtroit: 'narrowSymbol', symbole: 'symbol', code: 'code', nom: 'name' } as const
const FORMATS_DATE = ['aucun', 'long', 'court', 'chiffres', 'chiffresCourts', 'tirets', 'jour'] as const
const FORMATS_HEURE = ['aucune', '12hs', '12h', '24hs', '24h'] as const
/** Le 29 février 2016 à 13:24:56 : la date d'exemple des listes de formats. */
const EXEMPLE = dateVersSerie(new Date(2016, 1, 29)) + (13 * 3600 + 24 * 60 + 56) / 86400

/** Toutes les devises que connaît le navigateur, par nom, « Nom (CODE) ». */
const devises = (() => {
  let cache: { code: string; nom: string }[] | null = null
  return (): { code: string; nom: string }[] => {
    if (cache) return cache
    const codes = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['EUR', 'USD', 'GBP', 'JPY', 'CHF']
    let noms: Intl.DisplayNames | null = null
    try {
      noms = new Intl.DisplayNames(langue() === 'fr' ? 'fr-FR' : 'en-US', { type: 'currency' })
    } catch {
      noms = null
    }
    const liste = codes.map((code) => ({ code, nom: noms?.of(code) ?? code }))
    liste.sort((a, b) => a.nom.localeCompare(b.nom))
    cache = liste
    return liste
  }
})()

function OutilType({ c }: { c: Cellules }) {
  const menu = useMenu()
  const lg = regional()
  const mixteType = c.mixte.has('type')
  const actif = mixteType ? null : c.format.type
  const choisir = (type: TypeCellule | undefined) => c.appliquer((tab) => choisirType(tab, c.plages, type, lg))
  /** Une option du type actif : elle ne touche que les cellules qui ont ce type. */
  const option = (patch: Partial<FormatCellule>) =>
    c.appliquer((tab) => appliquerFormat(tab, c.plages, (f) => (f?.type === actif ? ({ ...f, ...patch } as FormatCellule) : f)))
  const f = c.format
  const rang = TYPES.indexOf(actif ?? undefined)
  return (
    <OutilAvecMenu menu={menu} icone="diese" titre={t('table.type.titre')} libelle={t('table.type')}>
      <div className="notak-note-palette notak-table-menu-type" role="menu">
        {TYPES.map((type) => {
          const peut = cellulesPouvant(c.table, c.plages, type, lg).length > 0
          const courant = actif !== null && type === actif
          return (
            <button key={type ?? 'auto'} type="button" role="menuitemradio" aria-checked={courant} className="notak-menu-rang" disabled={!peut} onClick={() => choisir(type)}>
              <span className="notak-table-type-signe">
                <SigneType type={type} />
              </span>
              <span className="notak-menu-rang-texte">{t(NOMS_TYPE[type ?? 'auto'])}</span>
              {courant ? <Icone nom="coche" taille={14} /> : AVEC_OPTIONS.has(type) ? <Icone nom="chevronDroite" taille={14} /> : null}
            </button>
          )
        })}
        {actif !== null && AVEC_OPTIONS.has(actif) && (
          <div className="notak-table-format" role="group" aria-label={t(NOMS_TYPE[actif!])} style={{ top: 4 + rang * 40 }}>
            {actif === 'date' ? <OptionsDate f={f} lg={lg} option={option} /> : <OptionsNombre type={actif!} f={f} lg={lg} option={option} />}
          </div>
        )}
      </div>
    </OutilAvecMenu>
  )
}

type Option = (patch: Partial<FormatCellule>) => void

function OptionsNombre({ type, f, lg, option }: { type: TypeCellule; f: FormatCellule; lg: string; option: Option }) {
  const defaut = type === 'nombre' ? undefined : 2
  const dec = f.decimales ?? defaut
  const coche = (cle: 'sansMilliers' | 'comptable', libelle: string, inverse = false) => (
    <label className="notak-table-coche">
      <input type="checkbox" checked={inverse ? !f[cle] : !!f[cle]} onChange={(e) => option({ [cle]: inverse ? !e.target.checked || undefined : e.target.checked || undefined })} />
      <span>{libelle}</span>
    </label>
  )
  const devise = f.devise ?? 'EUR'
  const liste = devises()
  const rendus = AFFICHAGES_DEVISE.map((a) => {
    try {
      return { a, texte: new Intl.NumberFormat(localeDe(lg), { style: 'currency', currency: devise, currencyDisplay: MODES_DEVISE[a] }).format(12345) }
    } catch {
      return { a, texte: t(`table.opt.${a}`) }
    }
  }).filter((r, i, tous) => tous.findIndex((x) => x.texte === r.texte) === i)
  return (
    <>
      <span className="notak-table-format-etiquette">{t('table.opt.decimales')}</span>
      <div className="notak-table-format-controles">
        <input
          type="number"
          className="notak-table-decimales"
          min={0}
          max={20}
          step={1}
          placeholder={t('table.opt.decimalesAuto')}
          aria-label={t('table.opt.decimales')}
          value={dec === undefined || dec === 'auto' ? '' : String(dec)}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value
            option({ decimales: v === '' ? (type === 'nombre' ? undefined : 'auto') : Math.min(20, Math.max(0, Math.trunc(Number(v)))) })
          }}
        />
        {coche('sansMilliers', t('table.opt.milliers'), true)}
        {type === 'monnaie' && coche('comptable', t('table.opt.comptable'))}
      </div>
      {type === 'monnaie' && (
        <>
          <span className="notak-table-format-etiquette">{t('table.opt.devise')}</span>
          <div className="notak-table-format-controles">
            <select aria-label={t('table.opt.devise')} value={devise} onChange={(e) => option({ devise: e.target.value })}>
              {(liste.some((d) => d.code === devise) ? liste : [...liste, { code: devise, nom: devise }]).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.nom === d.code ? d.code : `${d.nom} (${d.code})`}
                </option>
              ))}
            </select>
            <select aria-label={t('table.opt.affichageDevise')} value={rendus.some((r) => r.a === (f.affichageDevise ?? 'symboleEtroit')) ? (f.affichageDevise ?? 'symboleEtroit') : rendus[0]!.a} onChange={(e) => option({ affichageDevise: e.target.value as (typeof AFFICHAGES_DEVISE)[number] })}>
              {rendus.map((r) => (
                <option key={r.a} value={r.a}>
                  {r.texte}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </>
  )
}

function OptionsDate({ f, lg, option }: { f: FormatCellule; lg: string; option: Option }) {
  const date = f.date ?? 'chiffres'
  const heure = f.heure ?? 'aucune'
  const exemple = (patch: Partial<FormatCellule>) => afficher(String(EXEMPLE), { type: 'date', date: 'aucun', heure: 'aucune', ...patch }, lg)
  return (
    <>
      <span className="notak-table-format-etiquette">{t('table.opt.date')}</span>
      <div className="notak-table-format-controles">
        <select aria-label={t('table.opt.date')} value={date} onChange={(e) => option({ date: e.target.value as (typeof FORMATS_DATE)[number] })}>
          {FORMATS_DATE.map((d) => (
            // Jamais ni date ni heure : « aucune » se grise quand l'autre l'est déjà.
            <option key={d} value={d} disabled={d === 'aucun' && heure === 'aucune'}>
              {d === 'aucun' ? t('table.date.aucun') : exemple({ date: d })}
            </option>
          ))}
        </select>
      </div>
      <span className="notak-table-format-etiquette">{t('table.opt.heure')}</span>
      <div className="notak-table-format-controles">
        <select aria-label={t('table.opt.heure')} value={heure} onChange={(e) => option({ heure: e.target.value as (typeof FORMATS_HEURE)[number] })}>
          {FORMATS_HEURE.map((h) => (
            <option key={h} value={h} disabled={h === 'aucune' && date === 'aucun'}>
              {h === 'aucune' ? t('table.heure.aucune') : exemple({ heure: h })}
            </option>
          ))}
        </select>
        {heure !== 'aucune' && (
          <label className="notak-table-coche">
            <input type="checkbox" checked={!!f.heureEntreParentheses} onChange={(e) => option({ heureEntreParentheses: e.target.checked || undefined })} />
            <span>{t('table.opt.heureParentheses')}</span>
          </label>
        )}
      </div>
    </>
  )
}

/* ── Couleur de la cellule ── */

function OutilFond({ c }: { c: Cellules }) {
  const menu = useMenu()
  const libre = useRef<HTMLInputElement>(null)
  const apercu = (v: string | null | undefined) => poserEtat(c.id, { apercuFond: v })
  // Le menu qui se ferme ne laisse pas un aperçu derrière lui.
  useEffect(() => () => apercu(undefined), [])
  const poser = (v: string | undefined) => {
    apercu(undefined)
    c.appliquer((tab) => poserFormat(tab, c.plages, { fond: v }))
  }
  const fond = c.mixte.has('fond') ? null : (c.format.fond ?? '')
  return (
    <OutilAvecMenu menu={menu} icone="palette" titre={t('table.fond.titre')} libelle={t('table.fond')} pastille={fond === 'entete' ? FOND_ENTETE.clair : fond || 'var(--notak-table-corps, #ffffff)'}>
      <div className="notak-note-palette notak-table-palette-fond" role="menu">
        <div className="notak-table-pastilles-fond">
          <button type="button" role="menuitemradio" data-vide title={nuance('aucune')} aria-label={nuance('aucune')} aria-checked={fond === ''} onClick={() => poser(undefined)} />
          {FONDS_CELLULE.map((x) => (
            <button
              key={x.nom}
              type="button"
              role="menuitemradio"
              title={nuance(x.nom)}
              aria-label={nuance(x.nom)}
              aria-checked={fond === x.valeur}
              style={{ background: x.valeur === 'entete' ? 'var(--notak-table-entete, #d1d3d6)' : x.valeur }}
              onClick={() => poser(x.valeur)}
            />
          ))}
        </div>
        <button type="button" role="menuitem" className="notak-table-fond-libre" onClick={() => libre.current?.click()}>
          <span className="notak-table-roue" aria-hidden />
          {t('table.fond.libre')}
        </button>
        <input
          ref={libre}
          type="color"
          className="notak-table-fond-champ"
          tabIndex={-1}
          aria-hidden
          defaultValue={fond && fond.startsWith('#') ? fond : '#ffd14d'}
          // Pendant qu'on cherche, la table montre la couleur ; elle se pose quand le sélecteur se referme.
          onInput={(e) => apercu(e.currentTarget.value)}
          onChange={(e) => poser(e.currentTarget.value)}
        />
      </div>
    </OutilAvecMenu>
  )
}

/* ── Alignement ── */

function OutilAlignement({ c }: { c: Cellules }) {
  const menu = useMenu()
  const formats = formatsDe(c.table)
  const effectifs = new Set(cellulesDe(c.plages, c.table).map(([l, col]) => alignementDe(formats[l]?.[col], (c.table.cellules[l]?.[col] ?? '').startsWith('='))))
  const h = effectifs.size === 1 ? [...effectifs][0]! : null
  const v = c.mixte.has('vertical') ? 'haut' : (c.format.vertical ?? 'haut')
  const icone: Record<'gauche' | 'centre' | 'droite', NomIcone> = { gauche: 'texteGauche', centre: 'texteCentre', droite: 'texteDroite' }
  const horizontaux = ['gauche', 'centre', 'droite'] as const
  const verticaux = [['haut', 'alignerHaut'], ['milieu', 'alignerCentreV'], ['bas', 'alignerBas']] as const
  return (
    <OutilAvecMenu menu={menu} icone={h ? icone[h] : 'justifier'} titre={t('table.alignement.titre')} libelle={t('table.alignement')}>
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

/* ── « ••• » : le menu du clic droit, sans le presse-papiers ni ce que la barre a déjà ── */

function OutilPlus({ c }: { c: Cellules }) {
  const menu = useMenu()
  // Le menu se relit à chaque rendu : la sélection a pu changer.
  const entrees = menu[0] ? entreesTable(c.contexte, c.id, 'barre') : []
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
              {e.raccourci && <Raccourci touches={e.raccourci} />}
            </button>
          ),
        )}
      </div>
    </OutilAvecMenu>
  )
}
