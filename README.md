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
| **Berechtigungen** | Globale Rollen (Administrator, Redakteur, Betrachter) + pro Bereich: Standardzugriff (kein/lesen/schreiben) und explizite Rechte für Personen und Gruppen (Lesen/Schreiben/Verwalten) + **Einschränkung pro Seite** (gilt auch für Unterseiten und bleibt beim Verschieben erhalten; Verwalter des Bereichs behalten immer Zugriff) |
| **Freigabe-Workflow** | Pro Seite zuschaltbar: Änderungen werden zum Änderungsvorschlag, eine zweite Person (oder eine festgelegte Gruppe) gibt frei oder lehnt ab – mit Diff, Anmerkung und Benachrichtigung (Vier-Augen-Prinzip); übernommen wird genau die geprüfte Fassung |
| **Kommentare** | Diskussionen pro Seite mit Antworten, **@Erwähnungen** (Benachrichtigung nur an Personen mit Zugriff) und „erledigt“ |
| **Datenblätter** | Optional pro Seite ein **Schema** mit typisierten Feldern (Text, Zahl, Datum, Auswahl, URL, IP, E-Mail, Ja/Nein), Pflichtfeldern und **Ablaufdaten** – Übersicht „Fristen“ und Erinnerungen vor Ablauf (Zertifikate, Lizenzen, Verträge, Garantien). „Fristen“ zeigt zusätzlich freie Felder wie „Gültig bis“ / „Garantie bis“ (auch im Format TT.MM.JJJJ) und Review-Termine |
| **Bausteine** | Wiederverwendbare Textblöcke, an einer Stelle gepflegt und auf beliebig vielen Seiten eingefügt (auch in Exporten und Freigabelinks) |
| **Papierkorb** | Gelöschte Seiten samt Versionen, Anhängen, Kommentaren und Geheimnissen wiederherstellbar (Standard 30 Tage, einstellbar) |
| **Notfallhandbuch** | Ausgewählte Bereiche als druckfertiges Dokument mit Deckblatt, Inhaltsverzeichnis, Datenblättern und Diagrammen – „Als PDF speichern“; Geheimnisse optional im Klartext (protokolliert) |
| **Nutzermanagement** | Benutzer, Gruppen, Deaktivieren, Passwort-Reset, Sitzungen beenden, optionale Selbstregistrierung |
| **Anmeldung** | Lokale Konten, **LDAP / Active Directory** (Dienstkonto, Filter, memberOf oder Gruppensuche, eigene CA) und **OpenID Connect** (Entra ID, Keycloak, Authentik, Okta … mit PKCE). Rollen und Wiki-Gruppen werden aus Verzeichnis- bzw. SSO-Gruppen abgeleitet und bei jeder Anmeldung abgeglichen. **Zwei-Faktor-Anmeldung (TOTP)** mit Wiederherstellungscodes, auf Wunsch für Admins oder alle vorgeschrieben |
| **Suche** | Systemweite Volltextsuche (PostgreSQL `tsvector` + Trigramm-Ähnlichkeit) über Titel, Inhalt **und Eigenschaften** (z. B. IP-Adressen); Filter `tag:`, `space:`, `type:`, `#tag`; Befehlspalette mit `Strg+K` |
| **Tags** | Tag-Wolke, verwandte Tags, Autovervollständigung, Admin: umbenennen, einfärben, zusammenführen |
| **Geheimnisse** | Passwörter, Schlüssel und Tokens als **Geheimnis-Block** direkt auf der Seite: AES-256-GCM-verschlüsselt, nicht Teil von Inhalt, Suche, Export oder Versionsverlauf, nur mit Schreibrechten anzeigbar, jedes Anzeigen im Audit-Log |
| **Runbook-Durchläufe** | Runbooks und Checklisten Schritt für Schritt ausführen: wer hat was wann abgehakt, Notizen je Schritt, Verlauf, Ergebnis, mehrere Personen gleichzeitig, Protokoll als Markdown |
| **Inventar & Bezüge** | Hosts, Services und Netze als Tabelle mit ihren Datenblatt-Feldern (filtern, sortieren, CSV); jede Seite zeigt „Verlinkt von“, „Erwähnt in“ (Hostname/IP wird im Text gefunden) und „Erwähnte Systeme“ |
| **Benachrichtigungen** | Seiten und Bereiche beobachten; Meldungen im Wiki (Glocke), gebündelt per **E-Mail** (SMTP) und per **Webhook** an Slack/Mattermost, Microsoft Teams (Workflows), Matrix (Hookshot), Discord oder als JSON; Erinnerung bei fälligen Reviews |
| **Diagramme & Befehle** | **Mermaid**-Diagramme (Ablauf, Netzplan, Sequenz …) mit Live-Vorschau im Editor; **Platzhalter** wie `{{Hostname}}` in Codeblöcken werden einmal ausgefüllt (oder aus dem Datenblatt übernommen) und landen fertig beim Kopieren |
| **Zusammenarbeit** | Hinweis, wenn jemand dieselbe Seite gerade bearbeitet; Favoriten und „Zuletzt angesehen“ in der Seitenleiste; **Freigabelinks** mit Ablaufdatum zum Lesen ohne Konto (z. B. für Dienstleister) |
| **Betrieb** | **Sicherungen** als .tar.gz (alle Tabellen, Dateien, Markdown-Kopie) – manuell oder täglich, mit Wiederherstellung im Admin-Panel; **Git-Export** aller Seiten als Markdown in ein Repository (Seiten mit Seitenrechten bleiben draußen); **Link-Prüfung** (tote interne Links, externe Fehler, unverlinkte Seiten); **Prometheus**-Metriken unter `/metrics` |
| **Sysadmin-Extras** | Vorlagen für Runbooks, Incident-Postmortems, Server/Hosts, Changes, Services, Netzsegmente und Checklisten · strukturierte **Eigenschaften** („Spec Sheet“ mit Kopieren per Klick) · **Review-Termine** gegen veraltete Doku · abhakbare Checklisten direkt in der Leseansicht · Versionsverlauf mit Diff & Wiederherstellung · Anhänge · Export als Markdown/HTML · REST-API mit persönlichen **API-Tokens** · Audit-Log |
| **Admin-Panel** | Separates „Control Center“ unter `/admin`: Systemübersicht, Benutzer, Gruppen, Bereiche & Rechte, Anmeldung & Sicherheit, Vorlagen, Tags, Link-Prüfung, Freigabelinks, Import, Branding & Theming, Benachrichtigungen, Sicherung & Export, Audit-Log, Wartung |
| **Design & Theming** | Eigenständige Gestaltung aus dem Serverraum: RAL-Farben (Lichtgrau, Anthrazit, Signalblau, Signalgelb), Seitentypen als Beschriftungsband, Atkinson Hyperlegible und Overpass Mono. 6 Themes (Rack, Leitstand, Blueprint, VT220, Nord, Solarized), jeweils hell, dunkel oder nach System; Akzentfarbe, Schriftwahl, Admin-Standard-Theme und eigenes CSS über Design-Tokens. Kontraste nach WCAG AA geprüft |
| **Import** | Übernahme aus Confluence (HTML-Export), Wiki.js (Export-Archiv oder GraphQL-API), BookStack (REST-API oder Portable ZIP), MediaWiki (XML-Export), DokuWiki (data-Ordner), Notion sowie Markdown/HTML-Archiven (Obsidian, MkDocs, GitHub-Wiki) – mit Vorschau, Hierarchie, Bildern, Anhängen, Tags und umgeschriebenen internen Links |
| **Sprachen** | Oberfläche auf Deutsch und Englisch, umschaltbar pro Person (Einstellungen → Darstellung oder Login-Seite); Standardsprache im Admin-Panel bzw. per `DEFAULT_LANGUAGE`. Vorlagen gibt es in beiden Sprachen |
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
| `DEFAULT_LANGUAGE` | `de` | Standardsprache (`de` oder `en`) für Oberfläche, Untertitel und Beispielinhalte |
| `IMPORT_MAX_MB` | `1024` | Maximale Größe einer Import-Datei bzw. einer hochgeladenen Sicherung |
| `SECRET_KEY` | – | Schlüssel für Geheimnis-Blöcke, 2FA und gespeicherte Passwörter. Leer = wird einmalig erzeugt und als `/data/secret.key` abgelegt. **Mit den Backups aufbewahren** |
| `PUBLIC_URL` | – | Öffentliche Adresse für Links in E-Mails/Webhooks, Git-Export und die OIDC-Rückleitung (auch im Admin-Panel einstellbar) |
| `METRICS_TOKEN` | – | Bearer-Token für `/metrics`; ohne Token nur mit Admin-Anmeldung oder Admin-API-Token |
| `TZ` | `Europe/Berlin` | Zeitzone (Uhrzeit der täglichen Sicherung) |

