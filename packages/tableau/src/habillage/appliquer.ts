import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Habillage, lireHabillageTexte } from './format'
import { cssDeHabillage } from './variables'
import { type OffreHabillages, disponibles, ecrireBibliotheque, habillageActif, lireBibliotheque } from './bibliotheque'
import { publierHabillages } from './catalogue'

/**
 * Pose un habillage sur la page : `data-habillage` et `data-mode` sur `<html>`, sa feuille dans un seul `<style>` du
 * `<head>`, ses fontes chargées. `null` rend la page à l'habillage de Notak. Une fonte qui ne charge pas (hors ligne,
 * adresse morte) laisse la pile de repli du thème prendre le relais.
 */
export function appliquerHabillage(h: Habillage | null, mode: 'clair' | 'sombre', doc: Document = document) {
  const racine = doc.documentElement
  let feuille = doc.head.querySelector<HTMLStyleElement>('style[data-notak-habillage]')
  if (!h) {
    delete racine.dataset.habillage
    delete racine.dataset.mode
    feuille?.remove()
    return
  }
  racine.dataset.habillage = h.id
  racine.dataset.mode = mode
  if (!feuille) {
    feuille = doc.createElement('style')
    feuille.dataset.notakHabillage = ''
    doc.head.append(feuille)
  }
  const css = cssDeHabillage(h)
  if (feuille.textContent !== css) feuille.textContent = css
  chargerFontes(h, doc)
}

/** Les fontes déjà demandées, par source : on ne recharge pas à chaque bascule de mode. */
const demandees = new Set<string>()

function chargerFontes(h: Habillage, doc: Document) {
  if (typeof FontFace === 'undefined' || !doc.fonts) return
  for (const f of h.fontes ?? []) {
    if (demandees.has(f.source)) continue
    demandees.add(f.source)
    const fonte = new FontFace(f.famille, `url("${f.source}")`, { ...(f.graisse ? { weight: f.graisse } : {}), ...(f.style ? { style: f.style } : {}) })
    fonte.load().then(
      (chargee) => doc.fonts.add(chargee),
      () => demandees.delete(f.source),
    )
  }
}

/**
 * Les habillages de l'espace : ceux offerts par l'application et ceux importés ici, l'actif posé sur la page, et de
 * quoi importer ou retirer. `importer` lève l'`ErreurHabillage` du fichier refusé.
 */
export function useHabillages(offre: OffreHabillages | undefined, choix: string | undefined, mode: 'clair' | 'sombre') {
  const [importes, setImportes] = useState(lireBibliotheque)
  const liste = useMemo(() => disponibles(offre, importes), [offre, importes])
  const actif = useMemo(() => habillageActif(liste, offre, choix), [liste, offre, choix])
  useEffect(() => appliquerHabillage(actif, mode), [actif, mode])
  useEffect(() => publierHabillages(liste.map((d) => d.habillage)), [liste])
  useEffect(
    () => () => {
      appliquerHabillage(null, 'clair')
      publierHabillages([])
    },
    [],
  )
  const importer = useCallback((texte: string): Habillage => {
    const h = lireHabillageTexte(texte)
    setImportes((v) => {
      // Réimporter un thème du même identifiant le remplace : c'est ainsi qu'on le met à jour.
      const suivants = [...v.filter((x) => x.id !== h.id), h]
      ecrireBibliotheque(suivants)
      return suivants
    })
    return h
  }, [])
  const retirer = useCallback((id: string) => {
    setImportes((v) => {
      const suivants = v.filter((x) => x.id !== id)
      ecrireBibliotheque(suivants)
      return suivants
    })
  }, [])
  return { liste, actif, impose: !!offre?.impose && actif?.id === offre.impose, importer, retirer }
}

export type Habillages = ReturnType<typeof useHabillages>
