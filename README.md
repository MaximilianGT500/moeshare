<div align="center">
  <a href="https://moeshare.eu"><img height="220" alt="MoeShare" src="https://moeshare.eu/assets/img/logo.png"></a>
  <h1>MoeShare</h1>
  <p>Dein eigener Uploader für ShareX: Dateien hochladen, schön teilen und alles im Browser verwalten.</p>

![GitHub Lizenz]
![GitHub Letzte Änderung]
[![Docker-Image]](https://github.com/MaximilianGT500/moeshare/pkgs/container/moeshare)
![GitHub Issues]
![GitHub Sterne]

</div>

[GitHub Lizenz]: https://img.shields.io/github/license/MaximilianGT500/moeshare?color=278c42&style=for-the-badge
[GitHub Letzte Änderung]: https://img.shields.io/github/last-commit/MaximilianGT500/moeshare?color=278c42&label=Letzte%20%C3%84nderung&style=for-the-badge
[Docker-Image]: https://img.shields.io/badge/Docker-ghcr.io-278c42?style=for-the-badge&logo=docker&logoColor=white
[GitHub Issues]: https://img.shields.io/github/issues/MaximilianGT500/moeshare?color=278c42&label=Issues&style=for-the-badge
[GitHub Sterne]: https://img.shields.io/github/stars/MaximilianGT500/moeshare?color=278c42&label=Sterne&style=for-the-badge

MoeShare nimmt Bilder, Videos, Audio und beliebige Dateien von ShareX, aus dem Browser oder per Link entgegen und macht daraus Links mit schöner Vorschau, auch in Discord. Eingerichtet wird alles im Browser: Beim ersten Start führt dich ein Assistent durch Admin-Konto und Einstellungen, eine `.env` brauchst du nicht.

Mehr zum Projekt, Screenshots und eine Kurzanleitung gibt es auf [moeshare.eu](https://moeshare.eu).

## Inhalt

- [Funktionen](#funktionen)
- [Installation](#installation)
- [Erster Start und Einrichtung](#erster-start-und-einrichtung)
- [ShareX verbinden](#sharex-verbinden)
- [Einstellungen und Umgebungsvariablen](#einstellungen-und-umgebungsvariablen)
- [Anmelden über andere Dienste](#anmelden-über-andere-dienste)
- [Startseite, Impressum und Links](#startseite-impressum-und-links)
- [Protokoll und Fehlerberichte](#protokoll-und-fehlerberichte)
- [Hinter einem Reverse-Proxy](#hinter-einem-reverse-proxy)
- [Update von einer älteren Version](#update-von-einer-älteren-version)
- [Datensicherung](#datensicherung)
- [Kommandozeile](#kommandozeile)
- [API](#api)
- [Entwicklung](#entwicklung)
- [Support, Mitwirken und Lizenz](#support-mitwirken-und-lizenz)

## Funktionen

- **Hochladen** per ShareX, Drag & Drop, Zwischenablage oder Link, mit Vorschaubildern, Video-Standbildern und optionalem HLS-Streaming
- **Ansichtsseiten** mit Bild-, Video- und Audioplayer, die sich nach den Farben der Datei richten
- **Embed Builder** mit Live-Vorschau: eine Standardvorlage für alle und auf Wunsch eigene Vorlagen pro Benutzer, mit Platzhaltern wie `{dateiname}` oder `{größe}`
- **Startseite** mit Statistiken und Upload-Verlauf, im Browser anpassbar oder abschaltbar
- **Anmeldung** mit Passwort, Zwei-Faktor per Authenticator-App und Passkeys, dazu über Discord, GitHub, Google, Microsoft, GitLab oder jeden OpenID-Connect-Anbieter wie Authentik, Keycloak oder Authelia
- **Benutzerverwaltung** mit Rollen, Speicherlimits, Einladungslinks, Sperren und Aktivitätsprotokoll
- **API-Tokens** für ShareX und Skripte, mehrere pro Konto und einzeln widerrufbar, die `.sxcu`-Datei gibt es per Klick
- **Impressum, Datenschutz und eigene Links** im Fuß jeder Seite, als Link oder direkt in MoeShare geschrieben
- **Datenschutz**: Standortdaten werden aus Fotos entfernt, bevor sie öffentlich erreichbar sind
- **Sicherheit**: strenge Content Security Policy, hochgeladene HTML- und SVG-Dateien laufen in einer Sandbox
- **Benachrichtigungen** über einen Discord-Webhook, wählbar nach Ereignis
- **Weboberfläche** mit Material You: Farben aus einer Grundfarbe, helles und dunkles Design, auf dem Handy genauso gut wie am PC

Für macOS und Linux funktionieren auch [Flameshot](https://flameshot.org/) (siehe [`config_flameshot.sh`](config_flameshot.sh)) und [MagicCap](https://magiccap.me/).

## Installation

MoeShare braucht **Node.js 20 oder neuer** oder Docker. Die Weboberfläche liegt fertig gebaut im Repository, ein eigener Build-Schritt ist nicht nötig.

### Mit Docker

Das Image liegt in der GitHub Container Registry unter `ghcr.io/maximiliangt500/moeshare` und läuft auf `amd64` und `arm64`, also auch auf dem Raspberry Pi. Für den Start reicht die [`docker-compose.yml`](docker-compose.yml):

```bash
mkdir moeshare && cd moeshare
curl -O https://raw.githubusercontent.com/MaximilianGT500/moeshare/main/docker-compose.yml
docker compose up -d
docker compose logs -f moeshare
```

In den Logs erscheint der Link zum Installationsassistenten. Datenbank und Uploads landen in den Ordnern `db/` und `uploads/` neben der `docker-compose.yml`.

Was der Stack mitbringt:

- **Eigener Benutzer**: MoeShare läuft im Container nicht als root. Beim Start bekommen `db/` und `uploads/` den Besitzer aus `PUID` und `PGID` (Standard `1000`). Passe beide an, wenn die Ordner auf dem Host einem anderen Benutzer gehören sollen.
- **Abgesichert**: schreibgeschütztes Dateisystem bis auf die beiden Ordner und `/tmp`, keine zusätzlichen Rechte (`no-new-privileges`, nur die nötigen Capabilities).
- **Health-Check** über `/healthz`, Docker zeigt den Zustand mit `docker compose ps`.
- **Logs** mit Rotation (3 × 10 MB) und Zeitzone aus `TZ`.
- **Sauberes Beenden**: laufende Uploads dürfen bis zu 20 Sekunden fertig werden.

Updates holst du mit:

```bash
docker compose pull
docker compose up -d
```

Zu jeder veröffentlichten Version gibt es neben `latest` eigene Tags wie `3.0.0`, `3.0` und `3`. Selbst bauen geht mit `docker build -t ghcr.io/maximiliangt500/moeshare:latest .` im geklonten Repository, `docker compose up -d` nimmt dann dieses Image.

### Mit Node.js

```bash
git clone https://github.com/MaximilianGT500/moeshare.git
cd moeshare
npm install
npm start
```

Für den Dauerbetrieb eignet sich [PM2](https://pm2.keymetrics.io/), auch im Cluster-Modus mit mehreren Prozessen:

```bash
npm install -g pm2
pm2 start index.js --name moeshare -i max
pm2 save
```

## Erster Start und Einrichtung

Solange es noch kein Konto gibt, zeigt MoeShare bei jedem Start einen Link mit Einrichtungscode in der Konsole:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MoeShare ist noch nicht eingerichtet. Öffne den Installationsassistenten: │
│                                                                          │
│   http://localhost:3000/setup?token=…                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

Läuft MoeShare auf einem anderen Rechner oder hinter einer Domain, ersetzt du `http://localhost:3000` durch die passende Adresse. Nur wer den Code kennt, kann das erste Konto anlegen. Der Link bleibt 30 Tage gültig und gilt auch nach einem Neustart.

Der Assistent führt durch:

1. **Systemprüfung** von Datenbank, Speicherordner, FFmpeg und Node.js
2. **Admin-Konto** mit Benutzername und Passwort
3. **Seite**: Name, öffentliche Adresse, Grundfarbe und Symbol
4. **Startseite**: Startseite mit Statistiken, direkt zur Anmeldung oder Weiterleitung auf eine andere Seite
5. **Uploads**: maximale Dateigröße, Speicher pro Konto und die Verarbeitung nach dem Hochladen
6. **Anmeldung**: wer ein Konto bekommt, Zwei-Faktor-Pflicht und Passkeys
7. **Benachrichtigungen** über einen Discord-Webhook, auf Wunsch mit Testnachricht
8. **Übersicht** und Abschluss

Danach bist du angemeldet und kannst direkt ein API-Token für ShareX mitnehmen. Alles lässt sich später unter **Admin › Einstellungen** ändern, dort richtest du auch Impressum, Datenschutz und die Anmeldung über andere Dienste ein.

## ShareX verbinden

Unter **Konto › ShareX und API** erstellst du ein Token und lädst die fertige `.sxcu`-Datei herunter. Ein Doppelklick darauf richtet ShareX ein. Bilder, Texte und Dateien gehen dann direkt zu MoeShare, die Links zum Ansehen, für die Vorschau und zum Löschen trägt ShareX selbst ein.

## Einstellungen und Umgebungsvariablen

Alle Einstellungen stehen in der Datenbank und werden unter **Admin › Einstellungen** geändert: Seite, Uploads, Anmeldung, Anmeldedienste, Rechtliches und Links, Benachrichtigungen und System. Änderungen gelten sofort, auch für alle Prozesse im PM2-Cluster.

Umgebungsvariablen sind nur noch optional. Du kannst sie als `.env` im Projektordner, in der `docker-compose.yml` oder direkt beim Start setzen:

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `3000` | Port, auf dem MoeShare lauscht |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` oder `error`. Mit `debug` steht jede Anfrage mit Dauer und Request-ID im Log. |
| `LOG_FORMAT` | `text` | `text` für die Konsole, `json` für Loki, Graylog, Elasticsearch und Co. |
| `NO_COLOR` / `FORCE_COLOR` | | Farben im Log abschalten oder erzwingen. Ohne Angabe gibt es Farben nur im Terminal. |
| `TZ` | Systemzeit | Zeitzone für die Zeitstempel im Log, etwa `Europe/Berlin` |
| `GLITCHTIP_DSN` | Projekt-GlitchTip | Ziel für Fehlerberichte, siehe [Protokoll und Fehlerberichte](#protokoll-und-fehlerberichte). `off` schaltet sie ganz ab. |
| `URL_FETCH_ALLOW_PRIVATE` | `false` | „Hochladen per Link“ darf auch Adressen im internen Netz abrufen. Nur im eigenen Netz einschalten. |
| `PUID` / `PGID` | `1000` | Nur Docker: Benutzer und Gruppe, denen `db/` und `uploads/` gehören |
| `DOMAIN` | | Nur Docker mit Caddy, siehe [Hinter einem Reverse-Proxy](#hinter-einem-reverse-proxy) |
| `UI_DEV_SERVER` | | Nur für die Entwicklung, siehe [Entwicklung](#entwicklung) |

## Anmelden über andere Dienste

Unter **Admin › Einstellungen › Anmeldedienste** schaltest du Discord, GitHub, Google, Microsoft, GitLab und einen eigenen OpenID-Connect-Anbieter frei. Für jeden Dienst legst du dort eine App an, trägst Client-ID und Client-Secret in MoeShare ein und hinterlegst beim Dienst die Redirect-Adresse, die MoeShare dir anzeigt. Sie hat immer die Form `https://deine-adresse/auth/<dienst>/callback`.

| Dienst | App anlegen | Hinweise |
| --- | --- | --- |
| Discord | [Developer Portal](https://discord.com/developers/applications) › OAuth2 | Optional nur für Mitglieder deines Servers, auch mit bestimmten Rollen. Die Mitgliedschaft kann eine Einladung ersetzen. |
| GitHub | Settings › Developer settings › OAuth Apps | Für GitHub Enterprise Server die eigene Adresse unter „GitHub-Adresse“ eintragen. |
| Google | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) › OAuth-Client-ID vom Typ Webanwendung | |
| Microsoft | [Entra Admin Center](https://entra.microsoft.com) › App-Registrierungen › Plattform Web | Mandant `common` für alle Konten, `organizations` nur für Arbeitskonten, `consumers` nur für private oder die ID deines Mandanten. |
| GitLab | Einstellungen › Anwendungen, vertraulich mit den Scopes `openid` und `profile` | Für eine eigene GitLab-Instanz deren Adresse eintragen. |
| OpenID Connect | Im Anbieter einen vertraulichen Client mit Authorization Code anlegen | Name für den Button frei wählbar. Als Issuer zum Beispiel `https://auth.example.com/application/o/moeshare/` (Authentik), `https://sso.example.com/realms/<realm>` (Keycloak), `https://auth.example.com` (Authelia, Pocket ID, Zitadel). |

MoeShare liest den OpenID-Connect-Anbieter über `/.well-known/openid-configuration` ein und nutzt PKCE, Nonce und State, sofern der Anbieter sie unterstützt.

Wer schon ein Konto hat, verknüpft Dienste unter **Konto › Sicherheit › Verbundene Konten** und meldet sich danach mit einem Klick an. Ein Konto kann mehrere Dienste haben, jedes Dienstkonto gehört aber nur zu einem MoeShare-Konto. Neue Konten über einen Dienst erlaubst du pro Dienst mit „Neue Konten mit …“, dabei gelten die Regeln unter **Anmeldung › Registrierung**, also offen, nur mit Einladung oder geschlossen. Ist Zwei-Faktor aktiv, fragt MoeShare auch nach der Anmeldung über einen Dienst nach dem Code.

## Startseite, Impressum und Links

Unter der Adresse ohne Pfad zeigt MoeShare auf Wunsch eine Startseite mit Dateien, Speicher, Aufrufen, Mitgliedern und den Uploads der letzten 14 Tage. Unter **Admin › Startseite** stellst du Überschrift, Text, die angezeigten Zahlen und den Upload-Verlauf ein. Eine Vorschau zeigt jede Änderung sofort. Schaltest du die Startseite ab, leitet die Adresse weiter: auf eine Seite deiner Wahl oder, ohne Ziel, zur Anmeldung bzw. ins Dashboard.

Impressum und Datenschutzerklärung trägst du unter **Admin › Einstellungen › Rechtliches und Links** ein, entweder als Link auf eine bestehende Seite oder als Text. Text zeigt MoeShare unter `/impressum` und `/datenschutz` an, Adressen und E-Mails werden dabei zu Links. Dort legst du auch bis zu acht eigene Links an, etwa zu deinem Discord-Server oder einer Status-Seite. Alle stehen im Fuß jeder Seite, auf der Startseite genauso wie bei der Anmeldung, im Dashboard und auf den Ansichtsseiten.

## Protokoll und Fehlerberichte

Im Textformat sieht das Log so aus:

```
2026-10-20 19:12:43 INFO  [server] MoeShare 3.0.0 läuft auf https://share.example.com port=3000 node=22.22.0 log=info
2026-10-20 19:12:43 INFO  [server] Aktiv: Vorschaubilder, Standortdaten entfernen, Hauptfarbe, Startseite, Passkeys, Anmeldung mit GitHub
2026-10-20 19:13:02 INFO  [upload] Datei hochgeladen user=max file=aB3dE9.png size="1,2 MB" via=api
2026-10-20 19:14:10 WARN  [audit] Anmeldung fehlgeschlagen user=max ip=203.0.113.7 method=password
2026-10-20 19:15:31 ERROR [http] POST /upload ist fehlgeschlagen: EACCES: permission denied … id=Xk2v9QpL
```

Bei einem unerwarteten Fehler bekommt der Besucher eine Fehler-ID angezeigt, die du im Log unter `id=` wiederfindest. Leitet ein Reverse-Proxy eine `X-Request-Id` weiter, übernimmt MoeShare sie.

Fehlgeschlagene Anmeldungen stehen mit IP-Adresse im Log, solange unter **System** „IP-Adressen speichern“ an ist. Damit lässt sich zum Beispiel fail2ban füttern:

```ini
[Definition]
failregex = ^.* WARN  \[(audit|auth)\] Anmeldung fehlgeschlagen .*ip=<HOST>
```

Unter **Admin › Einstellungen › System** kannst du erlauben, dass MoeShare Fehlermeldungen und vom Browser blockierte Inhalte an das [GlitchTip](https://glitchtip.com) des Projekts schickt. Das ist anfangs aus. Vor dem Senden werden Benutzernamen, IP-Adressen, E-Mail-Adressen, Dateinamen, Tokens und lokale Pfade entfernt, gleiche Fehler gehen höchstens alle zehn Minuten raus. Mit `GLITCHTIP_DSN` schickst du die Berichte an ein eigenes GlitchTip oder Sentry, mit `GLITCHTIP_DSN=off` schaltest du sie unabhängig von der Einstellung ab.

## Hinter einem Reverse-Proxy

Für den Betrieb im Internet gehört MoeShare hinter einen Reverse-Proxy mit HTTPS. Passkeys funktionieren nur über HTTPS oder `localhost`.

Die `docker-compose.yml` bringt dafür Caddy mit, das Zertifikate selbst holt. Leg neben der `docker-compose.yml` eine `.env` mit deiner Domain an und lade die [`Caddyfile`](docker/Caddyfile) in den Ordner `docker/`:

```bash
mkdir -p docker
curl -o docker/Caddyfile https://raw.githubusercontent.com/MaximilianGT500/moeshare/main/docker/Caddyfile
echo "DOMAIN=share.example.com" > .env
docker compose --profile caddy up -d
```

Die Domain muss auf deinen Server zeigen und die Ports 80 und 443 müssen frei sein.

Ohne Docker reicht in Caddy:

```
share.example.com {
  reverse_proxy localhost:3000
}
```

Mit nginx:

```nginx
server {
  server_name share.example.com;
  client_max_body_size 0;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
  }
}
```

Danach unter **Admin › Einstellungen** die Adresse auf `https://share.example.com` setzen und unter **System** „Hinter einem Reverse-Proxy“ einschalten.

## Update von einer älteren Version

1. MoeShare stoppen und eine Sicherung von `db/` und `uploads/` anlegen.
2. Den neuen Stand holen (`git pull` oder `docker compose pull`).
3. `npm install` ausführen (bei Docker übernimmt das das Image).
4. MoeShare starten.

Beim ersten Start sichert MoeShare die Datenbank automatisch nach `db/backups/` und bringt sie auf den neuen Stand. Bestehende Discord-Verknüpfungen bleiben dabei erhalten. Werte aus einer alten `.env` (zum Beispiel `SITE_TITLE` oder `MAX_FILE_SIZE_MB`) werden einmalig übernommen, danach meldet das Log, welche Variablen du entfernen kannst. Bisherige ShareX-Tokens funktionieren weiter. Für Konten aus älteren Versionen ist zunächst auch die Anmeldung mit dem Token möglich, damit sich alle ein Passwort setzen können. Unter **Admin › Einstellungen › Anmeldung** schaltest du das ab.

Stand in der alten `.env` eine `REDIRECT_URL`, leitet die Adresse ohne Pfad weiter wie bisher. Die neue Startseite schaltest du unter **Admin › Startseite** ein. Datenbanken, die einmal aus PostgreSQL umgewandelt wurden (Tabellen mit `public.` im Namen), passt MoeShare beim Start selbst an.

Läuft MoeShare bei dir mit einem älteren Docker-Image, trägst du in der `docker-compose.yml` `ghcr.io/maximiliangt500/moeshare:latest` ein oder nimmst gleich die neue Datei aus dem Repository. Die Ordner `db/` und `uploads/` bleiben gleich.

## Datensicherung

Sichere regelmäßig diese Ordner:

- `db/` mit der Datenbank und der Schlüsseldatei `db/.secret`. Ohne die Schlüsseldatei lassen sich Zwei-Faktor-Einstellungen nicht mehr lesen.
- `uploads/` mit allen Dateien.

## Kommandozeile

| Befehl | Zweck |
| --- | --- |
| `npm run register` | Konto anlegen und ein ShareX-Token ausgeben |
| `npm run token` | Neues API-Token nach Benutzername und Passwort |
| `npm run reset` | Notfallzugang: Passwort, Rolle, Sperre, Zwei-Faktor, Passkeys oder Tokens zurücksetzen |

Mit Docker heißen die Befehle `docker compose exec moeshare moeshare register`, `… moeshare token` und `… moeshare reset`. Sie laufen dort mit dem Benutzer, dem die Datenbank gehört. Legst du das erste Konto mit `register` an, ist der Installationsassistent nicht mehr nötig und die Einstellungen machst du danach im Browser.

## API

Skripte und Uploader melden sich mit einem API-Token im Header `Authorization` an.

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| `POST` | `/upload` | Datei im Formularfeld `file` hochladen. Antwort: `{ success, file, view, preview, delete }` |
| `GET` | `/files` | Dateinamen des eigenen Kontos, neueste zuerst |
| `DELETE` | `/file/:dateiname` | Eigene Datei löschen |

Öffentlich erreichbar sind `/view/:dateiname` (Ansichtsseite), `/download/:dateiname`, `/uploads/:benutzer/:dateiname` (die Datei selbst), `/oembed/:dateiname`, `/api/home` (Statistiken der Startseite), `/impressum`, `/datenschutz` und `/healthz` für Health-Checks.

```bash
curl -H "Authorization: ms_…" -F "file=@bild.png" https://share.example.com/upload
```

## Entwicklung

```bash
npm install
npm run build
npm run dev:ui
UI_DEV_SERVER=http://localhost:5173 npm start
```

`npm run build` baut die Weboberfläche aus `client/` nach `public/app`. Mit `npm run dev:ui` und `UI_DEV_SERVER` lädt die Oberfläche Änderungen sofort neu. `npm run typecheck` prüft den TypeScript-Code, die Formatierung folgt der `.prettierrc.json`.

| Ordner | Inhalt |
| --- | --- |
| `src/routes` | Seiten und API, nach Bereichen getrennt |
| `src/services` | Logik für Benutzer, Dateien, Einstellungen, Anmeldung und mehr |
| `src/lib` | Datenbank, Migrationen, Protokoll, Medienverarbeitung und Hilfsfunktionen |
| `src/middleware` | Anmeldung, Sicherheitsregeln, Request-IDs und Fehlerbehandlung |
| `client/src` | Weboberfläche mit React und Material UI |
| `views/app.ejs` | HTML-Gerüst, in das die Oberfläche geladen wird |
| `docker/` | Startskript, Kommandozeile und Caddyfile für das Docker-Image |
| `cli.js` | Befehle für die Kommandozeile |

## Support, Mitwirken und Lizenz

Fehler und Ideen gerne als [Issue](https://github.com/MaximilianGT500/moeshare/issues/new) oder Pull Request, siehe [CONTRIBUTING.md](CONTRIBUTING.md). Kontakt gibt es auch über meine [Website](https://maxi.lol/kontakt/).

Teile der ursprünglichen README und der `docker-compose.yml` stammen von [ass](https://github.com/tycrek/ass).

MoeShare steht unter der [MIT-Lizenz](LICENSE).
