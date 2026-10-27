#!/usr/bin/env bash
# Les étiquettes `x.y` et `latest` de l'image du serveur, posées par .github/workflows/annoncer-serveur.yml :
#
#   etiqueter-serveur.sh <x.y.z> avancer     une version vient d'être publiée : jamais vers une version plus ancienne
#   etiqueter-serveur.sh <x.y.z> reprendre   à la main, pour retirer une version mauvaise : vers celle-ci, même plus ancienne
#
# L'image doit exister à ce numéro, pour les deux architectures, porter ce numéro, et avoir été attestée par la
# publication de ce dépôt (publier-bureau.yml), depuis l'étiquette de cette version. Rien ne se reconstruit : les
# étiquettes désignent l'image attestée, octet pour octet. Attend IMAGE, GITHUB_REPOSITORY, GH_TOKEN et `docker login`.
set -euo pipefail

VERSION="${1:-}"
MODE="${2:-}"
if ! [[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "::error::« $VERSION » n'est pas un numéro de version (x.y.z)."
  exit 1
fi
MINEURE="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
if [ "$MODE" != avancer ] && [ "$MODE" != reprendre ]; then
  echo "::error::geste attendu : avancer ou reprendre"
  exit 1
fi
resume() { echo "$1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"; }
format_version='{{ index (index .Image "linux/amd64").Config.Labels "org.opencontainers.image.version" }}'

# L'image de cette version, telle que la publication l'a construite : les deux architectures, et son numéro.
if ! brut=$(docker buildx imagetools inspect --raw "$IMAGE:$VERSION"); then
  echo "::error::$IMAGE:$VERSION n'existe pas : la publication de cette version a-t-elle construit l'image ?"
  exit 1
fi
plateformes=$(jq -r '[.manifests[]?.platform | "\(.os)/\(.architecture)"] | sort | join(" ")' <<< "$brut")
if [ "$plateformes" != "linux/amd64 linux/arm64" ]; then
  echo "::error::$IMAGE:$VERSION n'a pas les deux architectures attendues (elle a : $plateformes)."
  exit 1
fi
porte=$(docker buildx imagetools inspect "$IMAGE:$VERSION" --format "$format_version")
if [ "$porte" != "$VERSION" ]; then
  echo "::error::$IMAGE:$VERSION porte le numéro « $porte » : ce n'est pas l'image de cette version."
  exit 1
fi
empreinte() { docker buildx imagetools inspect "$IMAGE:$1" --format '{{ json .Manifest }}' | jq -r .digest; }
attestee=$(empreinte "$VERSION")
[[ "$attestee" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "::error::Pas d'empreinte pour $IMAGE:$VERSION"; exit 1; }

# L'étiquette x.y.z se déplace : entre la publication et maintenant, quelque chose qui peut écrire dans le registre a pu
# la poser ailleurs. Seule une image attestée par la publication de ce dépôt, depuis l'étiquette vx.y.z, devient ce
# que tirent les serveurs.
if ! gh attestation verify "oci://$IMAGE@$attestee" --repo "$GITHUB_REPOSITORY" \
  --signer-workflow "$GITHUB_REPOSITORY/.github/workflows/publier-bureau.yml" \
  --source-ref "refs/tags/v$VERSION" --deny-self-hosted-runners > /dev/null; then
  echo "::error::$IMAGE:$VERSION ($attestee) n'a pas l'attestation de la publication de v$VERSION : rien ne bouge."
  exit 1
fi

# Le numéro que porte une étiquette ; vide si elle n'existe pas encore. Une autre erreur (le registre qui ne répond pas)
# arrête tout : mieux vaut ne rien déplacer que déplacer à l'aveugle.
numero() {
  local sortie
  if sortie=$(docker buildx imagetools inspect "$IMAGE:$1" --format "$format_version" 2>&1); then
    echo "$sortie"
  elif grep -qi 'not found' <<< "$sortie"; then
    echo ""
  else
    echo "::error::Impossible de lire $IMAGE:$1 : $sortie" >&2
    return 1
  fi
}
# Déplace l'étiquette sur cette version. En avançant, seulement si elle n'en désigne pas déjà une plus récente.
poser() {
  local actuel
  actuel=$(numero "$1") || exit 1
  if [ -n "$actuel" ] && [ "$MODE" = avancer ]; then
    if ! [[ "$actuel" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
      echo "::error::$IMAGE:$1 porte « $actuel », qui n'est pas un numéro de version : à regarder à la main."
      exit 1
    fi
    if [ "$(printf '%s\n%s\n' "$actuel" "$VERSION" | sort -V | tail -n 1)" != "$VERSION" ]; then
      echo "$IMAGE:$1 reste sur $actuel, plus récente que $VERSION."
      return 0
    fi
  fi
  # Une seule source, sans annotation : l'étiquette désigne le même index, octet pour octet, donc la même attestation.
  docker buildx imagetools create -t "$IMAGE:$1" "$IMAGE@$attestee"
  if [ "$(empreinte "$1")" != "$attestee" ]; then
    echo "::error::$IMAGE:$1 ne désigne pas l'image attestée ($attestee) : à regarder à la main."
    exit 1
  fi
  echo "$IMAGE:$1 → $VERSION${actuel:+ (avant : $actuel)}"
  resume "- \`$IMAGE:$1\` → $VERSION${actuel:+ (avant : $actuel)}"
}
resume "## Image du serveur $VERSION ($MODE)"
poser "$MINEURE"
poser latest
