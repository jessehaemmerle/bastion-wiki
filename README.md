# Bastion

**Das selbst gehostete Wiki für IT-Betrieb und Systemadministration.**
Runbooks, Server-Datenblätter, Netzpläne, Zertifikatsfristen und Notfallhandbuch an einem Ort –
mit Docker in wenigen Minuten gestartet, Daten in PostgreSQL, als App (PWA) installierbar.

**Deutsch** · [English](README_en.md)

![Stack](https://img.shields.io/badge/stack-Node%2022%20·%20React%2019%20·%20PostgreSQL%2016-1f5f99)
![Lizenz](https://img.shields.io/badge/Lizenz-GPL--3.0-f2c200)
![Sprachen](https://img.shields.io/badge/Oberfläche-Deutsch%20·%20Englisch-555)

![Startseite mit letzten Änderungen, laufenden Durchläufen und Fristen](docs/screenshots/de/dashboard.png)

## Inhalt

- [Warum Bastion?](#warum-bastion)
- [Screenshots](#screenshots)
- [Schnellstart](#schnellstart)
- [Funktionen](#funktionen)
- [Konfiguration](#konfiguration)
- [Anmeldung über LDAP und SSO](#anmeldung-über-ldap-und-sso)
- [Import aus anderen Wikis](#import-aus-anderen-wikis)
- [Berechtigungen](#berechtigungen)
- [Sicherung, Update und Monitoring](#sicherung-update-und-monitoring)
- [REST-API](#rest-api)
- [Entwicklung](#entwicklung)
- [Sicherheit](#sicherheit)

## Warum Bastion?

Allgemeine Wikis kennen Seiten und Ordner. Ein Betriebsteam braucht mehr:

- **Seiten mit Struktur** – Hosts, Services, Netze, Runbooks und Incidents als eigene Seitentypen mit
  Datenblatt (IP, Standort, Verantwortliche …), das durchsuchbar ist und als Inventar-Tabelle erscheint.
- **Doku, die nicht veraltet** – Review-Termine, Fristen für Zertifikate, Lizenzen und Garantien,
  Erinnerungen per Glocke, E-Mail oder Chat.
- **Runbooks, die man ausführt** – Schritt für Schritt abhaken, mit Notizen, Protokoll und mehreren Personen gleichzeitig.
- **Geheimnisse dort, wo sie gebraucht werden** – verschlüsselte Passwort-Blöcke direkt auf der Seite,
  jedes Anzeigen im Audit-Log.
- **Bereit für den Ernstfall** – Notfallhandbuch als PDF, Git-Export und Sicherungen, damit die Doku
  auch dann lesbar bleibt, wenn das Wiki selbst ausfällt.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/de/page.png" alt="Host-Seite mit Datenblatt"><br><sub><b>Host-Seite</b> – Datenblatt mit Garantie-Frist, Review-Hinweis und Platzhaltern für Befehle</sub></td>
    <td width="50%"><img src="docs/screenshots/de/runbook-dark.png" alt="Runbook im dunklen Modus"><br><sub><b>Runbook</b> im dunklen Modus – Codeblöcke mit Kopieren-Knopf, Callouts, Inhaltsverzeichnis</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/de/editor.png" alt="WYSIWYG-Editor mit Slash-Menü"><br><sub><b>Editor</b> – WYSIWYG mit Slash-Menü, Tabellen, Checklisten, Geheimnissen und Bausteinen</sub></td>
    <td><img src="docs/screenshots/de/search.png" alt="Befehlspalette mit Suchergebnissen"><br><sub><b>Suche</b> – Befehlspalette (<kbd>Strg</kbd>+<kbd>K</kbd>) über Titel, Inhalt und Datenblätter</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/de/run.png" alt="Laufender Checklisten-Durchlauf"><br><sub><b>Durchlauf</b> – Runbook oder Checkliste ausführen, mit Notizen und Verlauf</sub></td>
    <td><img src="docs/screenshots/de/deadlines.png" alt="Fristen-Übersicht"><br><sub><b>Fristen</b> – ablaufende Zertifikate, Lizenzen, Garantien und fällige Reviews</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/de/diagram.png" alt="Netzwerkseite mit Mermaid-Diagramm"><br><sub><b>Diagramme</b> – Mermaid-Netzpläne direkt im Text, mit Live-Vorschau im Editor</sub></td>
    <td><img src="docs/screenshots/de/admin.png" alt="Admin-Panel Systemstatus"><br><sub><b>Admin-Panel</b> – Systemstatus, Benutzer, Rechte, SSO, Sicherung und mehr</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/de/theme-dark.png" alt="Theme VT220"><br><sub><b>Themes</b> – sechs Farbwelten (hier „VT220“), jeweils hell oder dunkel</sub></td>
    <td align="center"><img src="docs/screenshots/de/mobile.png" alt="Mobile Ansicht" width="220"><br><sub><b>Mobil</b> – responsiv und als PWA installierbar, Offline-Lesen inklusive</sub></td>
  </tr>
</table>

## Schnellstart

Voraussetzung: Docker mit Compose-Plugin.

```bash
git clone <repo-url> bastion && cd bastion
cp .env.example .env            # mindestens POSTGRES_PASSWORD setzen
docker compose up -d --build
docker compose logs app         # zeigt das Admin-Passwort, falls ADMIN_PASSWORD leer ist
```

Danach läuft das Wiki unter <http://localhost:8080> (Port über `BASTION_PORT` änderbar).
Beim ersten Start legt Bastion einen Administrator, Vorlagen, Datenblatt-Schemas und – abschaltbar mit
`SEED_DEMO_CONTENT=false` – einige Beispielbereiche an. Mit `DEFAULT_LANGUAGE=en` startet alles auf Englisch.

<details>
<summary>Nur das Image bauen und mit eigener Datenbank betreiben</summary>

```bash
docker build -t bastion-wiki .
docker run -d -p 8080:3000 \
  -e DATABASE_URL=postgres://user:pass@db-host:5432/bastion \
  -e ADMIN_PASSWORD='geheim123' \
  -v bastion_uploads:/data \
  bastion-wiki
```

Die Datenbank braucht PostgreSQL ≥ 13 mit den Erweiterungen `pg_trgm` und `unaccent`.
</details>

## Funktionen

### Schreiben und strukturieren

- **WYSIWYG-Editor** (TipTap) mit Slash-Menü (`/`), Markdown-Kürzeln, Bubble-Menü, Tabellen, Checklisten,
  Bildern per Drag & Drop oder Einfügen, `Strg+S` zum Speichern und lokaler Entwurfssicherung.
- **Codeblöcke** mit Syntax-Highlighting (Bash, PowerShell, YAML, Nginx, Dockerfile, SQL u. v. m.) und
  **Platzhaltern** wie `{{Hostname}}`, die einmal ausgefüllt (oder aus dem Datenblatt übernommen) und fertig kopiert werden.
- **Callouts** (Info, Tipp, Warnung, Gefahr, Erfolg), **Mermaid-Diagramme** mit Live-Vorschau.
- **Bereiche** mit eigener Farbe, eigenem Symbol und eigenen Rechten; Seitenbaum mit Drag & Drop.
- **Seitentypen und Vorlagen** für Runbooks, Incident-Postmortems, Server/Hosts, Changes, Services,
  Netzsegmente und Checklisten – auf Deutsch und Englisch.
- **Datenblätter**: freie Eigenschaften oder ein **Schema** pro Seite mit typisierten Feldern
  (Text, Zahl, Datum, Auswahl, URL, IP, E-Mail, Ja/Nein), Pflichtfeldern und überwachten Ablaufdaten.
- **Bausteine**: wiederverwendbare Textblöcke, an einer Stelle gepflegt und auf vielen Seiten eingebunden.
- **Versionsverlauf** mit Diff und Wiederherstellung, **Anhänge**, Export als Markdown oder HTML.

### Im Betriebsalltag

- **Runbook-Durchläufe**: Schritte abhaken, Notizen je Schritt, Verlauf, mehrere Personen gleichzeitig,
  Protokoll als Markdown.
- **Fristen**: Zertifikate, Lizenzen, Verträge, Garantien und Review-Termine in einer Liste, mit Erinnerung
  vor Ablauf. Erkannt werden Schema-Felder mit „Ablauf überwachen“ und freie Felder wie „Gültig bis“
  (auch im Format TT.MM.JJJJ).
- **Review-Termine** gegen veraltete Doku, „Zu prüfen“-Liste und Markierung im Seitenbaum.
- **Inventar**: Hosts, Services und Netze als filterbare Tabelle mit CSV-Export. Jede Seite zeigt
  „Verlinkt von“, „Erwähnt in“ (Hostname/IP wird im Text gefunden) und „Erwähnte Systeme“.
- **Geheimnis-Blöcke** für Passwörter, Schlüssel und Tokens: AES-256-GCM-verschlüsselt, nicht in Suche,
  Export oder Verlauf, nur mit Schreibrecht anzeigbar, jedes Anzeigen im Audit-Log.
- **Notfallhandbuch**: ausgewählte Bereiche als druckfertiges Dokument mit Deckblatt, Inhaltsverzeichnis,
  Datenblättern und Diagrammen – „Als PDF speichern“, Geheimnisse optional im Klartext (protokolliert).
- **Suche** über Titel, Inhalt und Datenblätter (PostgreSQL-Volltext + Trigramm-Ähnlichkeit) mit Filtern
  `tag:`, `space:`, `type:` und Befehlspalette (`Strg+K`).

### Zusammenarbeit

- **Kommentare** mit Antworten, **@Erwähnungen** und „erledigt“.
- **Freigabe-Workflow** pro Seite: Änderungen werden zum Vorschlag, eine zweite Person oder Gruppe gibt
  frei (Vier-Augen-Prinzip, mit Diff). Übernommen wird genau die geprüfte Fassung.
- **Benachrichtigungen** für beobachtete Seiten und Bereiche: im Wiki, gebündelt per **E-Mail** und per
  **Webhook** an Slack/Mattermost, Microsoft Teams, Matrix, Discord oder als JSON.
- Hinweis, wenn jemand dieselbe Seite gerade bearbeitet; Favoriten und „Zuletzt angesehen“.
- **Freigabelinks** mit Ablaufdatum zum Lesen ohne Konto, z. B. für Dienstleister.
- **Papierkorb** mit Wiederherstellung samt Versionen, Anhängen, Kommentaren und Geheimnissen.

### Zugriff und Verwaltung

- **Rechte** auf drei Ebenen: globale Rolle, Bereich (Standardzugriff + Personen/Gruppen) und optional
  **pro Seite** – vererbt an Unterseiten und beim Verschieben erhalten.
- **Anmeldung** lokal, über **LDAP / Active Directory** oder **OpenID Connect** (Entra ID, Keycloak,
  Authentik, Okta …), Gruppen-Abgleich bei jeder Anmeldung, **Zwei-Faktor-Anmeldung (TOTP)** optional als Pflicht.
- **Admin-Panel** unter `/admin`: Systemstatus, Benutzer, Gruppen, Bereiche & Rechte, Anmeldung & Sicherheit,
  Vorlagen, Datenblätter, Tags, Link-Prüfung, Freigabelinks, Import, Branding & Theming,
  Benachrichtigungen, Sicherung & Export, Audit-Log, Wartung.
- **Sicherungen** (manuell oder täglich) mit Wiederherstellung im Browser, **Git-Export** als Markdown,
  **Link-Prüfung**, **Prometheus-Metriken**, **REST-API** mit persönlichen Tokens, **Audit-Log**.

### Aussehen

- Eigenständige Gestaltung in RAL-Farben mit Seitentypen als Beschriftungsband, Schriften
  Atkinson Hyperlegible und Overpass Mono.
- Sechs Themes (Rack, Leitstand, Blueprint, VT220, Nord, Solarized), jeweils hell, dunkel oder nach System.
- Name, Untertitel, Standard-Theme, Akzentfarbe, Ankündigungsbanner und eigenes CSS im Admin-Panel;
  Theme, Modus, Akzent und Schrift kann jede Person selbst wählen. Kontraste nach WCAG AA geprüft.
- Oberfläche auf **Deutsch und Englisch**, umschaltbar pro Person.
- **PWA**: installierbar, App-Shell-Cache und Offline-Lesen zuletzt besuchter Seiten.

## Konfiguration

Alle Einstellungen kommen aus der `.env` (Vorlage: [`.env.example`](.env.example)).

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | – | Passwort der Datenbank (Compose), **Pflicht** |
| `POSTGRES_DB` / `POSTGRES_USER` | `bastion` | Name und Benutzer der Datenbank |
| `DATABASE_URL` | – | Vollständige Postgres-URL statt der `POSTGRES_*`-Variablen (eigene Datenbank) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL` | `admin` / zufällig / – | Erster Administrator, nur wenn noch kein Benutzer existiert |
| `BASTION_PORT` | `8080` | Port auf dem Host (Compose) |
| `PORT` | `3000` | Port im Container |
| `DATA_DIR` | `/data` | Anhänge, Sicherungen und Schlüsseldatei (als Volume mounten) |
| `COOKIE_SECURE` | `false` | `true`, sobald per HTTPS ausgeliefert wird |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Vertrauenswürdige Reverse Proxys für korrekte Client-IPs |
| `SESSION_DAYS` | `14` | Gültigkeit einer Anmeldung |
| `MAX_UPLOAD_MB` | `25` | Maximale Größe pro Datei |
| `IMPORT_MAX_MB` | `1024` | Maximale Größe einer Import-Datei oder hochgeladenen Sicherung |
| `SEED_DEMO_CONTENT` | `true` | Beispielinhalte beim ersten Start |
| `DEFAULT_LANGUAGE` | `de` | Standardsprache (`de` oder `en`) für Oberfläche und Beispielinhalte |
| `SECRET_KEY` | – | Schlüssel für Geheimnisse, 2FA und gespeicherte Passwörter. Leer = wird einmalig erzeugt und als `/data/secret.key` abgelegt. **Mit den Sicherungen aufbewahren** |
| `PUBLIC_URL` | – | Öffentliche Adresse für Links in E-Mails/Webhooks, Git-Export und OIDC (auch im Admin-Panel einstellbar) |
| `METRICS_TOKEN` | – | Bearer-Token für `/metrics`; ohne Token nur mit Admin-Anmeldung |
| `TZ` | `Europe/Berlin` | Zeitzone, u. a. für die tägliche Sicherung |

Alles Weitere – Branding, Standard-Theme, Registrierung, Review-Intervall, Papierkorb-Dauer, LDAP, OIDC,
2FA-Pflicht, SMTP, Webhooks, Sicherungsplan und Git-Export – wird im Admin-Panel eingestellt.
Passwörter und Tokens werden dort verschlüsselt gespeichert und nicht wieder angezeigt.

### Hinter einem Reverse Proxy

Beispiel mit Caddy:

```
wiki.example.com {
  reverse_proxy localhost:8080
}
```

Danach `COOKIE_SECURE=true` und `PUBLIC_URL=https://wiki.example.com` setzen. Für PWA und Service Worker
ist HTTPS nötig (außer auf `localhost`).

## Anmeldung über LDAP und SSO

Unter **Administration → Anmeldung & Sicherheit**:

- **LDAP / Active Directory:** Server (`ldaps://dc01.corp.local:636`), Dienstkonto, Suchbasis und Filter
  eintragen und mit „Verbindung testen“ prüfen (optional mit Testbenutzer). Gruppen werden Rollen zugeordnet,
  eine pro Zeile, als DN oder Name. Mit der Standardrolle „Kein Zugang“ kommen nur Mitglieder dieser Gruppen hinein.
- **OpenID Connect:** die angezeigte Redirect-URI (`…/api/auth/oidc/callback`) beim Identitätsanbieter
  registrieren, Issuer-URL, Client-ID und -Secret eintragen und den Claim `groups` freigeben.
- Wiki-Gruppen mit einem **externen Namen** (Administration → Gruppen) werden bei jeder Anmeldung mit der
  Verzeichnis- bzw. SSO-Gruppe abgeglichen.
- Lokale Konten bleiben als Notfallzugang erhalten: `/login?local=1`, auch wenn das Formular ausgeblendet ist.

## Import aus anderen Wikis

Unter **Administration → Import** Quelle wählen, Export hochladen (oder API-Zugang angeben) und die Vorschau
mit Seitenstruktur, Dateien und Hinweisen prüfen. Geschrieben wird erst nach Bestätigung.

| Quelle | So exportieren | Was übernommen wird |
| --- | --- | --- |
| Confluence | Bereichseinstellungen → Inhaltswerkzeuge → Exportieren → HTML | Hierarchie, Code-Makros, Info-/Warn-Panels, Aufgaben, Expand, Tabellen, Anhänge |
| Wiki.js | API-Schlüssel **oder** ZIP der Git-/Dateisystem-Speicherung | Pfade als Hierarchie, Tags, Datum, `{.is-info}`-Hinweise, Assets |
| BookStack | API-Token **oder** Buch → Exportieren → Portable ZIP | Bücher, Kapitel, Seiten, Tags (mit Werten als Eigenschaften), Bilder, Anhänge |
| MediaWiki | Spezial:Exportieren bzw. `dumpBackup.php --current`, optional `images/` als ZIP | Wikitext, Unterseiten, Kategorien als Tags |
| DokuWiki | ZIP des `data/`-Ordners | Namensräume, `start`-Seiten, Medien, `<note>`-Boxen, Code, Tabellen |
| Notion | Exportieren → Markdown & CSV | Hierarchie und Bilder (Datenbanken werden übersprungen) |
| Markdown / HTML | ZIP eines Obsidian-Vaults, MkDocs-Projekts, GitHub-Wikis … | Ordner, Front Matter, `[[Wikilinks]]`, Callouts, Bilder |

Ziel ist ein neuer Bereich, ein Bereich je Gruppe (Confluence-Bereich, BookStack-Buch …) oder ein bestehender
Bereich. Gleichnamige Seiten werden übersprungen, als neue Version gespeichert oder zusätzlich angelegt –
Importe lassen sich so wiederholen. API-Zugangsdaten werden nicht gespeichert.

## Berechtigungen

1. **Rolle** (global): *Administrator* darf alles, *Redakteur* legt Bereiche an und schreibt in freigegebenen
   Bereichen, *Betrachter* liest höchstens.
2. **Standardzugriff des Bereichs** für alle angemeldeten Personen (kein / lesen / schreiben).
3. **Explizite Rechte** für Personen oder Gruppen (Lesen / Schreiben / Verwalten).
4. **Seitenrechte** (optional): Eine eingeschränkte Seite und ihre Unterseiten sehen nur die eingetragenen
   Personen und Gruppen – höchstens mit dem Recht, das der Bereich gibt. Wird eine Seite aus einem
   eingeschränkten Bereich verschoben, nimmt sie die Einschränkung mit.

Es gilt die höchste Stufe aus 2 und 3, begrenzt durch 1 und 4. Verwalter eines Bereichs und Administratoren
behalten immer Zugriff. Geprüft wird serverseitig in den SQL-Funktionen `space_access()` und `page_access()`,
sodass Listen, Suche, Seitenbaum, Benachrichtigungen, Webhooks und Exporte nie Inhalte ohne Zugriff zeigen.

## Sicherung, Update und Monitoring

**Sicherungen** (Administration → Sicherung & Export): „Jetzt sichern“ oder täglich mit Aufbewahrung.
Eine Sicherung (`/data/backups/*.tar.gz`) enthält alle Tabellen, alle Anhänge und eine lesbare Markdown-Kopie.
Die Wiederherstellung ersetzt den kompletten Stand; vorher wird automatisch der aktuelle Stand gesichert.
**Den Schlüssel (`SECRET_KEY` bzw. `/data/secret.key`) getrennt aufbewahren** – ohne ihn lassen sich
Geheimnisse und 2FA nicht entschlüsseln.

Der **Git-Export** spiegelt die Seiten als Markdown-Ordnerbaum in ein Repository, damit die Doku auch bei
einem Ausfall lesbar bleibt. Seiten mit Seitenrechten werden nicht exportiert.

Klassisch auf Ebene von Datenbank und Volume:

```bash
docker compose exec -T db pg_dump -U bastion -Fc bastion > bastion-$(date +%F).dump
docker run --rm -v bastion_uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

**Update:** neuen Stand holen und neu bauen – Datenbank-Migrationen laufen beim Start automatisch.

```bash
git pull && docker compose up -d --build
```

**Monitoring:** `/metrics` liefert Prometheus-Metriken (Seiten, aktive Benutzer und 2FA, überfällige Reviews,
tote Links, laufende Durchläufe, Mail-Warteschlange, letzte Sicherung und letzter Git-Export,
HTTP-Anfragen und Latenzen, Datenbankgröße). `/api/health` eignet sich für Healthchecks.

```yaml
- job_name: bastion
  authorization:
    credentials: <METRICS_TOKEN>
  static_configs:
    - targets: ['wiki.example.org']
```

## REST-API

Alles, was die Oberfläche kann, geht auch über `/api`. Einen Token gibt es unter **Einstellungen → API-Tokens**.

```bash
export BASTION=https://wiki.example.com BASTION_TOKEN=bst_...

# Suchen (gleiche Syntax wie in der Oberfläche)
curl -H "Authorization: Bearer $BASTION_TOKEN" "$BASTION/api/search?q=tag:runbook%20nginx"

# Host-Seite anlegen
curl -X POST -H "Authorization: Bearer $BASTION_TOKEN" -H "Content-Type: application/json" \
  -d '{"spaceId":1,"title":"srv-db-02","pageType":"host","properties":{"IP-Adresse":"10.0.10.42"},"tags":["server"],"content":"<p>Automatisch angelegt</p>"}' \
  "$BASTION/api/pages"

# Seite als Markdown exportieren
curl -H "Authorization: Bearer $BASTION_TOKEN" "$BASTION/api/pages/1/export?format=md"
```

<details>
<summary>Wichtige Endpunkte</summary>

| Bereich | Endpunkte |
| --- | --- |
| Bereiche & Seiten | `GET /api/spaces`, `GET /api/spaces/:key`, `GET\|POST /api/pages`, `GET\|PUT\|DELETE /api/pages/:id`, `POST /api/pages/:id/move`, `GET /api/pages/:id/revisions`, `POST /api/pages/:id/attachments` |
| Suche & Inventar | `GET /api/search`, `GET /api/tags`, `GET /api/inventory?type=host`, `GET /api/pages/:id/related`, `GET /api/expiring` |
| Betrieb | `GET\|POST /api/pages/:id/runs`, `PATCH /api/runs/:id`, `GET /api/handbook`, `GET /api/snippets`, `GET /api/trash` |
| Zusammenarbeit | `GET\|POST /api/pages/:id/comments`, `GET /api/notifications`, `GET\|PUT /api/pages/:id/permissions`, `PUT /api/pages/:id/approval`, `POST /api/change-requests/:id/approve\|reject` |
| System | `GET /api/health`, `GET /metrics` |
</details>

## Entwicklung

Voraussetzungen: Node.js ≥ 20 und PostgreSQL ≥ 13 mit `pg_trgm` und `unaccent`.

```bash
# Backend (Port 3001)
cd server && npm install
DATABASE_URL=postgres://bastion:bastion@localhost:5432/bastion ADMIN_PASSWORD=admin12345 \
  PORT=3001 DATA_DIR=./data npm run dev

# Frontend mit Hot Reload (Port 5173, leitet /api an 3001 weiter)
cd client && npm install && npm run dev
```

```
server/                Express-API (Node 22, ESM)
  src/db/migrations/   SQL-Migrationen, laufen beim Start automatisch
  src/db/seed*.js      Administrator, Vorlagen, Schemas und Beispielinhalte
  src/lib/             Rechte, Sanitizing, Verschlüsselung, TOTP, LDAP/OIDC, Benachrichtigungen,
                       Freigaben, Papierkorb, Sicherung, Git-Export, Metriken, Hintergrundjobs
  src/routes/          REST-Endpunkte
  src/importers/       Confluence, Wiki.js, BookStack, MediaWiki, DokuWiki, Markdown/Notion
client/                React-SPA (Vite)
  public/sw.js         Service Worker (PWA)
  src/components/      Layout, Seitenbaum, Befehlspalette, Editor (TipTap) …
  src/pages/           Wiki-Ansichten, src/pages/admin/ für das Admin-Panel
  src/lib/i18n.js      Übersetzung: deutsche Texte sind die Schlüssel,
  src/locales/en.js    englisches Wörterbuch
  src/styles/          Themes (Design-Tokens), Layout, Inhalte
docs/screenshots/      Bilder für dieses README
```

## Sicherheit

- Passwörter mit bcrypt; Sitzungen als Zufallstoken (nur der SHA-256-Hash liegt in der Datenbank),
  Cookies `HttpOnly` und `SameSite=Lax`.
- Zwei-Faktor-Anmeldung (TOTP, RFC 6238) mit Einmal-Wiederherstellungscodes und Versuchsbegrenzung.
- Geheimnis-Blöcke, TOTP-Schlüssel, LDAP-/SMTP-Passwörter, OIDC-Secret, Webhook- und Git-URLs mit
  AES-256-GCM verschlüsselt.
- LDAP-Filter werden maskiert, leere Passwörter abgelehnt; OIDC mit PKCE, `state` (an den Browser gebunden)
  und `nonce`.
- CSRF-Schutz über Origin-Prüfung, Login-Rate-Limit, Content-Security-Policy.
- HTML wird serverseitig (sanitize-html) **und** im Browser (DOMPurify) bereinigt.
- Seitenrechte gelten auch für Suche, Benachrichtigungen, Webhooks, Papierkorb und Git-Export.
- Freigabelinks laufen ab, sind widerrufbar und zeigen nie Geheimnisse; API-Tokens werden nur gehasht gespeichert.
- Audit-Log für Anmeldungen, Änderungen, angezeigte Geheimnisse und Administration.

## Lizenz

GPL-3.0 – siehe [LICENSE](LICENSE).
