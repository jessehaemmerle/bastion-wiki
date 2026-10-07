# Bastion – das Wiki für IT-Systemadministration

Bastion ist ein selbst gehostetes Wiki für Ops-, Infrastruktur- und Admin-Teams.
Es läuft vollständig in Docker, speichert alles in PostgreSQL und ist als PWA
installierbar – inklusive Offline-Lesen zuletzt besuchter Seiten.

![Stack](https://img.shields.io/badge/stack-Node%2022%20·%20React%2019%20·%20PostgreSQL%2016-7c5cff)

## Features

| Bereich | Was drin ist |
| --- | --- |
| **Editor** | WYSIWYG (TipTap) mit Slash-Menü (`/`), Codeblöcken mit Syntax-Highlighting für Bash, PowerShell, YAML, Nginx, Dockerfile, SQL u. v. m., Callouts (Info/Tipp/Warnung/Gefahr/Erfolg), Checklisten, Tabellen, Bildern per Drag & Drop/Einfügen, Bubble-Menü, `Strg+S` zum Speichern, lokale Entwurfssicherung |
| **Bereiche** | Beliebig viele Bereiche (Spaces) mit eigener Farbe, eigenem Symbol und eigenen Rechten; hierarchischer Seitenbaum mit Drag & Drop |
| **Berechtigungen** | Globale Rollen (Administrator, Redakteur, Betrachter) + pro Bereich: Standardzugriff (kein/lesen/schreiben) und explizite Rechte für Personen und Gruppen (Lesen/Schreiben/Verwalten) |
| **Nutzermanagement** | Benutzer, Gruppen, Deaktivieren, Passwort-Reset, Sitzungen beenden, optionale Selbstregistrierung |
| **Suche** | Systemweite Volltextsuche (PostgreSQL `tsvector` + Trigramm-Ähnlichkeit) über Titel, Inhalt **und Eigenschaften** (z. B. IP-Adressen); Filter `tag:`, `space:`, `type:`, `#tag`; Befehlspalette mit `Strg+K` |
| **Tags** | Tag-Wolke, verwandte Tags, Autovervollständigung, Admin: umbenennen, einfärben, zusammenführen |
| **Sysadmin-Extras** | Vorlagen für Runbooks, Incident-Postmortems, Server/Hosts, Changes, Services, Netzsegmente und Checklisten · strukturierte **Eigenschaften** („Spec Sheet“ mit Kopieren per Klick) · **Review-Termine** gegen veraltete Doku · abhakbare Checklisten direkt in der Leseansicht · Versionsverlauf mit Diff & Wiederherstellung · Anhänge · Export als Markdown/HTML · REST-API mit persönlichen **API-Tokens** · Audit-Log |
| **Admin-Panel** | Separates „Control Center“ unter `/admin`: Systemübersicht, Benutzer, Gruppen, Bereiche & Rechte, Vorlagen, Tags, Branding & Theming, Audit-Log, Wartung & JSON-Export |
| **Design & Theming** | 6 Themes (Aurora, Phosphor, Nord, Solarized, Ember, Graphite) jeweils hell/dunkel/System, frei wählbare Akzentfarbe, Schriftwahl, Admin-Standard-Theme, eigenes CSS über Design-Tokens |
| **PWA** | Installierbar, Service Worker mit App-Shell-Cache und Offline-Lesemodus |

## Schnellstart (Docker Compose)

```bash
git clone <repo-url> bastion && cd bastion
cp .env.example .env          # mindestens POSTGRES_PASSWORD setzen
docker compose up -d --build
docker compose logs app       # zeigt das Admin-Passwort, falls ADMIN_PASSWORD leer ist
```

Danach ist das Wiki unter <http://localhost:8080> erreichbar.
Beim ersten Start werden ein Administrator, die mitgelieferten Vorlagen und
(abschaltbar mit `SEED_DEMO_CONTENT=false`) einige Beispielbereiche angelegt.

### Nur das Image bauen

```bash
docker build -t bastion-wiki .
docker run -d -p 8080:3000 \
  -e DATABASE_URL=postgres://user:pass@db-host:5432/bastion \
  -e ADMIN_PASSWORD='geheim123' \
  -v bastion_uploads:/data \
  bastion-wiki
```

## Konfiguration

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `DATABASE_URL` | – | Vollständige Postgres-URL (alternativ `POSTGRES_HOST/PORT/DB/USER/PASSWORD`) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL` | `admin` / zufällig | Erster Administrator (nur wenn noch kein Benutzer existiert) |
| `PORT` | `3000` | Port im Container |
| `DATA_DIR` | `/data` | Speicherort für Anhänge (als Volume mounten!) |
| `COOKIE_SECURE` | `false` | Auf `true` setzen, wenn per HTTPS ausgeliefert |
| `TRUST_PROXY` | `loopback` | Express-`trust proxy`, für korrekte Client-IPs hinter Reverse Proxy |
| `SESSION_DAYS` | `14` | Gültigkeit einer Anmeldung |
| `MAX_UPLOAD_MB` | `25` | Maximale Größe pro Datei |
| `SEED_DEMO_CONTENT` | `true` | Beispielinhalte beim ersten Start |

Branding, Standard-Theme, Akzentfarbe, eigenes CSS, Ankündigungsbanner,
Registrierung und Review-Intervall werden im Admin-Panel unter
**Branding & Theming** gepflegt.

### Hinter einem Reverse Proxy (Beispiel Caddy)

```
wiki.example.com {
  reverse_proxy localhost:8080
}
```

Dann `COOKIE_SECURE=true` setzen. Für PWA-Installation und Service Worker ist HTTPS erforderlich
(außer auf `localhost`).

## Berechtigungsmodell

1. **Rolle** (global): *Administrator* darf alles, *Redakteur* darf Bereiche anlegen und
   in freigegebenen Bereichen schreiben, *Betrachter* kann höchstens lesen.
2. **Standardzugriff des Bereichs** gilt für alle angemeldeten Personen.
3. **Explizite Rechte** für Personen oder Gruppen (Lesen / Schreiben / Verwalten).

Es gilt jeweils die höchste Stufe aus 2 und 3, begrenzt durch 1. Wer einen Bereich
anlegt, erhält automatisch „Verwalten“. Die Prüfung erfolgt serverseitig in der
SQL-Funktion `space_access()`, damit Listen, Suche und Dashboard nie Inhalte
ohne Zugriff zeigen.

## REST-API

Alle Funktionen der Oberfläche sind über `/api` erreichbar. Für Skripte unter
**Einstellungen → API-Tokens** einen Token erzeugen:

```bash
export BASTION=https://wiki.example.com BASTION_TOKEN=bst_...

# Suchen (gleiche Syntax wie in der Oberfläche)
curl -H "Authorization: Bearer $BASTION_TOKEN" "$BASTION/api/search?q=tag:runbook%20nginx"

# Seite anlegen
curl -X POST -H "Authorization: Bearer $BASTION_TOKEN" -H "Content-Type: application/json" \
  -d '{"spaceId":1,"title":"srv-db-02","pageType":"host","properties":{"IP-Adresse":"10.0.10.42"},"tags":["server"],"content":"<p>Automatisch angelegt</p>"}' \
  "$BASTION/api/pages"

# Seite als Markdown exportieren
curl -H "Authorization: Bearer $BASTION_TOKEN" "$BASTION/api/pages/1/export?format=md"
```

Wichtige Endpunkte: `GET /api/spaces`, `GET /api/spaces/:key`, `GET|POST /api/pages`,
`GET|PUT|DELETE /api/pages/:id`, `POST /api/pages/:id/move`, `GET /api/pages/:id/revisions`,
`POST /api/pages/:id/attachments`, `GET /api/tags`, `GET /api/search`, `GET /api/health`.

## Backup & Wiederherstellung

```bash
# Datenbank
docker compose exec -T db pg_dump -U bastion -Fc bastion > bastion-$(date +%F).dump
# Anhänge
docker run --rm -v bastion_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .

# Wiederherstellen
docker compose exec -T db pg_restore -U bastion -d bastion --clean < bastion-2026-01-01.dump
```

Zusätzlich bietet das Admin-Panel einen JSON-Export aller Inhalte.

## Entwicklung

Voraussetzungen: Node.js ≥ 20 und eine PostgreSQL-Instanz (≥ 13, mit `pg_trgm` und `unaccent`).

```bash
# Backend (Port 3001)
cd server && npm install
DATABASE_URL=postgres://bastion:bastion@localhost:5432/bastion ADMIN_PASSWORD=admin12345 \
  PORT=3001 DATA_DIR=./data npm run dev

# Frontend mit Hot Reload (Port 5173, leitet /api an 3001 weiter)
cd client && npm install && npm run dev
```

### Projektstruktur

```
server/                 Express-API (ESM)
  src/db/migrations/    SQL-Migrationen (laufen beim Start automatisch)
  src/db/seed.js        Admin, Vorlagen & Beispielinhalte
  src/lib/              Auth, Berechtigungen, HTML-Sanitizing, Einstellungen, Audit
  src/routes/           auth, spaces, pages, search, tags, attachments, templates, admin
client/                 React-SPA (Vite)
  public/sw.js          Service Worker (PWA)
  src/components/       Layout, Seitenbaum, Befehlspalette, Editor (TipTap) …
  src/pages/            Wiki-Ansichten
  src/pages/admin/      Admin-Panel
  src/styles/           Themes (Design-Tokens), Layout, Inhalte
```

## Sicherheit

- Passwörter mit bcrypt, Sitzungen als zufällige Tokens (nur SHA-256-Hash in der DB), `HttpOnly`/`SameSite=Lax`-Cookies
- CSRF-Schutz über Origin-Prüfung, Login-Rate-Limit, Content-Security-Policy via Helmet
- HTML wird serverseitig (sanitize-html) **und** clientseitig (DOMPurify) bereinigt
- API-Tokens werden nur gehasht gespeichert und sind einmalig sichtbar
- Uploads werden außerhalb des Webroots gespeichert, nur bekannte Typen inline ausgeliefert
- Audit-Log für Anmeldungen, Änderungen und Administration

## Lizenz

GPL-3.0 – siehe [LICENSE](LICENSE).
