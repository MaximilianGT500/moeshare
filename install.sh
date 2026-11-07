#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${MOESHARE_REPO:-MaximilianGT500/moeshare}"
REF="${MOESHARE_REF:-main}"
RAW="${MOESHARE_RAW:-https://raw.githubusercontent.com/${REPO}/${REF}}"
DIR="${MOESHARE_DIR:-/opt/moeshare}"
MODE="${MOESHARE_MODE:-}"
DOMAIN="${MOESHARE_DOMAIN:-}"
EMAIL="${MOESHARE_EMAIL:-}"
DATABASE="${MOESHARE_DB:-}"
CLAMAV="${MOESHARE_CLAMAV:-}"
PORT="${MOESHARE_PORT:-3000}"
SERVICE_USER="${MOESHARE_USER:-moeshare}"
ASSUME_YES="no"
ACTION="install"
START="yes"
NODE_MAJOR=24
ASKED_DOMAIN="no"

case "${LC_ALL:-${LC_MESSAGES:-${LANG:-de}}}" in
  en*) UI=en ;;
  *) UI=de ;;
esac

t() { if [ "$UI" = en ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }

if [ -t 1 ]; then
  BOLD=$'\e[1m' DIM=$'\e[2m' GREEN=$'\e[32m' YELLOW=$'\e[33m' RED=$'\e[31m' RESET=$'\e[0m'
else
  BOLD='' DIM='' GREEN='' YELLOW='' RED='' RESET=''
fi

say() { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s%s%s\n' "$GREEN" "$RESET" "$BOLD" "$*" "$RESET"; }
note() { printf '   %s%s%s\n' "$DIM" "$*" "$RESET"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
fail() {
  printf '\n%s%s%s %s\n' "$RED" "$(t 'Abgebrochen:' 'Aborted:')" "$RESET" "$*" >&2
  exit 1
}

trap 'fail "$(t "Fehler in Zeile" "Error in line") $LINENO."' ERR

TTY=""
if (exec </dev/tty) 2>/dev/null; then TTY="yes"; fi

ask() {
  local question="$1" default="${2:-}" answer=""
  if [ "$ASSUME_YES" = "yes" ] || [ -z "$TTY" ]; then
    printf '%s' "$default"
    return
  fi
  if [ -n "$default" ]; then
    printf '%s%s%s [%s]: ' "$BOLD" "$question" "$RESET" "$default" >/dev/tty
  else
    printf '%s%s%s: ' "$BOLD" "$question" "$RESET" >/dev/tty
  fi
  IFS= read -r answer </dev/tty || answer=""
  printf '%s' "${answer:-$default}"
}

confirm() {
  local answer
  answer="$(ask "$1 ($(t 'j/n' 'y/n'))" "${2:-$(t j y)}")"
  case "$answer" in
    [jJyY]*) return 0 ;;
    *) return 1 ;;
  esac
}

choose() {
  local question="$1" default="$2" answer="" index=1 key
  shift 2
  if [ "$ASSUME_YES" = "yes" ] || [ -z "$TTY" ]; then
    printf '%s' "$default"
    return
  fi
  printf '%s%s%s\n' "$BOLD" "$question" "$RESET" >/dev/tty
  for option in "$@"; do
    printf '  %s) %s\n' "$index" "${option#*|}" >/dev/tty
    index=$((index + 1))
  done
  while :; do
    printf '%s [%s]: ' "$(t 'Auswahl' 'Choice')" "$default" >/dev/tty
    IFS= read -r answer </dev/tty || answer=""
    answer="${answer:-$default}"
    index=1
    for option in "$@"; do
      key="${option%%|*}"
      if [ "$answer" = "$index" ] || [ "$answer" = "$key" ]; then
        printf '%s' "$key"
        return
      fi
      index=$((index + 1))
    done
  done
}

usage() {
  if [ "$UI" = en ]; then
    cat <<EOF
MoeShare installer

Usage: curl -fsSL https://moeshare.moestudio.net/install.sh | sudo bash -s -- [options]

  --docker            run MoeShare with Docker (recommended)
  --node              run MoeShare with Node.js and systemd
  --dir PATH          installation folder (default: /opt/moeshare)
  --domain NAME       domain for HTTPS through Caddy, e.g. share.example.com
  --email ADDRESS     email address for Let's Encrypt
  --db TYPE           sqlite, postgres or mariadb (Docker only)
  --clamav            also start the ClamAV virus scanner (Docker only)
  --port NUMBER       port of MoeShare on this server (default: 3000)
  --ref NAME          Git branch or tag (default: main)
  --update            update an existing installation
  --no-start          prepare everything but do not start
  -y, --yes           no questions, take the defaults
  -h, --help          show this help
EOF
  else
    cat <<EOF
Installationsskript für MoeShare

Aufruf: curl -fsSL https://moeshare.moestudio.net/install.sh | sudo bash -s -- [Optionen]

  --docker            MoeShare mit Docker betreiben (empfohlen)
  --node              MoeShare mit Node.js und systemd betreiben
  --dir PFAD          Installationsordner (Standard: /opt/moeshare)
  --domain NAME       Domain für HTTPS über Caddy, z. B. share.example.com
  --email ADRESSE     E-Mail-Adresse für Let's Encrypt
  --db ART            sqlite, postgres oder mariadb (nur Docker)
  --clamav            zusätzlich den Virenscanner ClamAV starten (nur Docker)
  --port ZAHL         Port von MoeShare auf diesem Server (Standard: 3000)
  --ref NAME          Git-Branch oder Tag (Standard: main)
  --update            bestehende Installation aktualisieren
  --no-start          alles vorbereiten, aber nicht starten
  -y, --yes           keine Fragen, Standardwerte nehmen
  -h, --help          diese Hilfe zeigen
EOF
  fi
}

need_value() {
  if [ $# -lt 2 ] || [ -z "$2" ]; then fail "$(t "Für $1 fehlt ein Wert." "$1 needs a value.")"; fi
}

parse() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --docker) MODE="docker" ;;
      --node) MODE="node" ;;
      --dir)
        need_value "$@"
        DIR="$2"
        shift
        ;;
      --dir=*) DIR="${1#*=}" ;;
      --domain)
        need_value "$@"
        DOMAIN="$2"
        ASKED_DOMAIN="yes"
        shift
        ;;
      --domain=*)
        DOMAIN="${1#*=}"
        ASKED_DOMAIN="yes"
        ;;
      --email)
        need_value "$@"
        EMAIL="$2"
        shift
        ;;
      --email=*) EMAIL="${1#*=}" ;;
      --db)
        need_value "$@"
        DATABASE="$2"
        shift
        ;;
      --db=*) DATABASE="${1#*=}" ;;
      --clamav) CLAMAV="yes" ;;
      --no-clamav) CLAMAV="no" ;;
      --port)
        need_value "$@"
        PORT="$2"
        shift
        ;;
      --port=*) PORT="${1#*=}" ;;
      --ref)
        need_value "$@"
        REF="$2"
        RAW="https://raw.githubusercontent.com/${REPO}/${REF}"
        shift
        ;;
      --ref=*)
        REF="${1#*=}"
        RAW="https://raw.githubusercontent.com/${REPO}/${REF}"
        ;;
      --update) ACTION="update" ;;
      --no-start) START="no" ;;
      -y | --yes) ASSUME_YES="yes" ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) fail "$(t "Unbekannte Option: $1 (Hilfe mit --help)" "Unknown option: $1 (see --help)")" ;;
    esac
    shift
  done
}

