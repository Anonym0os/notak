// Les feuilles de style importées par les types d'éléments (traitées par le bundler de l'application).
declare module '*.css'
// L'adresse d'un fichier que le bundler sert tel quel (le moteur de PDF y charge son travailleur).
declare module '*?url' {
  const adresse: string
  export default adresse
}