Branding, Standard-Theme, Akzentfarbe, eigenes CSS, Ankündigungsbanner,
Registrierung und Review-Intervall werden im Admin-Panel unter
**Branding & Theming** gepflegt. LDAP, OIDC, 2FA-Pflicht, SMTP, Webhooks,
Sicherungsplan und Git-Export unter **Anmeldung & Sicherheit**,
**Benachrichtigungen** und **Sicherung & Export** – Passwörter und Tokens
werden dort verschlüsselt gespeichert und nie wieder angezeigt.

### Single Sign-on

- **LDAP / AD:** Server (`ldaps://dc01.corp.local:636`), Dienstkonto, Suchbasis und Filter eintragen,
  mit „Verbindung testen“ (optional mit Testbenutzer) prüfen. Gruppen → Rollen: eine Gruppe pro Zeile, als DN oder Name.
  Mit der Rolle „Kein Zugang“ ohne passende Gruppe kommen nur Mitglieder der zugeordneten Gruppen hinein.
- **OpenID Connect:** Die angezeigte Redirect-URI (`…/api/auth/oidc/callback`) beim Identitätsanbieter registrieren,
  Issuer-URL, Client-ID und -Secret eintragen. Für Gruppen den passenden Claim (`groups`) freigeben.
- Wiki-Gruppen mit einem **externen Namen** (Admin → Gruppen) werden bei jeder Anmeldung mit der Verzeichnis-/SSO-Gruppe abgeglichen.
- Lokale Konten bleiben als Notfallzugang erhalten (`/login?local=1`, auch wenn das Formular ausgeblendet ist).