valid_domain() { printf '%s' "$1" | grep -Eq '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$'; }
valid_email() { printf '%s' "$1" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'; }

PM=""
for candidate in apt-get dnf yum zypper pacman apk; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PM="$candidate"
    break
  fi
done

install_packages() {
  [ $# -gt 0 ] || return 0
  case "$PM" in
    apt-get)
      DEBIAN_FRONTEND=noninteractive apt-get update -qq
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null
      ;;
    dnf | yum) "$PM" install -y -q "$@" >/dev/null ;;
    zypper) zypper --non-interactive install "$@" >/dev/null ;;
    pacman) pacman -Sy --noconfirm --needed "$@" >/dev/null ;;
    apk) apk add --no-cache "$@" >/dev/null ;;
    *) fail "$(t "Kein bekannter Paketmanager gefunden. Installiere selbst: $*" "No known package manager found. Install yourself: $*")" ;;
  esac
}

secret() { od -An -tx1 -N24 /dev/urandom | tr -d ' \n'; }

quietly() {
  local log
  log="$(mktemp)"
  if ! "$@" >"$log" 2>&1; then
    cat "$log" >&2
    rm -f "$log"
    return 1
  fi
  rm -f "$log"
}

download() {
  local source="$1" target="$2"
  mkdir -p "$(dirname "$target")"
  curl -fsSL --retry 3 --retry-delay 2 -o "$target.part" "$RAW/$source" || fail "$(t "Download fehlgeschlagen: $RAW/$source" "Download failed: $RAW/$source")"
  mv "$target.part" "$target"
}

