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

MoeShare nimmt Bilder, Videos, Audio, Texte und beliebige Dateien von ShareX, aus dem Browser oder per Link entgegen und macht daraus Links mit schöner Vorschau, auch in Discord. Dazu kürzt es lange Adressen und sammelt Dateien in Alben. Jede Person gestaltet ihre Vorschauseiten selbst und kann eine eigene Domain verbinden. Eingerichtet wird alles im Browser: Beim ersten Start führt dich ein Assistent durch Datenbank, Admin-Konto und Einstellungen, eine `.env` brauchst du nicht.

Mehr zum Projekt, Screenshots und eine Kurzanleitung gibt es auf [moeshare.eu](https://moeshare.eu), ausprobieren kannst du MoeShare in der [Demo](https://v3.moeshare.eu). Was sich in jeder Version geändert hat, steht im [Changelog](https://moeshare.eu/changelog.html).

## Inhalt

- [Funktionen](#funktionen)
- [Installation](#installation)
- [Erster Start und Einrichtung](#erster-start-und-einrichtung)
- [ShareX verbinden](#sharex-verbinden)
- [Texte, Kurzlinks und Alben](#texte-kurzlinks-und-alben)
- [Papierkorb, Statistiken und ZIP](#papierkorb-statistiken-und-zip)
- [Bilder bearbeiten](#bilder-bearbeiten)
- [Vorschauseiten gestalten](#vorschauseiten-gestalten)
- [Profilseiten](#profilseiten)
- [Eigene Domains](#eigene-domains)
- [Melden und Moderation](#melden-und-moderation)
- [E-Mail](#e-mail)
- [Datenbank](#datenbank)
- [Dateien in S3](#dateien-in-s3)
- [Einstellungen und Umgebungsvariablen](#einstellungen-und-umgebungsvariablen)
- [Sprache](#sprache)
- [Anmelden über andere Dienste](#anmelden-über-andere-dienste)
- [Startseite, Impressum und Links](#startseite-impressum-und-links)
- [App fürs Handy](#app-fürs-handy)
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
- **Texte und Code** wie in einem Pastebin, mit Syntaxhervorhebung, aus ShareX oder direkt im Browser
- **Kurzlinks** für lange Adressen, auch direkt aus ShareX
- **Schutz pro Upload**: Ablaufzeit, Passwort oder nur ein einziger Abruf, für Dateien, Texte und Kurzlinks
- **Alben und Tags**: Dateien ordnen und als Album mit eigener Seite teilen, als ZIP herunterladen
- **Papierkorb**: Gelöschtes lässt sich 30 Tage lang zurückholen
- **Statistiken** pro Datei, Kurzlink und Album: Aufrufe, Vorschauen in Discord und Co., Downloads und woher die Besucher kommen, ganz ohne IP-Adressen
- **Adressen nach Wahl**: lange ID, kurze Zeichenfolge, Wörter, Emojis, unsichtbare Zeichen oder der Originalname, auf Wunsch über mehrere Domains
- **Ansichtsseiten** mit Bild-, Video- und Audioplayer in sechs Designs, mit Farben aus der Datei oder eigener Akzentfarbe, wählbarer Schrift, ein- und ausblendbaren Angaben und auf Wunsch eigenem CSS
- **Embed Builder** mit Live-Vorschau: eine Standardvorlage für alle und auf Wunsch eigene Vorlagen pro Benutzer, mit Platzhaltern wie `{dateiname}` oder `{größe}`
- **Profilseiten** mit Beschreibung, Links, ausgewählten Dateien und öffentlichen Alben
- **Eigene Domains pro Konto**, bestätigt über einen TXT-Eintrag im DNS, die Zertifikate holt Caddy von selbst
- **Bilder bearbeiten** im Browser: zuschneiden, drehen, spiegeln, Pfeile, Rahmen, Text und Verpixeln
- **Melden und Moderation**: Besucher melden Inhalte, Admins sperren oder löschen sie
- **E-Mail über SMTP** für „Passwort vergessen“, Einladungen und Hinweise zum Konto
- **Startseite** mit Statistiken und Upload-Verlauf, im Browser anpassbar oder abschaltbar
- **Anmeldung** mit Passwort, Zwei-Faktor per Authenticator-App und Passkeys, dazu über Discord, GitHub, Google, Microsoft, GitLab oder jeden OpenID-Connect-Anbieter wie Authentik, Keycloak oder Authelia
- **Benutzerverwaltung** mit Rollen, Speicherlimits, Einladungslinks, Sperren und Aktivitätsprotokoll
- **API-Tokens** für ShareX und Skripte, mehrere pro Konto und einzeln widerrufbar, die `.sxcu`-Dateien für Dateien, Texte und Kurzlinks gibt es per Klick
- **Datenbank nach Wahl**: SQLite, PostgreSQL oder MySQL/MariaDB, der Umzug geht mit einem Befehl
- **Speicher in S3**: AWS S3, Cloudflare R2, Backblaze B2, MinIO, Wasabi und andere S3-Dienste
- **Automatische Sicherungen** mit Aufbewahrungsregel, im Ordner `db/backups` oder in S3
- **Deutsch und Englisch**: Jede Person stellt ihre Sprache selbst ein
- **App fürs Handy**: installierbar wie eine App, Fotos und Links landen über „Teilen“ direkt in MoeShare
- **Impressum, Datenschutz und eigene Links** im Fuß jeder Seite, als Link oder direkt in MoeShare geschrieben
- **Datenschutz**: Standortdaten werden aus Fotos entfernt, bevor sie öffentlich erreichbar sind
- **Sicherheit**: strenge Content Security Policy, hochgeladene HTML- und SVG-Dateien laufen in einer Sandbox
- **Benachrichtigungen** über einen Discord-Webhook, wählbar nach Ereignis
- **Weboberfläche** mit Material You: Farben aus einer Grundfarbe, helles und dunkles Design, auf dem Handy genauso gut wie am PC

Für macOS und Linux funktionieren auch [Flameshot](https://flameshot.org/) (siehe [`config_flameshot.sh`](config_flameshot.sh)) und [MagicCap](https://magiccap.me/).

## Installation

MoeShare braucht **Node.js 24 oder neuer** oder Docker. Das Docker-Image bringt Node.js 26 und FFmpeg schon mit. Ohne Docker installierst du FFmpeg für Video-Vorschauen und Streaming selbst, etwa mit `apt install ffmpeg`, `brew install ffmpeg` oder `winget install ffmpeg`. MoeShare findet es über den `PATH`, alternativ gibst du den Pfad mit `FFMPEG_PATH` an. Die Weboberfläche liegt fertig gebaut im Repository, ein eigener Build-Schritt ist nicht nötig.

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

Zu jeder veröffentlichten Version gibt es neben `latest` eigene Tags wie `3.1.0`, `3.1` und `3`. Selbst bauen geht mit `docker build -t ghcr.io/maximiliangt500/moeshare:latest .` im geklonten Repository, `docker compose up -d` nimmt dann dieses Image.

### Mit PostgreSQL oder MariaDB in Docker

Für PostgreSQL und MariaDB liegen im Ordner [`docker/`](docker) zwei Ergänzungen zur `docker-compose.yml`. Sie starten die Datenbank als eigenen Container und verbinden MoeShare damit. Für PostgreSQL:

```bash
mkdir -p docker
curl -o docker/postgres.yml https://raw.githubusercontent.com/MaximilianGT500/moeshare/main/docker/postgres.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
echo "COMPOSE_FILE=docker-compose.yml:docker/postgres.yml" >> .env
docker compose up -d
```

Für MariaDB nimmst du `docker/mariadb.yml` und `MARIADB_PASSWORD`. Durch `COMPOSE_FILE` in der `.env` nutzt `docker compose` beide Dateien automatisch, unter Windows trennt ein Semikolon statt eines Doppelpunkts die Dateien. Die Daten der Datenbank liegen im Ordner `postgres/` bzw. `mariadb/`. Das Passwort steht später in der Datenbank-Adresse, nimm deshalb nur Buchstaben und Ziffern, wie es `openssl rand -hex 24` erzeugt.

Wie du eine bestehende Installation umziehst, steht unter [Datenbank](#datenbank).

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
2. **Datenbank**: SQLite, PostgreSQL oder MySQL/MariaDB, mit Verbindungstest
3. **Admin-Konto** mit Benutzername und Passwort
4. **Seite**: Name, öffentliche Adresse, Sprache, Grundfarbe und Symbol
5. **Startseite**: Startseite mit Statistiken, direkt zur Anmeldung oder Weiterleitung auf eine andere Seite
6. **Uploads**: maximale Dateigröße, Speicher pro Konto, Adressstil und die Verarbeitung nach dem Hochladen
7. **Anmeldung**: wer ein Konto bekommt, Zwei-Faktor-Pflicht und Passkeys
8. **Benachrichtigungen** über einen Discord-Webhook, auf Wunsch mit Testnachricht
9. **Übersicht** und Abschluss

Danach bist du angemeldet und kannst direkt die ShareX-Dateien mitnehmen. Alles lässt sich später unter **Admin › Einstellungen** ändern, dort richtest du auch Impressum, Datenschutz, S3, Sicherungen, E-Mail, eigene Domains und die Anmeldung über andere Dienste ein.

## ShareX verbinden

Unter **Konto › ShareX und API** erstellst du ein Token und lädst die fertigen `.sxcu`-Dateien herunter, je eine für Dateien, Texte und Kurzlinks. Ein Doppelklick richtet ShareX ein. Bilder und Dateien gehen dann direkt zu MoeShare, Texte aus der Zwischenablage werden zu Text-Seiten und „URL kürzen“ erzeugt Kurzlinks. Die Links zum Ansehen, für die Vorschau und zum Löschen trägt ShareX selbst ein.

Wer Uploads aus ShareX gleich schützen oder einsortieren will, ergänzt in der `.sxcu` unter `Headers` diese Angaben. Alle sind optional und gelten für den einzelnen Upload, ohne Angabe nimmt MoeShare die eigenen Vorlieben aus **Konto › Einstellungen** und danach die Vorgaben des Servers.

| Header | Beispiel | Wirkung |
| --- | --- | --- |
| `X-Expires` | `7d` | Löschen nach Minuten (`30m`), Stunden (`6h`), Tagen (`7d`) oder Wochen (`2w`), `never` für nie |
| `X-Password` | `geheim` | Datei, Text oder Kurzlink nur mit Passwort |
| `X-Once` | `true` | Nur ein einziger Abruf, danach ist die Datei weg |
| `X-Max-Views` | `5` | Höchstens so viele Abrufe |
| `X-Url-Style` | `words` | Adressstil: `uuid`, `random`, `words`, `emoji`, `invisible` oder `original` |
| `X-Domain` | `https://img.example.com` | Eine der unter **Admin › Einstellungen** eingetragenen Domains oder eine [eigene Domain](#eigene-domains), `random` für eine zufällige |
| `X-Title` | `Mein Skript` | Titel für Texte und Dateien |
| `X-Syntax` | `python` | Sprache für die Hervorhebung von Texten |
| `X-Tags` | `urlaub,2026` | Tags, durch Kommas getrennt |
| `X-Album` | `aB3dE9` | Code oder ID eines eigenen Albums |

## Texte, Kurzlinks und Alben

**Texte** lädst du aus ShareX, über die API oder im Dashboard mit „Neuer Text“ hoch. MoeShare zeigt sie mit Syntaxhervorhebung, erkennt die Sprache auf Wunsch selbst und bietet die Rohfassung und einen Download an. Wie groß ein Text sein darf, legst du unter **Admin › Einstellungen › Uploads** fest.

**Kurzlinks** stehen unter `/s/<code>` und leiten auf die Zieladresse weiter. Im Dashboard unter **Links** siehst du alle Kurzlinks mit Klickzahl, änderst sie oder schützt sie mit Passwort, Ablaufzeit und einer Höchstzahl an Klicks.

**Alben** legst du im Dashboard unter **Alben** an oder wählst beim Hochladen ein Album aus. Jedes Album hat eine eigene Seite unter `/a/<code>` mit Titel, Beschreibung und Titelbild. Es ist entweder nur für dich sichtbar, für alle mit dem Link oder öffentlich, dann steht es auch auf deiner [Profilseite](#profilseiten). Ein Passwort geht zusätzlich. Geschützte Dateien zeigt ein Album erst, wenn ihr Passwort eingegeben wurde.

Ein Passwort, eine Ablaufzeit oder ein einmaliger Abruf lässt sich bei jedem Upload setzen und später im Dashboard ändern. Abgelaufene Dateien löscht MoeShare selbst.

Kurzlinks und Alben lassen sich unter **Admin › Einstellungen › Funktionen** abschalten.

## Papierkorb, Statistiken und ZIP

**Papierkorb**: Gelöschte Dateien landen erst im Papierkorb und sind ab sofort nicht mehr erreichbar. Direkt nach dem Löschen bietet das Dashboard „Rückgängig“ an, später holst du sie unter **Papierkorb** zurück oder löschst sie endgültig. Nach 30 Tagen räumt MoeShare selbst auf. Bis dahin zählen die Dateien weiter zum Speicher des Kontos. Admins sehen unter **Admin › Dateien** auch die Papierkörbe aller Konten. Auch Löschen über ShareX oder die API legt Dateien in den Papierkorb.

**Statistiken**: MoeShare zählt Aufrufe der Ansichtsseite, Vorschauen in Discord, Telegram und anderen Diensten, Downloads und Abrufe des Direktlinks außerhalb von MoeShare. Dazu kommt, von welcher Seite die Besucher kamen. Eigene Aufrufe zählen nicht mit. IP-Adressen, Cookies oder Gerätedaten speichert MoeShare dafür nicht, es bleiben nur Summen pro Tag. Im Dashboard unter **Statistik** siehst du alle Dateien zusammen und die meistgesehenen, jede Datei, jeder Kurzlink und jedes Album hat außerdem eine eigene Statistik. Die Tageswerte bleiben ein Jahr.

**ZIP**: Markierst du im Dashboard mehrere Dateien, lädst du sie mit einem Klick als ZIP herunter. Alben gibt es auf ihrer Seite ebenfalls als ZIP, geschützte Dateien bleiben dabei außen vor.

Unter **Admin › Einstellungen › Funktionen** legst du fest, wie lange Dateien im Papierkorb bleiben und wie lange die Statistik zurückreicht, oder schaltest Papierkorb, Statistiken und ZIP-Download ab.

## Bilder bearbeiten

Bilder öffnest du im Dashboard über das Menü einer Datei oder in der großen Ansicht mit „Bild bearbeiten“. Der Editor schneidet zu, frei oder im Format 1:1, 4:3, 3:2, 16:9 oder 9:16, dreht und spiegelt. Dazu kommen Stift, Pfeil, Rahmen und Text in mehreren Farben und Stärken sowie Flächen, die etwas verpixeln oder abdecken, etwa Namen oder Adressen auf einem Screenshot. Jeder Schritt lässt sich mit Strg+Z rückgängig machen.

Gespeichert wird als Kopie oder anstelle des Originals. Beim Ersetzen bleibt der Link zur Ansichtsseite gleich, alte Direktlinks leiten auf die neue Fassung weiter. Bearbeiten lassen sich PNG-, JPEG- und WebP-Bilder.

## Vorschauseiten gestalten

Unter **Gestalten › Vorschauseite** baut jede Person ihr eigenes Design für die Seiten ihrer Dateien. Es gilt auch für Alben und die Profilseite. Eine Live-Vorschau zeigt jede Änderung sofort, wahlweise mit einer eigenen Datei und in Handy- oder PC-Größe.

| Aufbau | So sieht es aus |
| --- | --- |
| Klassisch | Leuchtender Hintergrund aus den Farben des Bildes, darunter eine Karte mit allen Angaben |
| Schlicht | Nur die Datei auf ruhiger Fläche, die Angaben in einer schmalen Zeile |
| Bühne | Die Datei füllt den Bildschirm, die Knöpfe schweben darüber, immer dunkel |
| Seitlich | Datei links, Angaben und Knöpfe in einer eigenen Spalte |
| Sofortbild | Die Datei liegt wie ein Polaroid leicht schräg auf dem Tisch |
| Magazin | Großer Titel wie in einer Zeitschrift, die Datei darunter in voller Breite |

Dazu kommen Akzentfarbe (aus der Datei, die Farbe der Seite oder eine eigene), hell, dunkel oder nach Wahl der Besucher, vier Hintergründe, vier Schriften und drei Eckenformen. Titel, Uploader, Datum, Größe, Aufrufe und die einzelnen Knöpfe lassen sich ausblenden. Eine kurze Notiz und ein eigener Knopf, etwa zu deinem Portfolio, stehen unter jeder Datei.

Admins legen unter **Gestalten › Vorschauseite › Standard** fest, wie die Seiten aussehen, solange jemand kein eigenes Design gebaut hat. Dort schalten sie eigene Designs ab, dann gilt für alle der Standard, und bestimmen, wer **eigenes CSS** schreiben darf: niemand (Standard), nur Admins oder alle. MoeShare beschränkt das CSS auf die eigenen Seiten, lädt keine fremden Dateien (`url()` und `@import` gehen nicht) und erlaubt nur `@media`, `@supports` und `@container`. Klassen wie `.ms-title`, `.ms-media`, `.ms-actions` und `.ms-meta` stehen im Editor.

Der Embed Builder für die Vorschau in Discord liegt jetzt ebenfalls unter **Gestalten**, im Reiter **Embed**.

## Profilseiten

Unter **Gestalten › Profilseite** schaltet jede Person ihre öffentliche Seite unter `/u/<benutzername>` ein: mit Anzeigename, kurzer Beschreibung, bis zu sechs Links, den öffentlichen Alben und ausgewählten Dateien. Welche Dateien dort erscheinen, legst du pro Datei mit „Im Profil zeigen“ fest. Dateien mit Passwort oder begrenzten Abrufen tauchen dort nie auf. Die Profilseite übernimmt das Design der Vorschauseiten und ist die Startseite einer [eigenen Domain](#eigene-domains).

Unter **Admin › Einstellungen › Funktionen** lassen sich Profilseiten für alle abschalten.

## Eigene Domains

Mit einer eigenen Domain zeigt MoeShare Dateien, Alben, Kurzlinks und die Profilseite einer Person zusätzlich unter einer Adresse, die ihr gehört, etwa `bilder.deinname.de`. Anders als die [Domains des Servers](#mehrere-domains) gehört so eine Domain genau einem Konto, und unter ihr ist nur dessen Inhalt erreichbar.

Ein Admin schaltet das unter **Admin › Einstellungen › Eigene Domains** ein. Dort stehen auch die Höchstzahl pro Konto (Standard 3), der Hostname, auf den die Domains zeigen sollen (ohne Angabe die Hauptadresse) und eine Liste aller verbundenen Domains, aus der Admins jede wieder entfernen können.

So verbindet jemand eine Domain:

1. Unter **Konto › Domains** die Domain eintragen.
2. Beim DNS-Anbieter den angezeigten TXT-Eintrag anlegen, etwa `_moeshare.bilder.deinname.de` mit dem Wert `moeshare-verify=…`. Er zeigt, dass einem die Domain gehört.
3. Die Domain per CNAME auf den Server zeigen lassen. Für eine Domain ohne Subdomain nimmst du A- und AAAA-Einträge mit den Adressen des Servers.

MoeShare prüft neue Domains in den ersten sieben Tagen alle paar Minuten von selbst und verbindet sie, sobald der TXT-Eintrag stimmt. Mit „Jetzt prüfen“ geht es sofort, dabei zeigt MoeShare auch, ob die Domain schon auf den Server zeigt und über HTTPS erreichbar ist. Mit „Als Standard für neue Links“ nutzen neue Uploads die Domain, ShareX wählt sie auch über `X-Domain`. Anmeldung, Dashboard und Verwaltung bleiben auf der Hauptadresse, wer unter der eigenen Domain dorthin will, wird weitergeleitet.

Für HTTPS braucht der Reverse-Proxy Zertifikate auf Abruf. Die Caddyfile aus dem Repository bringt das mit, siehe [Hinter einem Reverse-Proxy](#hinter-einem-reverse-proxy). Caddy fragt vor jedem Zertifikat unter `/api/domains/tls` nach, ob die Domain zu einem Konto gehört, für fremde Domains gibt es keins. Prüft MoeShare das DNS über einen bestimmten Server, etwa im eigenen Netz, setzt du ihn mit `DNS_SERVERS`.

## Melden und Moderation

Auf jeder öffentlichen Seite steht unten „Melden“. Besucher wählen einen Grund, etwa Urheberrecht, persönliche Daten oder Spam, und können eine Beschreibung und eine Kontaktadresse angeben. Die Meldungen landen bei den Admins unter **Admin › Meldungen** und, wenn E-Mail eingerichtet ist, auf Wunsch auch im Postfach. Gleiche Meldungen fasst MoeShare zusammen.

Für jede Meldung gibt es diese Möglichkeiten: verwerfen, den Inhalt sperren, ihn löschen oder das Konto sperren. Gesperrte Dateien, Alben, Kurzlinks und Profile antworten mit dem Status 451 und einem Hinweis. Nur die Besitzer und die Admins sehen sie noch, samt Sperre und Grund. Eine Sperre lässt sich jederzeit aufheben. Unter **Admin › Einstellungen › Funktionen** schaltest du das Melden ab.

## E-Mail

Unter **Admin › Einstellungen › E-Mail** trägst du einen SMTP-Server ein, etwa den deines Mail-Anbieters, und schickst eine Testmail. Danach kann MoeShare:

- **Passwort vergessen**: Ein Link zum Zurücksetzen geht an die bestätigte Adresse. Er gilt eine Stunde und nur einmal. Nach dem Zurücksetzen sind alle Sitzungen des Kontos abgemeldet.
- **Einladungen** direkt an eine E-Mail-Adresse schicken.
- **Hinweise zum Konto** verschicken, etwa wenn sich das Passwort oder die Zwei-Faktor-Anmeldung ändert oder ein Passkey dazukommt.
- **Admins benachrichtigen** bei neuen Meldungen und neuen Konten.

Jede Person trägt ihre Adresse unter **Konto › Einstellungen** ein und bestätigt sie über einen Link. Dort wählt sie auch, welche Hinweise sie per Mail bekommt. E-Mails kommen in der Sprache der Empfänger.

## Datenbank

MoeShare speichert Konten, Einstellungen und Dateiinfos in einer Datenbank. Ohne weitere Angabe ist das eine SQLite-Datei unter `db/datenbank.sqlite`, die für die meisten Server reicht und keine Einrichtung braucht. Läuft bei dir schon PostgreSQL oder MySQL bzw. MariaDB, nimmt MoeShare auch die. Getestet wird mit PostgreSQL 16 und 18 sowie MariaDB 10.11.

Welche Datenbank genutzt wird, legst du auf einem von drei Wegen fest:

1. Im **Installationsassistenten** im Schritt „Datenbank“, mit Verbindungstest. Die Adresse landet in `db/database.json`.
2. Mit der Umgebungsvariable **`DATABASE_URL`**. Sie hat Vorrang vor allem anderen.
3. Mit **`copy-db … --use`** auf der Kommandozeile, siehe unten.

| Datenbank | Adresse |
| --- | --- |
| SQLite | `sqlite:db/datenbank.sqlite` (Pfad relativ zum Projektordner oder absolut) |
| PostgreSQL | `postgres://benutzer:passwort@server:5432/datenbank` |
| MySQL oder MariaDB | `mysql://benutzer:passwort@server:3306/datenbank` |

Für eine verschlüsselte Verbindung hängst du `?sslmode=require` an, mit `?sslmode=verify-full` prüft MoeShare zusätzlich das Zertifikat. Sonderzeichen im Passwort müssen in der Adresse kodiert sein, aus `#` wird zum Beispiel `%23`. Die Datenbank muss es schon geben, die Tabellen legt MoeShare beim Start selbst an. Der Benutzer braucht dafür das Recht, Tabellen zu erstellen.

### Umziehen

Bestehende Daten ziehen mit `copy-db` um. Beende MoeShare vorher, damit beim Kopieren nichts verloren geht. Die Ziel-Datenbank muss leer sein:

```bash
node cli.js copy-db postgres://moeshare:passwort@localhost:5432/moeshare --use
```

MoeShare kopiert alle Tabellen, prüft danach die Anzahl der Einträge und nutzt mit `--use` ab dem nächsten Start die neue Datenbank. Ohne `--use` bleibt alles beim Alten und du stellst selbst über `DATABASE_URL` um. Die alte Datenbank bleibt in jedem Fall unverändert liegen. `node cli.js db` zeigt, welche Datenbank gerade genutzt wird und wie viele Einträge in jeder Tabelle stehen.

Mit Docker und einer der Ergänzungen aus dem Ordner `docker/` sieht der Umzug von SQLite nach PostgreSQL so aus:

```bash
docker compose stop moeshare
docker compose -f docker-compose.yml -f docker/postgres.yml up -d postgres
docker compose -f docker-compose.yml run --rm moeshare moeshare copy-db "postgres://moeshare:DEIN_PASSWORT@postgres:5432/moeshare"
echo "COMPOSE_FILE=docker-compose.yml:docker/postgres.yml" >> .env
docker compose up -d
```

## Dateien in S3

Statt im Ordner `uploads/` kann MoeShare Dateien in einem S3-kompatiblen Speicher ablegen, zum Beispiel bei AWS, Cloudflare R2, Backblaze B2, Wasabi oder in einem eigenen MinIO. Unter **Admin › Einstellungen › Speicherort** trägst du Endpoint, Region, Bucket und Zugangsdaten ein, prüfst sie mit „Verbindung testen“ und stellst den Speicherort für neue Uploads auf S3 um.

- **Endpoint**: bei AWS leer lassen, bei R2 die Adresse aus dem Cloudflare-Dashboard, bei MinIO die deines Servers. Selbst betriebene Dienste ohne Bucket-Subdomains brauchen „Pfad-Adressen“.
- **Ordner im Bucket**: optional, so kann sich MoeShare einen Bucket mit anderem teilen.
- **Auslieferung**: „Über den Server“ hält den Bucket privat, alles läuft durch MoeShare. „Direkt aus S3“ leitet Besucher auf eine kurzlebige, signierte Adresse um und entlastet den Server.

Vorschaubilder entstehen weiterhin auf dem Server, danach wandert die Datei in den Bucket. Vorhandene Dateien verschiebst du auf derselben Seite mit „Alles nach S3 verschieben“ und zurück mit „Alles auf den Server holen“, alle Links bleiben dabei gleich. Auf der Kommandozeile geht das mit `node cli.js storage s3` bzw. `node cli.js storage lokal`.

## Einstellungen und Umgebungsvariablen

Alle Einstellungen stehen in der Datenbank und werden unter **Admin › Einstellungen** geändert: Allgemein, Uploads, Funktionen, Eigene Domains, Speicherort, Sicherungen, Anmeldung, Anmeldedienste, E-Mail, Rechtliches und Links, Benachrichtigungen und System. Änderungen gelten sofort, auch für alle Prozesse im PM2-Cluster.

Unter **Konto › Einstellungen** legt jede Person eigene Vorlieben fest: Sprache, Adressstil, automatisches Löschen nach einer Zeit und, wenn es mehrere gibt, die Domain. Sie gelten im Browser genauso wie für ShareX.

Umgebungsvariablen sind nur noch optional. Du kannst sie als `.env` im Projektordner, in der `docker-compose.yml` oder direkt beim Start setzen:

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `3000` | Port, auf dem MoeShare lauscht |
| `DATABASE_URL` | SQLite in `db/` | Datenbank, siehe [Datenbank](#datenbank). Hat Vorrang vor der Auswahl im Assistenten. |
| `FFMPEG_PATH` | `ffmpeg` aus dem `PATH` | Pfad zu FFmpeg für Video-Vorschauen und Streaming |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` oder `error`. Mit `debug` steht jede Anfrage mit Dauer und Request-ID im Log. |
| `LOG_FORMAT` | `text` | `text` für die Konsole, `json` für Loki, Graylog, Elasticsearch und Co. |
| `NO_COLOR` / `FORCE_COLOR` | | Farben im Log abschalten oder erzwingen. Ohne Angabe gibt es Farben nur im Terminal. |
| `TZ` | Systemzeit | Zeitzone für die Zeitstempel im Log, etwa `Europe/Berlin` |
| `GLITCHTIP_DSN` | Projekt-GlitchTip | Ziel für Fehlerberichte, siehe [Protokoll und Fehlerberichte](#protokoll-und-fehlerberichte). `off` schaltet sie ganz ab. |
| `URL_FETCH_ALLOW_PRIVATE` | `false` | „Hochladen per Link“ darf auch Adressen im internen Netz abrufen. Nur im eigenen Netz einschalten. |
| `DNS_SERVERS` | DNS des Systems | DNS-Server für die Prüfung [eigener Domains](#eigene-domains), durch Kommas getrennt, etwa `1.1.1.1,9.9.9.9` |
| `PUID` / `PGID` | `1000` | Nur Docker: Benutzer und Gruppe, denen `db/` und `uploads/` gehören |
| `DOMAIN` | | Nur Docker mit Caddy, siehe [Hinter einem Reverse-Proxy](#hinter-einem-reverse-proxy) |
| `POSTGRES_PASSWORD` / `MARIADB_PASSWORD` | | Nur Docker mit `docker/postgres.yml` bzw. `docker/mariadb.yml` |
| `UI_DEV_SERVER` | | Nur für die Entwicklung, siehe [Entwicklung](#entwicklung) |

### Mehrere Domains

Unter **Admin › Einstellungen › Allgemein** trägst du weitere Domains ein, unter denen MoeShare erreichbar ist. Jede Person wählt dann im Konto eine feste Domain für ihre Links oder lässt sie zufällig wechseln, ShareX kann sie mit `X-Domain` pro Upload festlegen. Die Domains müssen auf denselben Server zeigen und im Reverse-Proxy eingetragen sein. Anmeldung und Verwaltung laufen weiter über die Hauptadresse. Domains, die nur einer Person gehören, verbindet jede selbst, siehe [Eigene Domains](#eigene-domains).

## Sprache

Die Oberfläche gibt es auf Deutsch und Englisch. Unter **Admin › Einstellungen › Allgemein** legst du die Sprache des Servers fest und ob MoeShare neuen Besuchern die Sprache ihres Browsers zeigt. Angemeldete wählen ihre Sprache unter **Konto › Einstellungen**, alle anderen über den Umschalter unten auf jeder Seite. Fehlermeldungen der API kommen in derselben Sprache, E-Mails in der Sprache der Empfänger und Benachrichtigungen über den Discord-Webhook in der Sprache des Servers. Das Protokoll bleibt auf Deutsch.

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

## App fürs Handy

MoeShare lässt sich auf dem Handy und am PC wie eine App installieren: In Chrome und Edge über „App installieren“, in Safari über „Zum Home-Bildschirm“. Die App öffnet direkt das Dashboard und hat Abkürzungen für „Hochladen“, „Neuer Text“ und „Link kürzen“. Auf Android taucht MoeShare danach im „Teilen“-Menü auf, so schickst du Fotos, Videos, Texte und Links aus jeder App direkt hin. Das App-Symbol entsteht aus dem Symbol der Seite.

Unter **Admin › Einstellungen › Allgemein** lässt sich das abschalten. Für die Installation braucht MoeShare HTTPS.

## Protokoll und Fehlerberichte

Im Textformat sieht das Log so aus:

```
2026-10-20 19:12:43 INFO  [server] MoeShare 3.1.0 läuft auf https://share.example.com port=3000 node=26.12.0 log=info
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

Für den Betrieb im Internet gehört MoeShare hinter einen Reverse-Proxy mit HTTPS. Passkeys und die Installation als App funktionieren nur über HTTPS oder `localhost`.

Die `docker-compose.yml` bringt dafür Caddy mit, das Zertifikate selbst holt. Leg neben der `docker-compose.yml` eine `.env` mit deiner Domain an und lade die [`Caddyfile`](docker/Caddyfile) in den Ordner `docker/`:

```bash
mkdir -p docker
curl -o docker/Caddyfile https://raw.githubusercontent.com/MaximilianGT500/moeshare/main/docker/Caddyfile
echo "DOMAIN=share.example.com" >> .env
docker compose --profile caddy up -d
```

Die Domain muss auf deinen Server zeigen und die Ports 80 und 443 müssen frei sein. Die Caddyfile holt außerdem Zertifikate für [eigene Domains](#eigene-domains), sobald jemand sie aufruft. Vorher fragt Caddy bei MoeShare nach, ob die Domain zu einem Konto gehört.

Ohne Docker reicht in Caddy:

```
share.example.com {
  reverse_proxy localhost:3000
}
```

Mit eigenen Domains kommen Zertifikate auf Abruf dazu:

```
{
  on_demand_tls {
    ask http://localhost:3000/api/domains/tls
  }
}

share.example.com {
  reverse_proxy localhost:3000
}

https:// {
  tls {
    on_demand
  }
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

Danach unter **Admin › Einstellungen** die Adresse auf `https://share.example.com` setzen und unter **System** „Hinter einem Reverse-Proxy“ einschalten. nginx kann keine Zertifikate auf Abruf holen. Wer dort eigene Domains anbieten will, trägt jede selbst mit Zertifikat ein oder setzt Caddy davor.

## Update von einer älteren Version

Was neu ist und worauf du beim Update achten musst, steht im [Changelog](https://moeshare.eu/changelog.html).

1. MoeShare stoppen und eine Sicherung von `db/` und `uploads/` anlegen. Wer schon Version 3 nutzt, nimmt dafür `node cli.js backup --uploads`.
2. Den neuen Stand holen (`git pull` oder `docker compose pull`).
3. `npm install` ausführen (bei Docker übernimmt das das Image).
4. MoeShare starten.

Beim ersten Start sichert MoeShare die Datenbank automatisch nach `db/backups/` und bringt sie auf den neuen Stand. Bestehende Discord-Verknüpfungen bleiben dabei erhalten. Werte aus einer alten `.env` (zum Beispiel `SITE_TITLE` oder `MAX_FILE_SIZE_MB`) werden einmalig übernommen, danach meldet das Log, welche Variablen du entfernen kannst. Bisherige ShareX-Tokens funktionieren weiter. Für Konten aus älteren Versionen ist zunächst auch die Anmeldung mit dem Token möglich, damit sich alle ein Passwort setzen können. Unter **Admin › Einstellungen › Anmeldung** schaltest du das ab.

Stand in der alten `.env` eine `REDIRECT_URL`, leitet die Adresse ohne Pfad weiter wie bisher. Die neue Startseite schaltest du unter **Admin › Startseite** ein. Datenbanken, die einmal aus PostgreSQL umgewandelt wurden (Tabellen mit `public.` im Namen), passt MoeShare beim Start selbst an.

Läuft MoeShare bei dir mit einem älteren Docker-Image, trägst du in der `docker-compose.yml` `ghcr.io/maximiliangt500/moeshare:latest` ein oder nimmst gleich die neue Datei aus dem Repository. Die Ordner `db/` und `uploads/` bleiben gleich.

Ohne Docker braucht MoeShare 3 Node.js 24 oder neuer. Prüf die Version mit `node --version` und aktualisiere Node.js vor dem Update, etwa über [nodejs.org](https://nodejs.org) oder den Versionsmanager deiner Wahl.

## Datensicherung

Unter **Admin › Einstellungen › Sicherungen** schaltest du automatische Sicherungen ein. Du legst fest, wie oft MoeShare sichert, wie viele automatische Sicherungen bleiben und ob die hochgeladenen Dateien mit hineinkommen. Ältere automatische Sicherungen räumt MoeShare selbst weg, manuelle bleiben, bis du sie löschst. Die Sicherungen liegen in `db/backups/` oder, wenn S3 eingerichtet ist, auf Wunsch im Bucket. Dort startest du auch eine Sicherung von Hand und lädst sie herunter.

Eine Sicherung ist ein `.tar.gz` mit der ganzen Datenbank, der Schlüsseldatei `db/.secret` und auf Wunsch den Dateien. Sie passt zu jeder Datenbank: Eine Sicherung aus SQLite lässt sich auch in PostgreSQL oder MariaDB einspielen. Zum Zurückspielen MoeShare beenden und dann:

```bash
node cli.js restore moeshare-backup-20261022-101509.tar.gz
```

Ohne Pfad sucht MoeShare die Datei in `db/backups/`. Enthält die Datenbank schon Daten, bricht `restore` ab, mit `--force` werden sie vorher gelöscht. Mit `--ohne-dateien` kommt nur die Datenbank zurück.

Wer lieber selbst sichert, nimmt diese Ordner mit:

- `db/` mit der Datenbank und der Schlüsseldatei `db/.secret`. Ohne die Schlüsseldatei lassen sich Zwei-Faktor-Einstellungen und S3-Zugangsdaten nicht mehr lesen.
- `uploads/` mit allen Dateien, sofern sie nicht in S3 liegen.
- Bei PostgreSQL oder MySQL zusätzlich einen Dump der Datenbank, etwa mit `pg_dump` oder `mysqldump`.

## Kommandozeile

| Befehl | Zweck |
| --- | --- |
| `npm run register` | Konto anlegen und ein ShareX-Token ausgeben |
| `npm run token` | Neues API-Token nach Benutzername und Passwort |
| `npm run reset` | Notfallzugang: Passwort, Rolle, Sperre, Zwei-Faktor, Passkeys oder Tokens zurücksetzen |
| `node cli.js db` | Zeigt die genutzte Datenbank und die Einträge pro Tabelle |
| `node cli.js copy-db <adresse> [--use]` | Kopiert alle Daten in eine andere Datenbank, mit `--use` direkt umstellen |
| `node cli.js backup [--uploads]` | Erstellt eine Sicherung, mit `--uploads` samt Dateien |
| `node cli.js restore <datei> [--force] [--ohne-dateien]` | Spielt eine Sicherung ein |
| `node cli.js storage <s3\|lokal>` | Verschiebt vorhandene Dateien nach S3 oder zurück auf den Server |

Mit Docker heißen die Befehle `docker compose exec moeshare moeshare register`, `… moeshare db`, `… moeshare backup` und so weiter. Sie laufen dort mit dem Benutzer, dem die Datenbank gehört. Für `copy-db` und `restore` muss MoeShare gestoppt sein, nimm dafür `docker compose run --rm moeshare moeshare …`. Legst du das erste Konto mit `register` an, ist der Installationsassistent nicht mehr nötig und die Einstellungen machst du danach im Browser.

## API

Skripte und Uploader melden sich mit einem API-Token im Header `Authorization` an. Alle Upload-Wege verstehen die Angaben aus der Tabelle unter [ShareX verbinden](#sharex-verbinden), als Header oder als Feld im Formular bzw. im JSON (`expires`, `password`, `once`, `maxViews`, `urlStyle`, `domain`, `title`, `syntax`, `tags`, `album`).

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| `POST` | `/upload` | Datei im Formularfeld `file` hochladen. Antwort: `{ success, file, view, preview, delete }` |
| `POST` | `/api/texts` | Text hochladen, als Feld `content` (Formular oder JSON) oder als `text/plain`. Antwort wie bei `/upload` |
| `POST` | `/api/shorten` | Kurzlink für die Adresse im Feld `url` anlegen. Antwort: `{ success, url, target, code }` |
| `GET` | `/files` | Dateinamen des eigenen Kontos, neueste zuerst |
| `DELETE` | `/file/:dateiname` | Eigene Datei in den Papierkorb legen, ohne Papierkorb sofort löschen. Antwort: `{ ok, trashed }` |

Öffentlich erreichbar sind `/view/:dateiname` (Ansichtsseite), `/download/:dateiname`, `/uploads/:benutzer/:dateiname` (die Datei selbst), `/s/:code` (Kurzlinks), `/a/:code` (Alben), `/a/:code/zip` (Album als ZIP), `/u/:benutzer` (Profilseiten), `/report` (Inhalt melden), `/oembed/:dateiname`, `/api/home` (Statistiken der Startseite), `/api/domains/tls` (Abfrage für Caddy), `/impressum`, `/datenschutz` und `/healthz` für Health-Checks. Geschützte Dateien liefert MoeShare erst nach Eingabe des Passworts auf der Ansichtsseite aus.

```bash
curl -H "Authorization: ms_…" -F "file=@bild.png" https://share.example.com/upload
curl -H "Authorization: ms_…" -H "X-Expires: 1d" -H "X-Syntax: bash" --data-binary @skript.sh -H "Content-Type: text/plain" https://share.example.com/api/texts
curl -H "Authorization: ms_…" -d "url=https://example.com/ein/sehr/langer/pfad" https://share.example.com/api/shorten
```

## Entwicklung

```bash
npm install
npm run build
npm run dev:ui
UI_DEV_SERVER=http://localhost:5173 npm start
```

`npm run build` baut die Weboberfläche aus `client/` nach `public/app`. Mit `npm run dev:ui` und `UI_DEV_SERVER` lädt die Oberfläche Änderungen sofort neu. `npm run typecheck` prüft den TypeScript-Code, die Formatierung folgt der `.prettierrc.json`.

Die Texte der Oberfläche sind auf Deutsch geschrieben und dienen gleichzeitig als Schlüssel für die Übersetzung. Die englischen Texte liegen in `src/i18n/client/en.json` (Weboberfläche) und `src/i18n/server/en.json` (Fehlermeldungen, Seitentitel, Benachrichtigungen). Ein neuer Text braucht in der Oberfläche `t('…')` und einen Eintrag in der passenden Datei, Platzhalter wie `{name}` bleiben dabei gleich.

| Ordner | Inhalt |
| --- | --- |
| `src/routes` | Seiten und API, nach Bereichen getrennt |
| `src/services` | Logik für Benutzer, Dateien, Alben, Kurzlinks, Designs, Domains, Statistiken, Meldungen, E-Mail, Einstellungen, Speicher, Sicherungen, Anmeldung und mehr |
| `src/lib` | Datenbank für SQLite, PostgreSQL und MySQL, S3, Protokoll, Medienverarbeitung und Hilfsfunktionen |
| `src/middleware` | Anmeldung, Sicherheitsregeln, Request-IDs und Fehlerbehandlung |
| `src/i18n` | Englische Übersetzungen für Oberfläche und Server |
| `client/src` | Weboberfläche mit React und Material UI |
| `docker/` | Startskript, Kommandozeile, Caddyfile und die Ergänzungen für PostgreSQL und MariaDB |
| `cli.js` | Befehle für die Kommandozeile |

## Support, Mitwirken und Lizenz

Fehler und Ideen gerne als [Issue](https://github.com/MaximilianGT500/moeshare/issues/new) oder Pull Request, siehe [CONTRIBUTING.md](CONTRIBUTING.md). Kontakt gibt es auch über meine [Website](https://maxi.lol/kontakt/).

Teile der ursprünglichen README und der `docker-compose.yml` stammen von [ass](https://github.com/tycrek/ass).

MoeShare steht unter der [MIT-Lizenz](LICENSE).
