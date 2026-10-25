# Notak

**Free-form visual boards: notes, images, links, columns, arrows, tasks, sketches, on an infinite canvas.**
An open-source alternative to Milanote, in TypeScript and React. *[Lire en français](README.fr.md)*

![Notak's welcome board](docs/captures/accueil.en.png)

## Try it

**[notak.app](https://notak.app)** runs entirely in your browser: no account, no server, nothing leaves your
device. Your boards live in the browser; press **Cmd+S** to keep a `.notak` copy wherever you like (your disk,
iCloud Drive, a USB stick), **Cmd+O** to open one. On Chrome and Edge for desktop you can also sync a folder of your
cloud drive (experimental).

Want to work together in real time (accounts, sharing, live cursors)? Install your own Notak: it is free software
and fits in one container (see [Self-host](#self-host)).

## Two editions, one codebase

| | **Local** (notak.app) | **Server** (self-hosted) |
|---|---|---|
| Where boards live | in the browser (IndexedDB), plus `.notak` copies | on your server (SQLite), cached offline in the browser |
| Accounts | none | yes |
| Working together | swap `.notak` files, or sync a shared folder | live: presence, cursors, comments, sharing by address or link |
| Link previews | address only (browsers can't read other sites) | title, image, player |
| Runs on | any static host | one Docker container |

Both are built from `apps/web`; `VITE_EDITION=locale` selects the local one at build time, and neither bundle
contains the other's code.

Notak covers almost all of Milanote's features: see [`docs/FONCTIONNALITES.md`](docs/FONCTIONNALITES.md).

## Develop

You need [Bun](https://bun.sh) 1.3 and Node 22.13 or later.

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
scenarios). Contributions are welcome: start with [`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

> The code, comments and design notes are written in French (`creerTableau`, `magasin`, `toile`…). Issues and
> pull requests are welcome in English or French; `CONTRIBUTING.md` has a short glossary.

## Self-host

### The server edition (accounts, live collaboration)

Two containers: Notak serves the app, the accounts and live collaboration on port 3005, and
[OpenFGA](https://openfga.dev) evaluates permissions (who can read, comment, edit or own each board). Notak's data
(SQLite database and uploaded files) lives in the `notak-donnees` volume and is the source of truth: OpenFGA only
holds a copy, rebuilt from it if it is ever lost.

```bash
git clone https://github.com/Anonym0os/notak
cd notak
NOTAK_ORIGINE=https://notak.example.com docker compose up -d
```

To run the Notak image on its own, point it at an OpenFGA server with `-e NOTAK_OPENFGA_URL=http://openfga:8080`.

The image expects an HTTPS reverse proxy in front of it (`Secure` cookie, client address read from
`X-Forwarded-For`). To try it over plain HTTP on your machine: `-e NOTAK_COOKIE_SECURISE=0 -e NOTAK_RELAIS=0`.

Accounts go through [Better Auth](https://www.better-auth.com). Set the server's public address so sign-in
links and provider callbacks point to it: `-e NOTAK_ORIGINE=https://notak.example.com`. Optional settings:

| Variable | Effect |
|---|---|
| `NOTAK_SECRET` | Signs session cookies. Without it, one is drawn on first start and kept in `/donnees/secret`. Changing it signs everyone out. |
| `NOTAK_GOOGLE_ID`, `NOTAK_GOOGLE_SECRET` | Adds "Continue with Google". Same pattern for `MICROSOFT` and `GITHUB`. The callback is `<NOTAK_ORIGINE>/api/auth/callback/<provider>`. |
| `NOTAK_IDP_INTERNES` | Comma-separated origins of identity providers on your private network (e.g. `http://keycloak.lan`) that a team space may declare for SSO. Public providers (Okta, Entra ID, Google Workspace) need nothing. |
| `NOTAK_SMTP_URL`, `NOTAK_EXPEDITEUR` | Sends password-reset and verification emails (`smtps://user:password@host:465`). Without it, the links go to the server log for the administrator to pass on. |

Before upgrading, the server copies the database to `notak.db.avant-<version>` in `/donnees`, then migrates it.

The "Image" panel's photo library queries Pexels: pass a free key with `-e PEXELS_API_KEY=…`. Without it, the panel
only offers uploading your own files.

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
| `apps/bureau` | the desktop shell (Tauri) |
| `docs/` | the spec, the feature list, the architecture, the storage format, the publishing model |

## Stack

React 19 (the canvas is DOM, zoomed with a CSS transform), Tiptap 3 for rich text, Yjs for everything that syncs,
IndexedDB in the browser, Hono and Hocuspocus on the server, Tauri for the desktop.

## License

AGPL-3.0. Whoever runs a modified version for others must publish its code.