server_ip() {
  local ip=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || ip=""
  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' | head -n 1)" || ip=""; fi
  printf '%s' "${ip:-localhost}"
}

public_address() {
  if [ -n "$DOMAIN" ]; then printf 'https://%s' "$DOMAIN"; else printf 'http://%s:%s' "$(server_ip)" "$PORT"; fi
}

has_systemd() { [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; }

port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -Hltn "sport = :$1" 2>/dev/null | grep -q .
  else
    return 1
  fi
}

wait_healthy() {
  local url="$1" tries=90
  while [ "$tries" -gt 0 ]; do
    if curl -fsS -o /dev/null --max-time 3 "$url" 2>/dev/null; then return 0; fi
    sleep 2
    tries=$((tries - 1))
  done
  return 1
}

setup_link() {
  local text="$1" link token
  link="$(printf '%s\n' "$text" | grep -Eo 'https?://[^[:space:]]+/setup\?token=[A-Za-z0-9_-]+' | tail -n 1 || true)"
  [ -n "$link" ] || return 0
  if [ -n "$DOMAIN" ]; then
    token="${link##*token=}"
    link="https://$DOMAIN/setup?token=$token"
  fi
  printf '%s' "$link"
}

plan() {
  if [ -z "$MODE" ]; then
    local fallback="docker"
    if ! command -v docker >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then fallback="docker"; fi
    MODE="$(choose "$(t 'Wie soll MoeShare laufen?' 'How should MoeShare run?')" "$fallback" \
      "docker|$(t 'Mit Docker (empfohlen, bringt Node.js und FFmpeg mit)' 'With Docker (recommended, includes Node.js and FFmpeg)')" \
      "node|$(t 'Mit Node.js und systemd direkt auf dem Server' 'With Node.js and systemd directly on the server')")"
  fi
  case "$MODE" in docker | node) ;; *) fail "$(t "Unbekannte Betriebsart: $MODE" "Unknown mode: $MODE")" ;; esac

  DIR="$(ask "$(t 'Installationsordner' 'Installation folder')" "$DIR")"
  case "$DIR" in /*) ;; *) fail "$(t 'Der Ordner muss ein absoluter Pfad sein.' 'The folder must be an absolute path.')" ;; esac

  if [ "$ASKED_DOMAIN" = "no" ]; then
    DOMAIN="$(ask "$(t 'Domain für HTTPS (leer lassen ohne Domain)' 'Domain for HTTPS (leave empty without a domain)')" "$DOMAIN")"
  fi
  DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -e 's#^https\?://##' -e 's#/.*$##')"
  if [ -n "$DOMAIN" ]; then
    valid_domain "$DOMAIN" || fail "$(t "Das ist keine gültige Domain: $DOMAIN" "Not a valid domain: $DOMAIN")"
    if [ -z "$EMAIL" ]; then
      EMAIL="$(ask "$(t "E-Mail für Let's Encrypt (optional)" "Email for Let's Encrypt (optional)")" "")"
    fi
    if [ -n "$EMAIL" ] && ! valid_email "$EMAIL"; then fail "$(t "Das ist keine gültige E-Mail-Adresse: $EMAIL" "Not a valid email address: $EMAIL")"; fi
  fi

  if [ "$MODE" = "docker" ]; then
    if [ -z "$DATABASE" ]; then
      DATABASE="$(choose "$(t 'Welche Datenbank?' 'Which database?')" "sqlite" \
        "sqlite|$(t 'SQLite (keine Einrichtung nötig)' 'SQLite (nothing to set up)')" \
        "postgres|PostgreSQL" \
        "mariadb|MariaDB")"
    fi
    if [ -z "$CLAMAV" ]; then
      if confirm "$(t 'Virenscanner ClamAV mitstarten? Braucht etwa 1,5 GB Arbeitsspeicher.' 'Also start the ClamAV virus scanner? Needs about 1.5 GB of memory.')" "$(t n n)"; then CLAMAV="yes"; else CLAMAV="no"; fi
    fi
  else
    DATABASE="sqlite"
    CLAMAV="no"
  fi
  case "$DATABASE" in sqlite | postgres | mariadb) ;; *) fail "$(t "Unbekannte Datenbank: $DATABASE" "Unknown database: $DATABASE")" ;; esac
  printf '%s' "$PORT" | grep -Eq '^[0-9]{2,5}$' || fail "$(t "Ungültiger Port: $PORT" "Invalid port: $PORT")"

  step "$(t 'Zusammenfassung' 'Summary')"
  say "  $(t 'Betrieb' 'Mode'):        $MODE"
  say "  $(t 'Ordner' 'Folder'):         $DIR"
  say "  $(t 'Adresse' 'Address'):        $(public_address)"
  [ -n "$EMAIL" ] && say "  $(t 'Zertifikate' 'Certificates'):    $EMAIL"
  say "  $(t 'Datenbank' 'Database'):      $DATABASE"
  if [ "$MODE" = "docker" ]; then
    if [ "$CLAMAV" = "yes" ]; then say "  ClamAV:         $(t ja yes)"; else say "  ClamAV:         $(t nein no)"; fi
  fi
  if [ "$ASSUME_YES" != "yes" ] && [ -n "$TTY" ]; then
    confirm "$(t 'Loslegen?' 'Go ahead?')" || fail "$(t 'Nichts geändert.' 'Nothing changed.')"
  fi
}

check_ports() {
  [ -n "$DOMAIN" ] || return 0
  for busy in 80 443; do
    if port_busy "$busy"; then
      warn "$(t "Port $busy ist schon belegt. Caddy braucht 80 und 443, sonst gibt es kein Zertifikat." "Port $busy is already in use. Caddy needs 80 and 443 to get a certificate.")"
    fi
  done
  if command -v getent >/dev/null 2>&1; then
    local addresses
    addresses="$(getent ahosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
    if [ -z "$addresses" ]; then
      warn "$(t "$DOMAIN zeigt noch auf keinen Server. Lege einen A- oder AAAA-Eintrag an, sonst schlägt das Zertifikat fehl." "$DOMAIN does not point to a server yet. Add an A or AAAA record, otherwise the certificate fails.")"
    else
      note "$(t "$DOMAIN zeigt auf: $addresses" "$DOMAIN points to: $addresses")"
    fi
  fi
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    if confirm "$(t 'Docker ist nicht installiert. Mit dem offiziellen Skript von get.docker.com installieren?' 'Docker is not installed. Install it with the official script from get.docker.com?')" "$(t j y)"; then
      step "$(t 'Docker wird installiert' 'Installing Docker')"
      curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
      quietly sh /tmp/get-docker.sh || fail "$(t 'Docker ließ sich nicht installieren.' 'Docker could not be installed.')"
      rm -f /tmp/get-docker.sh
      if has_systemd; then systemctl enable --now docker >/dev/null 2>&1 || true; fi
    else
      fail "$(t 'Ohne Docker geht es nur mit --node.' 'Without Docker, use --node.')"
    fi
  fi
  docker compose version >/dev/null 2>&1 || fail "$(t 'Docker Compose fehlt. Installiere das Paket docker-compose-plugin.' 'Docker Compose is missing. Install the docker-compose-plugin package.')"
  docker info >/dev/null 2>&1 || fail "$(t 'Docker läuft nicht. Starte es mit: systemctl start docker' 'Docker is not running. Start it with: systemctl start docker')"
}

env_value() {
  local key="$1" value="$2" file="$3"
  if grep -q "^$key=" "$file" 2>/dev/null; then
    sed -i "s|^$key=.*|$key=$value|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

docker_install() {
  ensure_docker
  mkdir -p "$DIR"
  cd "$DIR"
  if [ -f docker-compose.yml ]; then
    fail "$(t "In $DIR liegt schon eine Installation. Zum Aktualisieren: install.sh --update" "$DIR already contains an installation. To update: install.sh --update")"
  fi
  step "$(t 'Dateien werden geladen' 'Downloading files')"
  download docker-compose.yml docker-compose.yml
  local files="docker-compose.yml" profiles=""
  if [ -n "$DOMAIN" ]; then
    download docker/Caddyfile docker/Caddyfile
    if [ -n "$EMAIL" ]; then
      awk -v email="$EMAIL" 'NR == 1 && $0 == "{" { print; print "\temail " email; next } { print }' docker/Caddyfile >docker/Caddyfile.part
      mv docker/Caddyfile.part docker/Caddyfile
    fi
    profiles="caddy"
  fi
  case "$DATABASE" in
    postgres)
      download docker/postgres.yml docker/postgres.yml
      files="$files:docker/postgres.yml"
      ;;
    mariadb)
      download docker/mariadb.yml docker/mariadb.yml
      files="$files:docker/mariadb.yml"
      ;;
  esac
  if [ "$CLAMAV" = "yes" ]; then
    download docker/clamav.yml docker/clamav.yml
    files="$files:docker/clamav.yml"
  fi
  touch .env
  chmod 600 .env
  [ -n "$DOMAIN" ] && env_value DOMAIN "$DOMAIN" .env
  [ -n "$profiles" ] && env_value COMPOSE_PROFILES "$profiles" .env
  [ "$files" != "docker-compose.yml" ] && env_value COMPOSE_FILE "$files" .env
  [ "$DATABASE" = "postgres" ] && env_value POSTGRES_PASSWORD "$(secret)" .env
  [ "$DATABASE" = "mariadb" ] && env_value MARIADB_PASSWORD "$(secret)" .env
  [ "$PORT" != "3000" ] && env_value MOESHARE_PORT "$PORT" .env
  [ -n "$DOMAIN" ] && env_value MOESHARE_BIND "127.0.0.1" .env
  mkdir -p db uploads
  note "$(t "Gespeichert in $DIR" "Saved to $DIR")"
  check_ports
  if [ "$START" = "no" ]; then return 0; fi
  step "$(t 'Container werden gestartet' 'Starting containers')"
  quietly docker compose pull || fail "$(t 'Die Images ließen sich nicht laden.' 'The images could not be pulled.')"
  quietly docker compose up -d || fail "$(t 'Die Container ließen sich nicht starten: docker compose logs' 'The containers could not be started: docker compose logs')"
  step "$(t 'Warte auf MoeShare' 'Waiting for MoeShare')"
  wait_healthy "http://127.0.0.1:$PORT/healthz" || fail "$(t 'MoeShare startet nicht. Schau in die Logs: docker compose logs moeshare' 'MoeShare does not start. Check the logs: docker compose logs moeshare')"
  sleep 1
  LINK="$(setup_link "$(docker compose logs --no-color moeshare 2>/dev/null || true)")"
}

docker_update() {
  cd "$DIR"
  step "$(t 'Neue Version wird geladen' 'Pulling the new version')"
  quietly docker compose pull || fail "$(t 'Die Images ließen sich nicht laden.' 'The images could not be pulled.')"
  quietly docker compose up -d --remove-orphans || fail "$(t 'Die Container ließen sich nicht starten: docker compose logs' 'The containers could not be started: docker compose logs')"
  wait_healthy "http://127.0.0.1:${MOESHARE_PORT_FOUND:-$PORT}/healthz" || warn "$(t 'MoeShare antwortet noch nicht. Schau in die Logs: docker compose logs moeshare' 'MoeShare does not answer yet. Check the logs: docker compose logs moeshare')"
  docker image prune -f >/dev/null 2>&1 || true
}

node_version() {
  if command -v node >/dev/null 2>&1; then node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; else echo 0; fi
}

ensure_node() {
  if [ "$(node_version)" -ge "$NODE_MAJOR" ]; then return 0; fi
  step "$(t "Node.js $NODE_MAJOR wird installiert" "Installing Node.js $NODE_MAJOR")"
  case "$PM" in
    apt-get)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource.sh
      bash /tmp/nodesource.sh >/dev/null
      rm -f /tmp/nodesource.sh
      install_packages nodejs
      ;;
    dnf | yum)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource.sh
      bash /tmp/nodesource.sh >/dev/null
      rm -f /tmp/nodesource.sh
      install_packages nodejs
      ;;
    pacman) install_packages nodejs npm ;;
    apk) install_packages nodejs npm ;;
    *) fail "$(t "Installiere Node.js $NODE_MAJOR oder neuer selbst und starte das Skript erneut." "Install Node.js $NODE_MAJOR or newer yourself and run the script again.")" ;;
  esac
  [ "$(node_version)" -ge "$NODE_MAJOR" ] || fail "$(t "Node.js $NODE_MAJOR ließ sich nicht installieren." "Node.js $NODE_MAJOR could not be installed.")"
}

node_packages() {
  step "$(t 'Pakete werden installiert' 'Installing packages')"
  case "$PM" in
    apt-get) install_packages git ca-certificates ffmpeg python3 make g++ ;;
    dnf | yum) install_packages git ca-certificates python3 make gcc-c++ ;;
    zypper) install_packages git ca-certificates ffmpeg python3 make gcc-c++ ;;
    pacman) install_packages git ca-certificates ffmpeg python make gcc ;;
    apk) install_packages git ca-certificates ffmpeg python3 make g++ ;;
  esac
  command -v ffmpeg >/dev/null 2>&1 || warn "$(t 'FFmpeg fehlt. Ohne FFmpeg gibt es keine Video-Vorschauen.' 'FFmpeg is missing. Without it there are no video previews.')"
  ensure_node
}

as_service() {
  local cache status=0
  cache="$(mktemp -d)"
  chown "$SERVICE_USER" "$cache"
  runuser -u "$SERVICE_USER" -- env HOME="$DIR" PATH="$PATH" npm_config_cache="$cache" sh -c "cd \"\$1\" && shift && exec \"\$@\"" sh "$DIR" "$@" || status=$?
  rm -rf "$cache"
  return "$status"
}

check_access() {
  runuser -u "$SERVICE_USER" -- test -x "$(dirname "$DIR")" ||
    fail "$(t "Der Benutzer $SERVICE_USER kommt nicht an den Ordner $(dirname "$DIR"). Nimm einen Ordner wie /opt/moeshare." "The user $SERVICE_USER cannot reach $(dirname "$DIR"). Use a folder like /opt/moeshare.")"
}

write_unit() {
  local node_bin
  node_bin="$(command -v node)"
  cat >/etc/systemd/system/moeshare.service <<EOF
[Unit]
Description=MoeShare
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$DIR
Environment=NODE_ENV=production
Environment=MOESHARE_INSTALL=script
Environment=PORT=$PORT
ExecStart=$node_bin index.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=25
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$DIR

[Install]
WantedBy=multi-user.target
EOF
}

native_caddy() {
  [ -n "$DOMAIN" ] || return 0
  if ! command -v caddy >/dev/null 2>&1; then
    step "$(t 'Caddy wird installiert' 'Installing Caddy')"
    case "$PM" in
      apt-get)
        install_packages debian-keyring debian-archive-keyring apt-transport-https gnupg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
        install_packages caddy
        ;;
      dnf | yum)
        "$PM" install -y -q 'dnf-command(copr)' >/dev/null 2>&1 || true
        "$PM" copr enable -y @caddy/caddy >/dev/null 2>&1 || true
        install_packages caddy
        ;;
      pacman | apk | zypper) install_packages caddy ;;
    esac
  fi
  command -v caddy >/dev/null 2>&1 || {
    warn "$(t 'Caddy ließ sich nicht installieren. Richte HTTPS selbst ein, MoeShare läuft auf Port' 'Caddy could not be installed. Set up HTTPS yourself, MoeShare runs on port') $PORT."
    return 0
  }
  mkdir -p /etc/caddy
  if [ -f /etc/caddy/Caddyfile ]; then cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.vor-moeshare-$(date +%Y%m%d%H%M%S)"; fi
  {
    printf '{\n'
    [ -n "$EMAIL" ] && printf '\temail %s\n' "$EMAIL"
    printf '\ton_demand_tls {\n\t\task http://127.0.0.1:%s/api/domains/tls\n\t}\n}\n\n' "$PORT"
    printf '%s {\n\treverse_proxy 127.0.0.1:%s\n}\n\n' "$DOMAIN" "$PORT"
    printf 'https:// {\n\ttls {\n\t\ton_demand\n\t}\n\treverse_proxy 127.0.0.1:%s\n}\n' "$PORT"
  } >/etc/caddy/Caddyfile
  caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
  if has_systemd; then
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl restart caddy || warn "$(t 'Caddy ließ sich nicht starten: journalctl -u caddy' 'Caddy failed to start: journalctl -u caddy')"
  fi
}

node_install() {
  node_packages
  step "$(t 'MoeShare wird geladen' 'Downloading MoeShare')"
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$SERVICE_USER" 2>/dev/null || adduser -S -h "$DIR" "$SERVICE_USER"
  fi
  if [ -d "$DIR/.git" ]; then
    fail "$(t "In $DIR liegt schon eine Installation. Zum Aktualisieren: install.sh --update" "$DIR already contains an installation. To update: install.sh --update")"
  fi
  if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    fail "$(t "Der Ordner $DIR ist nicht leer." "The folder $DIR is not empty.")"
  fi
  mkdir -p "$(dirname "$DIR")"
  check_access
  git clone --quiet --depth 1 --branch "$REF" "https://github.com/$REPO.git" "$DIR" </dev/null || fail "$(t 'Das Repository ließ sich nicht laden.' 'The repository could not be cloned.')"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$DIR"
  step "$(t 'Abhängigkeiten werden installiert' 'Installing dependencies')"
  quietly as_service npm ci --omit=dev --no-audit --no-fund || fail "$(t 'npm ci ist fehlgeschlagen.' 'npm ci failed.')"
  if has_systemd; then
    write_unit
    systemctl daemon-reload
    systemctl enable moeshare >/dev/null 2>&1
  else
    warn "$(t 'Kein systemd gefunden. Starte MoeShare selbst mit:' 'No systemd found. Start MoeShare yourself with:') cd $DIR && sudo -u $SERVICE_USER node index.js"
  fi
  native_caddy
  check_ports
  if [ "$START" = "no" ] || ! has_systemd; then return 0; fi
  step "$(t 'MoeShare wird gestartet' 'Starting MoeShare')"
  systemctl restart moeshare
  wait_healthy "http://127.0.0.1:$PORT/healthz" || fail "$(t 'MoeShare startet nicht. Schau in die Logs: journalctl -u moeshare' 'MoeShare does not start. Check the logs: journalctl -u moeshare')"
  sleep 1
  LINK="$(setup_link "$(journalctl -u moeshare -n 300 --no-pager 2>/dev/null || true)")"
}

node_update() {
  node_packages
  step "$(t 'Neue Version wird geladen' 'Pulling the new version')"
  git -c safe.directory="$DIR" -C "$DIR" pull --quiet --ff-only </dev/null ||
    fail "$(t 'git pull ist fehlgeschlagen. Prüfe die Verbindung zu GitHub und ob im Ordner Dateien geändert wurden.' 'git pull failed. Check the connection to GitHub and whether files in the folder were changed.')"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$DIR"
  quietly as_service npm ci --omit=dev --no-audit --no-fund || fail "$(t 'npm ci ist fehlgeschlagen.' 'npm ci failed.')"
  if has_systemd; then
    systemctl restart moeshare
    wait_healthy "http://127.0.0.1:$PORT/healthz" || warn "$(t 'MoeShare antwortet noch nicht: journalctl -u moeshare' 'MoeShare does not answer yet: journalctl -u moeshare')"
  fi
}

update() {
  if [ -d "$DIR/.git" ]; then
    PORT="$(grep -Eo 'PORT=[0-9]+' /etc/systemd/system/moeshare.service 2>/dev/null | head -n 1 | cut -d= -f2 || echo "$PORT")"
    node_update
  elif [ -f "$DIR/docker-compose.yml" ]; then
    ensure_docker
    MOESHARE_PORT_FOUND="$(grep -E '^MOESHARE_PORT=' "$DIR/.env" 2>/dev/null | cut -d= -f2 || true)"
    docker_update
  else
    fail "$(t "In $DIR wurde keine Installation gefunden. Den Ordner gibst du mit --dir an." "No installation found in $DIR. Set the folder with --dir.")"
  fi
  step "$(t 'Fertig, MoeShare ist auf dem neuesten Stand.' 'Done, MoeShare is up to date.')"
  say "$(t 'Was neu ist, steht im Changelog:' 'What is new is in the changelog:') https://moeshare.moestudio.net/changelog.html"
}

finish() {
  local address
  address="$(public_address)"
  step "$(t 'MoeShare ist installiert' 'MoeShare is installed')"
  if [ "$START" = "no" ]; then
    say "$(t 'Gestartet wurde noch nichts.' 'Nothing has been started yet.')"
  elif [ -n "${LINK:-}" ]; then
    say "$(t 'Öffne diesen Link, um dein Admin-Konto anzulegen:' 'Open this link to create your admin account:')"
    say "  ${BOLD}${LINK}${RESET}"
  elif [ "$MODE" = "node" ] && ! has_systemd; then
    say "$(t 'Starte MoeShare mit dem Befehl unten. Der Link zum Einrichten erscheint dann in der Ausgabe.' 'Start MoeShare with the command below. The setup link then appears in the output.')"
  else
    say "$(t "Öffne $address/setup. Den Link mit Code findest du in den Logs." "Open $address/setup. The link with the code is in the logs.")"
  fi
  say ""
  if [ "$MODE" = "docker" ]; then
    say "$(t 'Logs' 'Logs'):       cd $DIR && docker compose logs -f moeshare"
    say "$(t 'Sicherung' 'Backup'):  cd $DIR && docker compose exec moeshare moeshare backup --uploads"
  else
    if has_systemd; then say "$(t 'Logs' 'Logs'):       journalctl -u moeshare -f"; else say "$(t 'Start' 'Start'):      cd $DIR && sudo -u $SERVICE_USER PORT=$PORT node index.js"; fi
    say "$(t 'Sicherung' 'Backup'):  cd $DIR && sudo -u $SERVICE_USER node cli.js backup --uploads"
  fi
  say "$(t 'Update' 'Update'):     curl -fsSL https://moeshare.moestudio.net/install.sh | sudo bash -s -- --update$([ "$DIR" != /opt/moeshare ] && printf ' --dir %s' "$DIR")"
  [ -n "$DOMAIN" ] && say "" && note "$(t "Zeigt $DOMAIN auf diesen Server, holt Caddy das Zertifikat beim ersten Aufruf selbst." "Once $DOMAIN points to this server, Caddy fetches the certificate on the first visit.")"
  return 0
}

main() {
  parse "$@"
  [ "$(uname -s)" = "Linux" ] || fail "$(t 'Das Skript läuft nur unter Linux.' 'This script only runs on Linux.')"
  [ "$(id -u)" -eq 0 ] || fail "$(t 'Bitte als root starten, zum Beispiel: curl -fsSL https://moeshare.moestudio.net/install.sh | sudo bash' 'Please run as root, for example: curl -fsSL https://moeshare.moestudio.net/install.sh | sudo bash')"
  command -v curl >/dev/null 2>&1 || fail "$(t 'curl fehlt. Installiere es zuerst.' 'curl is missing. Install it first.')"
  say "${BOLD}MoeShare${RESET} $(t 'Installation' 'installer')"
  if [ "$ACTION" = "update" ]; then
    update
    return 0
  fi
  plan
  LINK=""
  if [ "$MODE" = "docker" ]; then docker_install; else node_install; fi
  finish
}

main "$@"
