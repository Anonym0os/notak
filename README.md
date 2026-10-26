# Notak

**Free-form visual boards: notes, images, links, columns, arrows, tasks, sketches, on an infinite canvas.**
An open-source alternative to Milanote, in TypeScript and React. *[Lire en français](README.fr.md)*

![Notak's welcome board](docs/captures/accueil.en.png)

## Try it

**[notak.app](https://notak.app)** runs entirely in your browser: no account, no server, nothing leaves your
device. Your boards live in the browser; press **Cmd+S** to keep a `.notak` copy wherever you like (your disk,
iCloud Drive, a USB stick), **Cmd+O** to open one. On Chrome and Edge for desktop you can also sync a folder of your
cloud drive (experimental).

**The desktop app** (macOS, Windows, Linux) embeds the same local edition: nothing goes through a server, and it
updates itself from signed releases (see [Install the desktop app](#install-the-desktop-app),
[`apps/bureau`](apps/bureau/README.md), [`docs/MISES-A-JOUR.md`](docs/MISES-A-JOUR.md), in French). What can leave
your device, and to whom: [`docs/PUBLIER.md`](docs/PUBLIER.md#ce-qui-sort-de-lappareil).

Want to work together in real time (accounts, sharing, live cursors)? Install your own Notak: it is free software
and installs with one `docker compose` file (see [Self-host](#self-host)).

### Install the desktop app

Download it from the [releases page](https://github.com/Anonym0os/notak/releases/latest), under *Assets*:

| System | The file | On first launch |
|---|---|---|
| macOS, Apple chip (M1 and later) | `Notak_<version>_macos_aarch64.dmg` | Drag Notak into *Applications*: anywhere else, it can't update itself. The first time you open it, macOS says it can't verify the app: in *System Settings → Privacy & Security*, at the very bottom, click *Open Anyway*, then confirm. Once and for all. |
| macOS, Intel processor | `Notak_<version>_macos_x86_64.dmg` | Same. |
| Windows 10 and 11 | `Notak_<version>_windows_x64-setup.exe` | "Windows protected your PC": click *More info*, then *Run anyway*. Notak installs for you alone, with no administrator password. |
| Linux (64-bit PC) | `Notak_<version>_linux_x86_64.AppImage` | Put it in a folder of your own (`~/Applications`, say), make it executable (`chmod +x Notak_*.AppImage`, or *Properties → Allow executing*), then open it. If it doesn't open, it is missing FUSE: `sudo apt install libfuse2` (`libfuse2t64` since Ubuntu 24.04). |

From then on, updates come by themselves: the app downloads them, checks their signature and installs them when you
quit, without these warnings again. One exception on macOS: until the app is signed with an Apple certificate, macOS
asks again for microphone access at the first audio note after each update.

The other files: the `.msi` (Windows, for the whole machine), the `.deb` and the `.rpm` (Linux) install Notak too, but
then every update asks for the administrator password, when you quit the app. The `.app.tar.gz` and `.sig` files are
for updates, and `SHA256SUMS.txt` is for checking a download.

Your boards from notak.app come along: in the browser, **Cmd+S** (Ctrl+S) keeps a `.notak` copy, which the app opens
with a double click.

## Two editions, one codebase

| | **Local** (notak.app) | **Server** (self-hosted) |
|---|---|---|
| Where boards live | in the browser (IndexedDB), plus `.notak` copies | on your server (SQLite), cached offline in the browser |
| Accounts | none | yes |
| Working together | swap `.notak` files, or sync a shared folder | live: presence, cursors, comments, sharing by address or link |
| Link previews | address only (browsers can't read other sites) | title, image, player |
| Runs on | any static host | Docker (Notak and OpenFGA, amd64 or arm64) |

Both are built from `apps/web`; `VITE_EDITION=locale` selects the local one at build time, and neither bundle
contains the other's code.

Notak covers almost all of Milanote's features: see [`docs/FONCTIONNALITES.md`](docs/FONCTIONNALITES.md).

## Develop

You need [Bun](https://bun.sh) 1.3 and Node 22.18 or later (the server runs its TypeScript directly; CI and the image
use Node 24).

```bash
bun install
bun run dev:locale          # the local edition, at http://localhost:5173
```

The server edition needs its server too:

```bash
bun run serveur             # terminal 1: API, accounts and live sync on :3005
bun run dev                 # terminal 2: the app, proxied to the server
```

Checks: `bun run typecheck` and `bun run test` (about 1,500 tests, including a few hundred randomised sync
scenarios). The code is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

> Notak is the tool we use every day, published as is and free for good. Issues and pull requests are not
> followed: fork it, adapt it, use it as you like.

> The code, comments and design notes are written in French (`creerTableau`, `magasin`, `toile`…);
> `CONTRIBUTING.md` has a short glossary.

## Self-host

### The server edition (accounts, live collaboration)

Two containers: Notak serves the app, the accounts and live collaboration on port 3005, and
[OpenFGA](https://openfga.dev) evaluates permissions (who can read, comment, edit or own each board). Notak's data
(SQLite database and uploaded files) lives in a Compose volume named after the folder (`notak_notak-donnees` for a
`notak` folder: `docker volume ls`) and is the source of truth: OpenFGA only holds a copy, rebuilt from it if it is
ever lost. The image is published for amd64 and arm64 (`ghcr.io/anonym0os/notak`); all you need is
[`compose.yaml`](compose.yaml) and a `.env` file next to it (Docker Compose 2.24 or later):

```bash
mkdir notak && cd notak
curl -fsSLO https://github.com/Anonym0os/notak/releases/latest/download/compose.yaml
printf 'NOTAK_ORIGINE=https://notak.example.com\nNOTAK_ADMINS=you@example.com\n' > .env
docker compose up -d
```

**Settings live in the `.env` file**, one variable per line, and every line reaches the server. After a change,
`docker compose up -d` recreates the container with it. A variable put in front of the command
(`NOTAK_ADMINS=… docker compose up -d`) only lasts for that command: the next update would forget it.
`NOTAK_ORIGINE` is the address everyone types, in the browser and in the desktop app: `https://` and the host name,
with no path and no trailing `/`.

To run the image on its own, without `compose.yaml`, give it an OpenFGA server (`NOTAK_OPENFGA_URL`), a volume on
`/donnees` and the same variables.

To update:

```bash
curl -fsSLO https://github.com/Anonym0os/notak/releases/latest/download/compose.yaml
docker compose pull && docker compose up -d
```

The latest release's `compose.yaml` comes first: it pins OpenFGA's version, which `pull` alone never changes. So don't
edit it; your additions to Compose go in a `compose.override.yaml` next to it. The `.env` is read again, so your
settings stay. The server tells you when a new version is out, in its log and in the app for the addresses listed in
`NOTAK_ADMINS`, by reading the same release announcement as the desktop app every twelve hours (`NOTAK_VERIFIER_MAJ=0`
turns this off). To stay on a version, put `NOTAK_VERSION=0.2.0` in the `.env` (`0.2` follows the 0.2 fixes as soon as
they are published). To build from source instead: `docker compose -f compose.yaml -f compose.source.yaml up -d
--build`. Each published image carries a provenance attestation:
`gh attestation verify oci://ghcr.io/anonym0os/notak:0.2.0 -R Anonym0os/notak`.

The image expects an HTTPS reverse proxy in front of it: it sets a `Secure` cookie, and takes the client's address
from the entry the proxy adds to `X-Forwarded-For` (`NOTAK_RELAIS=2` behind two proxies, if the second one trusts the
first). So `compose.yaml` publishes port 3005 on the machine's loopback only (`127.0.0.1`), for a proxy on the same
machine (Caddy: `reverse_proxy localhost:3005`); for a proxy elsewhere, set `NOTAK_ECOUTE` and a firewall (see
[`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md)). To try it over plain HTTP on your machine, put
`NOTAK_COOKIE_SECURISE=0` and `NOTAK_RELAIS=0` in the `.env`, and no `NOTAK_ORIGINE`.

The desktop app connects to your server: "Connect to a Notak server…", then its address (HTTPS with a real
certificate, except on `localhost`; for a server at home with no domain name, Tailscale works, see
[`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md#un-serveur-à-la-maison-sans-nom-de-domaine)). The server's boards stay
on the server and the computer's boards stay on the computer, until you ask the app to copy the latter to the server.
Signing in with Google, Microsoft, GitHub or a space's SSO goes through your browser and a code to confirm.

Accounts go through [Better Auth](https://www.better-auth.com). Optional settings, in the `.env`:

| Variable | Effect |
|---|---|
| `NOTAK_SECRET` | Signs session cookies. Without it, one is drawn on first start and kept in `/donnees/secret`. Changing it signs everyone out. |
| `NOTAK_GOOGLE_ID`, `NOTAK_GOOGLE_SECRET` | Adds "Continue with Google". Same pattern for `MICROSOFT` and `GITHUB`. The callback is `<NOTAK_ORIGINE>/api/auth/callback/<provider>`. |
| `NOTAK_IDP_INTERNES` | Comma-separated origins of identity providers on your private network (e.g. `http://keycloak.lan`) that a team space may declare for SSO. Public providers (Okta, Entra ID, Google Workspace) need nothing. |
| `NOTAK_SMTP_URL`, `NOTAK_EXPEDITEUR` | Sends password-reset and verification emails (`smtps://user:password@host:465`). Without it, the links go to the server log for the administrator to pass on. |

Before each migration, the server copies the database to `notak.db.avant-<n>` in `/donnees`, then migrates it. A
migrated database refuses older code, so rolling back means the previous image plus that copy, and letting OpenFGA
rebuild from it (see [`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md), "Mettre à jour").

The "Image" panel's photo library queries Pexels: put a free key in the `.env` (`PEXELS_API_KEY=…`). Without it, the
panel only offers uploading your own files.

Your instance's name, closed sign-ups, the themes it provides or enforces, Coolify, backups, updates and rollback,
and the desktop app: [`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md) (in French).

#### Encryption at rest

> **Lose the key, lose the data.** Nothing can decrypt the boards or the files without it: keep a copy outside the
> server (a password manager, a printed sheet in a drawer), and back it up apart from the data.

Give the server a key and it writes the boards' content (their Yjs state) and the uploaded files, resized copies
included, encrypted on disk with AES-256-GCM. The server holds the key and decrypts in memory, so search, activity,
export and public links all keep working: this protects the disk and its backups, it is not end-to-end encryption.

| Variable | Meaning |
|---|---|
| `NOTAK_CLE` | The key: 32 random bytes in base64, made with `openssl rand -base64 32`. In the `.env`, keep that file to yourself (`chmod 600 .env`). |
| `NOTAK_CLE_FICHIER` | Or the path of a file holding it (a Docker secret, say), readable by the image's `node` user: with Compose, mount it with a `- /root/notak_cle:/run/secrets/notak_cle:ro` line under the `notak` service's `volumes:`, in a `compose.override.yaml` (see [`docs/AUTO-HEBERGER.md`](docs/AUTO-HEBERGER.md)), and put `NOTAK_CLE_FICHIER=/run/secrets/notak_cle` in the `.env`. Give one or the other, never both. |

Without a key, nothing changes. With one, data written before stays readable and is encrypted the next time it is
saved. To encrypt everything at once, with the key in the `.env`:

```bash
docker compose stop notak
docker compose run --rm --no-deps notak node apps/serveur/outils/chiffrer.ts
docker compose up -d
```

The tool says how many documents and files it encrypted: "0 document(s) et 0 fichier(s)" on a server that has boards
means it did not open the right folder. Without Docker, stop the server and run `bun run serveur:chiffrer` with the
same variables (`NOTAK_DONNEES` for the data folder). A wrong key, or a missing one in front of encrypted data, stops
the server at startup rather than serving empty boards.

What stays **in clear**, because the server needs to read it without opening each board: board titles, the search
index (SQLite FTS5, which holds the text of the elements), activity and notification excerpts, and account e-mail
addresses (plus names, colors and sharing rights). So also encrypt the host's disk (LUKS, an encrypted volume
from your provider): the key in `NOTAK_CLE` covers the content, the disk covers the rest.

### The local edition (like notak.app)

Static files served by nginx, no API:

```bash
docker build -f apps/site/Dockerfile --build-arg VITE_CONTACT=you@example.org -t notak-site .
docker run -d -p 8080:80 notak-site
```

`VITE_CONTACT` is the address offered under "Write to us" in the app; leave it out to show only the link to this
repository. Or build the files yourself (`bun run build:locale`, output in `apps/web/dist`) and put them on any
static host, with every unknown path falling back to `index.html`.

## Repository

| Path | What |
|---|---|
| `packages/tableau` | `@notak/tableau`: the core (camera, selection, history, Yjs store), the React canvas, element types, the folder sync engine |
| `apps/web` | the web app, both editions |
| `apps/serveur` | the server edition's backend (Hono, Hocuspocus, SQLite) |
| `apps/site` | notak.app: the local edition behind nginx, and the About page |
| `apps/bureau` | the desktop app (Tauri): the local edition embedded, with signed updates |
| `docs/` | the spec, the feature list, the architecture, the storage format, the publishing model |

## Stack

React 19 (the canvas is DOM, zoomed with a CSS transform), Tiptap 3 for rich text, Yjs for everything that syncs,
IndexedDB in the browser, Hono and Hocuspocus on the server, Tauri for the desktop.

## License

AGPL-3.0. Whoever runs a modified version for others must publish its code.