### Hinter einem Reverse Proxy (Beispiel Caddy)

```
wiki.example.com {
  reverse_proxy localhost:8080
}
```

Dann `COOKIE_SECURE=true` setzen. Für PWA-Installation und Service Worker ist HTTPS erforderlich
(außer auf `localhost`).

## Import aus anderen Wikis

Unter **Administration → Import** wählst du die Quelle, lädst den Export hoch (oder gibst API-Zugangsdaten an)
und bekommst zuerst eine Vorschau mit Seitenstruktur, Dateien und Hinweisen. Erst nach Bestätigung wird geschrieben.

| Quelle | So exportieren | Was übernommen wird |
| --- | --- | --- |
| Confluence | Bereich → Bereichseinstellungen → Inhaltswerkzeuge → Exportieren → HTML | Hierarchie, Code-Makros, Info-/Warn-Panels, Aufgabenlisten, Expand, Tabellen, Anhänge mit Originalnamen |
| Wiki.js | API-Schlüssel (Administration → API-Zugang) **oder** ZIP der Git-/Dateisystem-Speicherung | Pfade als Hierarchie, Tags, Datum, `{.is-info}`-Hinweise, Assets |
| BookStack | API-Token (Profil → API-Tokens) **oder** Buch → Exportieren → Portable ZIP | Bücher, Kapitel, Seiten, Tags (mit Werten als Eigenschaften), Bilder, Anhänge, Callouts |
| MediaWiki | Spezial:Exportieren bzw. `dumpBackup.php --current`, optional images-Ordner als ZIP | Wikitext → HTML, Unterseiten, Kategorien als Tags |
| DokuWiki | ZIP des `data/`-Ordners | Namensräume, `start`-Seiten, Medien, `<note>`-Boxen, Code, Tabellen |
| Notion | Exportieren → Markdown & CSV | Hierarchie und Bilder (Datenbanken werden übersprungen) |
| Markdown/HTML | ZIP eines Obsidian-Vaults, MkDocs-Projekts, GitHub-Wikis … | Ordner-Hierarchie, Front Matter, `[[Wikilinks]]`, Callouts/Admonitions, Bilder |

Ziel kann ein neuer Bereich, ein Bereich je Gruppe (Confluence-Bereich, BookStack-Buch …) oder ein bestehender
Bereich sein. Gleichnamige Seiten werden wahlweise übersprungen, als neue Version gespeichert oder zusätzlich
angelegt – damit lassen sich Importe auch wiederholen. API-Zugangsdaten werden nicht gespeichert.

## Berechtigungsmodell

1. **Rolle** (global): *Administrator* darf alles, *Redakteur* darf Bereiche anlegen und
   in freigegebenen Bereichen schreiben, *Betrachter* kann höchstens lesen.
2. **Standardzugriff des Bereichs** gilt für alle angemeldeten Personen.
3. **Explizite Rechte** für Personen oder Gruppen (Lesen / Schreiben / Verwalten).

4. **Einschränkung der Seite** (optional): Ist eine Seite oder eine übergeordnete Seite eingeschränkt,
   sehen sie nur die dort eingetragenen Personen und Gruppen – höchstens mit dem Recht, das der Bereich gibt.
   Verwalter des Bereichs und Administratoren behalten immer Zugriff.

Es gilt jeweils die höchste Stufe aus 2 und 3, begrenzt durch 1 und 4. Wer einen Bereich
anlegt, erhält automatisch „Verwalten“. Die Prüfung erfolgt serverseitig in den
SQL-Funktionen `space_access()` und `page_access()`, damit Listen, Suche, Seitenbaum,
Benachrichtigungen und Dashboard nie Inhalte ohne Zugriff zeigen.

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
`POST /api/pages/:id/attachments`, `GET /api/tags`, `GET /api/search`, `GET /api/inventory?type=host`,
`GET /api/pages/:id/related`, `GET|POST /api/pages/:id/runs`, `PATCH /api/runs/:id`, `GET /api/notifications`,
`GET|POST /api/pages/:id/comments`, `GET|PUT /api/pages/:id/permissions`, `PUT /api/pages/:id/approval`,
`POST /api/change-requests/:id/approve|reject`, `GET /api/expiring`, `GET /api/snippets`, `GET /api/trash`, `GET /api/handbook`,
`GET /api/health`, `GET /metrics` (Prometheus).

