# Bastion

**The self-hosted wiki for IT operations and system administration.**
Runbooks, server data sheets, network diagrams, certificate deadlines and the emergency handbook in one place –
up and running with Docker in minutes, data in PostgreSQL, installable as an app (PWA).

[Deutsch](README.md) · **English**

![Stack](https://img.shields.io/badge/stack-Node%2022%20·%20React%2019%20·%20PostgreSQL%2016-1f5f99)
![License](https://img.shields.io/badge/license-GPL--3.0-f2c200)
![Languages](https://img.shields.io/badge/UI-English%20·%20German-555)

![Home page with recent changes, runs in progress and deadlines](docs/screenshots/en/dashboard.png)

## Contents

- [Why Bastion?](#why-bastion)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Features](#features)
- [Configuration](#configuration)
- [Sign-in via LDAP and SSO](#sign-in-via-ldap-and-sso)
- [Import from other wikis](#import-from-other-wikis)
- [Permissions](#permissions)
- [Backup, updates and monitoring](#backup-updates-and-monitoring)
- [REST API](#rest-api)
- [Development](#development)
- [Security](#security)

## Why Bastion?

General-purpose wikis know pages and folders. An operations team needs more:

- **Pages with structure** – hosts, services, networks, runbooks and incidents as page types with a
  data sheet (IP, location, owner …) that is searchable and shows up as an inventory table.
- **Docs that don't go stale** – review dates and deadlines for certificates, licences and warranties,
  with reminders in the wiki, by email or in chat.
- **Runbooks you can execute** – tick off step by step, with notes, a log and several people at once.
- **Secrets where they are needed** – encrypted password blocks right on the page, every reveal in the audit log.
- **Ready for the bad day** – emergency handbook as PDF, Git export and backups, so the documentation
  stays readable even when the wiki itself is down.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/en/page.png" alt="Host page with data sheet"><br><sub><b>Host page</b> – data sheet with warranty deadline, review notice and command placeholders</sub></td>
    <td width="50%"><img src="docs/screenshots/en/runbook-dark.png" alt="Runbook in dark mode"><br><sub><b>Runbook</b> in dark mode – code blocks with copy button, callouts, table of contents</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/en/editor.png" alt="WYSIWYG editor with slash menu"><br><sub><b>Editor</b> – WYSIWYG with slash menu, tables, checklists, secrets and snippets</sub></td>
    <td><img src="docs/screenshots/en/search.png" alt="Command palette with search results"><br><sub><b>Search</b> – command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>) across titles, content and data sheets</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/en/run.png" alt="Checklist run in progress"><br><sub><b>Runs</b> – execute a runbook or checklist, with notes and a log</sub></td>
    <td><img src="docs/screenshots/en/deadlines.png" alt="Deadlines overview"><br><sub><b>Deadlines</b> – expiring certificates, licences, warranties and due reviews</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/en/diagram.png" alt="Network page with Mermaid diagram"><br><sub><b>Diagrams</b> – Mermaid network diagrams inline, with live preview in the editor</sub></td>
    <td><img src="docs/screenshots/en/admin.png" alt="Admin panel system status"><br><sub><b>Admin panel</b> – system status, users, permissions, SSO, backups and more</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/en/theme-dark.png" alt="VT220 theme"><br><sub><b>Themes</b> – six colour schemes (here “VT220”), each light or dark</sub></td>
    <td align="center"><img src="docs/screenshots/en/mobile.png" alt="Mobile view" width="220"><br><sub><b>Mobile</b> – responsive and installable as a PWA, including offline reading</sub></td>
  </tr>
</table>

## Quick start

Requirement: Docker with the Compose plugin.

```bash
git clone <repo-url> bastion && cd bastion
cp .env.example .env            # set at least POSTGRES_PASSWORD
# optional: DEFAULT_LANGUAGE=en for an English UI and English demo content
docker compose up -d --build
docker compose logs app         # shows the admin password if ADMIN_PASSWORD is empty
```

The wiki is then available at <http://localhost:8080> (change the port with `BASTION_PORT`).
On first start Bastion creates an administrator, templates, data-sheet schemas and – unless
`SEED_DEMO_CONTENT=false` – a few example spaces.

<details>
<summary>Build the image only and use your own database</summary>

```bash
docker build -t bastion-wiki .
docker run -d -p 8080:3000 \
  -e DATABASE_URL=postgres://user:pass@db-host:5432/bastion \
  -e ADMIN_PASSWORD='secret123' \
  -e DEFAULT_LANGUAGE=en \
  -v bastion_uploads:/data \
  bastion-wiki
```

The database needs PostgreSQL ≥ 13 with the `pg_trgm` and `unaccent` extensions.
</details>

## Features

### Writing and structure

- **WYSIWYG editor** (TipTap) with slash menu (`/`), Markdown shortcuts, bubble menu, tables, checklists,
  images via drag & drop or paste, `Ctrl+S` to save and local draft recovery.
- **Code blocks** with syntax highlighting (Bash, PowerShell, YAML, Nginx, Dockerfile, SQL and more) and
  **placeholders** such as `{{Hostname}}` that are filled in once (or taken from the data sheet) and copied ready to run.
- **Callouts** (info, tip, warning, danger, success) and **Mermaid diagrams** with live preview.
- **Spaces** with their own colour, icon and permissions; page tree with drag & drop.
- **Page types and templates** for runbooks, incident postmortems, servers/hosts, changes, services,
  network segments and checklists – in English and German.
- **Data sheets**: free properties or a **schema** per page with typed fields
  (text, number, date, select, URL, IP, email, yes/no), required fields and monitored expiry dates.
- **Snippets**: reusable blocks of text, maintained in one place and embedded on many pages.
- **Version history** with diff and restore, **attachments**, export as Markdown or HTML.

### Day-to-day operations

- **Runbook runs**: tick off steps, notes per step, log, several people at once, protocol as Markdown.
- **Deadlines**: certificates, licences, contracts, warranties and review dates in one list, with reminders
  before they expire. Both schema fields with “Watch expiry” and free fields such as “Valid until” are recognised
  (ISO dates as well as DD.MM.YYYY).
- **Review dates** against outdated documentation, a “To review” list and markers in the page tree.
- **Inventory**: hosts, services and networks as a filterable table with CSV export. Every page shows
  “Linked from”, “Mentioned in” (hostname/IP found in the text) and “Systems mentioned”.
- **Secret blocks** for passwords, keys and tokens: AES-256-GCM encrypted, never in search, export or history,
  revealed only with write access, every reveal in the audit log.
- **Emergency handbook**: selected spaces as a print-ready document with cover page, table of contents,
  data sheets and diagrams – “Save as PDF”, secrets optionally in plain text (logged).
- **Search** across titles, content and data sheets (PostgreSQL full text + trigram similarity) with
  `tag:`, `space:` and `type:` filters and a command palette (`Ctrl+K`).

### Collaboration

- **Comments** with replies, **@mentions** and “resolved”.
- **Approval workflow** per page: edits become change requests, a second person or group approves
  (four-eyes principle, with diff). Exactly the reviewed version is applied.
- **Notifications** for watched pages and spaces: in the wiki, bundled by **email** and via **webhook**
  to Slack/Mattermost, Microsoft Teams, Matrix, Discord or as JSON.
- Notice when someone else is editing the same page; favourites and “Recently viewed”.
- **Share links** with expiry date for read access without an account, e.g. for contractors.
- **Trash** with restore including versions, attachments, comments and secrets.

### Access and administration

- **Permissions** on three levels: global role, space (default access + people/groups) and optionally
  **per page** – inherited by subpages and kept when a page is moved.
- **Sign-in** with local accounts, **LDAP / Active Directory** or **OpenID Connect** (Entra ID, Keycloak,
  Authentik, Okta …), group sync on every sign-in, **two-factor authentication (TOTP)**, optionally mandatory.
- **Admin panel** at `/admin`: system status, users, groups, spaces & permissions, sign-in & security,
  templates, data sheets, tags, link check, share links, import, branding & theming, notifications,
  backup & export, audit log, maintenance.
- **Backups** (manual or daily) with restore in the browser, **Git export** as Markdown, **link check**,
  **Prometheus metrics**, **REST API** with personal tokens, **audit log**.

### Look and feel

- A distinct design in RAL colours with page types as label bands, set in Atkinson Hyperlegible and Overpass Mono.
- Six themes (Rack, Leitstand, Blueprint, VT220, Nord, Solarized), each light, dark or following the system.
- Name, subtitle, default theme, accent colour, announcement banner and custom CSS in the admin panel;
  everyone can pick their own theme, mode, accent and font. Contrast checked against WCAG AA.
- UI in **English and German**, switchable per person.
- **PWA**: installable, app-shell cache and offline reading of recently visited pages.

## Configuration

All settings come from `.env` (template: [`.env.example`](.env.example)).

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | – | Database password (Compose), **required** |
| `POSTGRES_DB` / `POSTGRES_USER` | `bastion` | Database name and user |
| `DATABASE_URL` | – | Full Postgres URL instead of the `POSTGRES_*` variables (own database) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL` | `admin` / random / – | First administrator, only created when no user exists yet |
| `BASTION_PORT` | `8080` | Port on the host (Compose) |
| `PORT` | `3000` | Port inside the container |
| `DATA_DIR` | `/data` | Attachments, backups and key file (mount as a volume) |
| `COOKIE_SECURE` | `false` | Set to `true` once served over HTTPS |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Trusted reverse proxies, for correct client IPs |
| `SESSION_DAYS` | `14` | How long a sign-in stays valid |
| `MAX_UPLOAD_MB` | `25` | Maximum size per file |
| `IMPORT_MAX_MB` | `1024` | Maximum size of an import file or uploaded backup |
| `SEED_DEMO_CONTENT` | `true` | Example content on first start |
| `DEFAULT_LANGUAGE` | `de` | Default language (`de` or `en`) for the UI and the example content |
| `SECRET_KEY` | – | Key for secrets, 2FA and stored passwords. Empty = generated once and stored as `/data/secret.key`. **Keep it with your backups** |
| `PUBLIC_URL` | – | Public address for links in emails/webhooks, Git export and OIDC (can also be set in the admin panel) |
| `METRICS_TOKEN` | – | Bearer token for `/metrics`; without a token only with an admin sign-in |
| `TZ` | `Europe/Berlin` | Time zone, e.g. for the daily backup |

Everything else – branding, default theme, self-registration, review interval, trash retention, LDAP, OIDC,
mandatory 2FA, SMTP, webhooks, backup schedule and Git export – is configured in the admin panel.
Passwords and tokens are stored encrypted there and never shown again.

### Behind a reverse proxy

Example with Caddy:

```
wiki.example.com {
  reverse_proxy localhost:8080
}
```

Then set `COOKIE_SECURE=true` and `PUBLIC_URL=https://wiki.example.com`. The PWA and service worker
require HTTPS (except on `localhost`).

## Sign-in via LDAP and SSO

Under **Administration → Sign-in & security**:

- **LDAP / Active Directory:** enter the server (`ldaps://dc01.corp.local:636`), service account, search base
  and filter, then use “Test connection” (optionally with a test user). Map groups to roles, one per line,
  as DN or name. With the default role “No access”, only members of those groups get in.
- **OpenID Connect:** register the redirect URI shown (`…/api/auth/oidc/callback`) with your identity provider,
  enter issuer URL, client ID and secret, and release the `groups` claim.
- Wiki groups with an **external name** (Administration → Groups) are synced with the directory or SSO group on every sign-in.
- Local accounts remain available as an emergency login: `/login?local=1`, even when the form is hidden.

## Import from other wikis

Under **Administration → Import**, pick a source, upload the export (or enter API credentials) and review the
preview with page structure, files and notes. Nothing is written until you confirm.

| Source | How to export | What is imported |
| --- | --- | --- |
| Confluence | Space settings → Content tools → Export → HTML | Hierarchy, code macros, info/warning panels, tasks, expand, tables, attachments |
| Wiki.js | API key **or** ZIP of the Git/filesystem storage | Paths as hierarchy, tags, dates, `{.is-info}` notices, assets |
| BookStack | API token **or** Book → Export → Portable ZIP | Books, chapters, pages, tags (values as properties), images, attachments |
| MediaWiki | Special:Export or `dumpBackup.php --current`, optionally `images/` as ZIP | Wikitext, subpages, categories as tags |
| DokuWiki | ZIP of the `data/` folder | Namespaces, `start` pages, media, `<note>` boxes, code, tables |
| Notion | Export → Markdown & CSV | Hierarchy and images (databases are skipped) |
| Markdown / HTML | ZIP of an Obsidian vault, MkDocs project, GitHub wiki … | Folders, front matter, `[[wikilinks]]`, callouts, images |

The target can be a new space, one space per group (Confluence space, BookStack book …) or an existing space.
Pages with the same title are skipped, saved as a new version or created in addition – so imports can be
repeated. API credentials are not stored.

## Permissions

1. **Role** (global): *Administrator* can do everything, *Editor* creates spaces and writes in shared spaces,
   *Viewer* can read at most.
2. **Default access of the space** for everyone signed in (none / read / write).
3. **Explicit permissions** for people or groups (read / write / manage).
4. **Page permissions** (optional): a restricted page and its subpages are only visible to the people and groups
   listed – at most with the access the space grants. A page moved out of a restricted area keeps the restriction.

The highest level of 2 and 3 applies, limited by 1 and 4. Space managers and administrators always keep access.
Checks run on the server in the SQL functions `space_access()` and `page_access()`, so lists, search, page tree,
notifications, webhooks and exports never show content without access.

## Backup, updates and monitoring

**Backups** (Administration → Backup & export): “Back up now” or daily with retention. A backup
(`/data/backups/*.tar.gz`) contains all tables, all attachments and a readable Markdown copy. Restoring replaces
the entire state; the current state is backed up automatically first.
**Keep the key (`SECRET_KEY` or `/data/secret.key`) separately** – without it, secrets and 2FA cannot be decrypted.

The **Git export** mirrors the pages as a Markdown folder tree into a repository, so the documentation stays
readable during an outage. Pages with page permissions are not exported.

The classic way, at database and volume level:

```bash
docker compose exec -T db pg_dump -U bastion -Fc bastion > bastion-$(date +%F).dump
docker run --rm -v bastion_uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

**Updates:** pull and rebuild – database migrations run automatically on start.

```bash
git pull && docker compose up -d --build
```

**Monitoring:** `/metrics` provides Prometheus metrics (pages, active users and 2FA, overdue reviews, dead links,
runs in progress, mail queue, last backup and last Git export, HTTP requests and latency, database size).
`/api/health` is suitable for health checks.

```yaml
- job_name: bastion
  authorization:
    credentials: <METRICS_TOKEN>
  static_configs:
    - targets: ['wiki.example.org']
```

## REST API

Everything the UI does is available under `/api`. Create a token under **Settings → API tokens**.

```bash
export BASTION=https://wiki.example.com BASTION_TOKEN=bst_...

# Search (same syntax as in the UI)
curl -H "Authorization: Bearer $BASTION_TOKEN" "$BASTION/api/search?q=tag:runbook%20nginx"

# Create a host page
curl -X POST -H "Authorization: Bearer $BASTION_TOKEN" -H "Content-Type: application/json" \
  -d '{"spaceId":1,"title":"srv-db-02","pageType":"host","properties":{"IP address":"10.0.10.42"},"tags":["server"],"content":"<p>Created automatically</p>"}' \
  "$BASTION/api/pages"

# Export a page as Markdown
curl -H "Authorization: Bearer $BASTION_TOKEN" "$BASTION/api/pages/1/export?format=md"
```

<details>
<summary>Key endpoints</summary>

| Area | Endpoints |
| --- | --- |
| Spaces & pages | `GET /api/spaces`, `GET /api/spaces/:key`, `GET\|POST /api/pages`, `GET\|PUT\|DELETE /api/pages/:id`, `POST /api/pages/:id/move`, `GET /api/pages/:id/revisions`, `POST /api/pages/:id/attachments` |
| Search & inventory | `GET /api/search`, `GET /api/tags`, `GET /api/inventory?type=host`, `GET /api/pages/:id/related`, `GET /api/expiring` |
| Operations | `GET\|POST /api/pages/:id/runs`, `PATCH /api/runs/:id`, `GET /api/handbook`, `GET /api/snippets`, `GET /api/trash` |
| Collaboration | `GET\|POST /api/pages/:id/comments`, `GET /api/notifications`, `GET\|PUT /api/pages/:id/permissions`, `PUT /api/pages/:id/approval`, `POST /api/change-requests/:id/approve\|reject` |
| System | `GET /api/health`, `GET /metrics` |
</details>

## Development

Requirements: Node.js ≥ 20 and PostgreSQL ≥ 13 with `pg_trgm` and `unaccent`.

```bash
# Backend (port 3001)
cd server && npm install
DATABASE_URL=postgres://bastion:bastion@localhost:5432/bastion ADMIN_PASSWORD=admin12345 \
  PORT=3001 DATA_DIR=./data npm run dev

# Frontend with hot reload (port 5173, proxies /api to 3001)
cd client && npm install && npm run dev
```

```
server/                Express API (Node 22, ESM)
  src/db/migrations/   SQL migrations, run automatically on start
  src/db/seed*.js      Administrator, templates, schemas and example content
  src/lib/             Permissions, sanitising, encryption, TOTP, LDAP/OIDC, notifications,
                       approvals, trash, backup, Git export, metrics, background jobs
  src/routes/          REST endpoints
  src/importers/       Confluence, Wiki.js, BookStack, MediaWiki, DokuWiki, Markdown/Notion
client/                React SPA (Vite)
  public/sw.js         Service worker (PWA)
  src/components/      Layout, page tree, command palette, editor (TipTap) …
  src/pages/           Wiki views, src/pages/admin/ for the admin panel
  src/lib/i18n.js      Translation: German strings are the keys,
  src/locales/en.js    English dictionary
  src/styles/          Themes (design tokens), layout, content
docs/screenshots/      Images for this README
```

Translations: UI strings are written in German and passed through `tr()`; the English text lives in
`client/src/locales/en.js`. Server messages are translated on the client via exact keys or patterns in the same file.

## Security

- Passwords hashed with bcrypt; sessions as random tokens (only the SHA-256 hash is stored),
  cookies `HttpOnly` and `SameSite=Lax`.
- Two-factor authentication (TOTP, RFC 6238) with single-use recovery codes and attempt limits.
- Secret blocks, TOTP keys, LDAP/SMTP passwords, OIDC secret, webhook and Git URLs encrypted with AES-256-GCM.
- LDAP filter input is escaped, empty passwords are rejected; OIDC with PKCE, `state` (bound to the browser) and `nonce`.
- CSRF protection via origin checks, login rate limiting, Content Security Policy.
- HTML is sanitised on the server (sanitize-html) **and** in the browser (DOMPurify).
- Page permissions also apply to search, notifications, webhooks, trash and Git export.
- Share links expire, can be revoked and never show secrets; API tokens are stored hashed only.
- Audit log for sign-ins, changes, revealed secrets and administration.

## License

GPL-3.0 – see [LICENSE](LICENSE).