## Backup & Wiederherstellung

Im Admin-Panel unter **Sicherung & Export**: „Jetzt sichern“ oder tägliche Sicherung mit Aufbewahrung.
Eine Sicherung (`/data/backups/*.tar.gz`) enthält alle Tabellen als JSON, alle Anhänge und eine lesbare
Markdown-Kopie. Die Wiederherstellung (aus der Liste oder per Upload) ersetzt den kompletten Stand; vorher
wird automatisch eine Sicherung des aktuellen Stands angelegt. **Wichtig:** Den Schlüssel (`SECRET_KEY` bzw.
`/data/secret.key`) getrennt aufbewahren – ohne ihn lassen sich Geheimnisse und 2FA nicht entschlüsseln.

Der **Git-Export** spiegelt zusätzlich alle Seiten als Markdown-Ordnerbaum in ein Repository
(HTTPS mit Token in der URL) – lesbar auch, wenn das Wiki selbst ausgefallen ist.

Klassisch auf Ebene von Datenbank und Volume:

```bash
# Datenbank
docker compose exec -T db pg_dump -U bastion -Fc bastion > bastion-$(date +%F).dump
# Anhänge
docker run --rm -v bastion_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .

# Wiederherstellen
docker compose exec -T db pg_restore -U bastion -d bastion --clean < bastion-2026-01-01.dump
```

Zusätzlich bietet das Admin-Panel (Wartung) einen JSON-Export aller Inhalte.

### Monitoring

`/metrics` liefert Prometheus-Metriken: Seiten, aktive Benutzer (mit 2FA), überfällige Reviews, tote Links,
laufende Durchläufe, Mail-Warteschlange, Zeitpunkt der letzten Sicherung und des letzten Git-Exports,
HTTP-Anfragen und -Latenzen, Datenbankgröße und Pool.

```yaml
- job_name: bastion
  authorization:
    credentials: <METRICS_TOKEN>
  static_configs:
    - targets: ['wiki.example.org']
```

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
  src/lib/              Auth, Berechtigungen, Sanitizing, Einstellungen, Audit, Verschlüsselung,
                        TOTP, LDAP/OIDC, Benachrichtigungen, Links, Sicherung, Git-Export, Metriken, Hintergrundjobs
  src/routes/           auth, spaces, pages, search, tags, attachments, templates, admin, imports,
                        secrets, runs, inventory, shares, activity, integrations, operations
  src/importers/        Confluence, Wiki.js, BookStack, MediaWiki, DokuWiki, Markdown/Notion + Writer
client/                 React-SPA (Vite)
  public/sw.js          Service Worker (PWA)
  src/components/       Layout, Seitenbaum, Befehlspalette, Editor (TipTap) …
  src/pages/            Wiki-Ansichten
  src/pages/admin/      Admin-Panel (inkl. Import)
  src/lib/i18n.js       Übersetzungen: deutsche Texte sind die Schlüssel,
  src/locales/en.js     englisches Wörterbuch
  src/styles/           Themes (Design-Tokens), Layout, Inhalte
```

## Sicherheit

- Passwörter mit bcrypt, Sitzungen als zufällige Tokens (nur SHA-256-Hash in der DB), `HttpOnly`/`SameSite=Lax`-Cookies
- Zwei-Faktor-Anmeldung (TOTP, RFC 6238) mit Einmal-Wiederherstellungscodes, optional als Pflicht
- Geheimnis-Blöcke, TOTP-Schlüssel, LDAP-/SMTP-Passwörter, OIDC-Secret, Webhook- und Git-URLs mit AES-256-GCM verschlüsselt
- LDAP: Eingaben im Filter werden maskiert, leere Passwörter abgelehnt (kein anonymer Bind); OIDC mit PKCE, `state` und `nonce`
- Freigabelinks laufen ab, sind widerrufbar, zeigen nur eine Seite und nie Geheimnisse
- CSRF-Schutz über Origin-Prüfung, Login-Rate-Limit, Content-Security-Policy via Helmet
- HTML wird serverseitig (sanitize-html) **und** clientseitig (DOMPurify) bereinigt
- API-Tokens werden nur gehasht gespeichert und sind einmalig sichtbar
- Uploads werden außerhalb des Webroots gespeichert, nur bekannte Typen inline ausgeliefert
- Audit-Log für Anmeldungen, Änderungen und Administration

## Lizenz

GPL-3.0 – siehe [LICENSE](LICENSE).
