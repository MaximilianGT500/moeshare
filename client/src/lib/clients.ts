import { t } from './i18n';

export type ClientKind = 'flameshot' | 'spectacle' | 'macos' | 'curl' | 'shortcuts';

export interface ClientSpec {
  kind: ClientKind;
  name: string;
  platform: string;
  description: string;
  script: boolean;
}

export const CLIENTS: ClientSpec[] = [
  {
    kind: 'flameshot',
    name: 'Flameshot',
    platform: 'Linux',
    description: t('Bereich auswählen, hochladen, Link landet in der Zwischenablage. Für X11 und Wayland.'),
    script: true,
  },
  {
    kind: 'spectacle',
    name: 'KDE Spectacle',
    platform: 'Linux',
    description: t('Dasselbe mit dem Bildschirmfoto-Programm von KDE Plasma.'),
    script: true,
  },
  {
    kind: 'macos',
    name: t('Bildschirmfoto auf dem Mac'),
    platform: 'macOS',
    description: t('Nutzt das eingebaute screencapture. Lässt sich mit Kurzbefehle auf eine Taste legen.'),
    script: true,
  },
  {
    kind: 'shortcuts',
    name: t('Kurzbefehle'),
    platform: 'iPhone, iPad, Mac',
    description: t('Ein Kurzbefehl, der Fotos oder Bildschirmfotos hochlädt und den Link kopiert.'),
    script: false,
  },
  {
    kind: 'curl',
    name: 'curl',
    platform: t('Kommandozeile'),
    description: t('Für eigene Skripte, Automationen und Server.'),
    script: false,
  },
];

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

function header(site: string, uploadUrl: string, token: string) {
  return ['#!/usr/bin/env bash', 'set -euo pipefail', `SITE=${quote(site)}`, `URL=${quote(uploadUrl)}`, `TOKEN=${quote(token)}`, ''];
}

const TEMP = ['DIR="$(mktemp -d)"', 'trap \'rm -rf "$DIR"\' EXIT', 'FILE="$DIR/screenshot.png"'];

const UPLOAD = [
  '[ -s "$FILE" ] || exit 0',
  'RESPONSE="$(curl -sS --fail-with-body -H "Authorization: $TOKEN" -H "Accept: application/json" -F "file=@$FILE" "$URL")" || { echo "$RESPONSE" >&2; exit 1; }',
  'LINK="$(printf \'%s\' "$RESPONSE" | sed -n \'s/.*"view":"\\([^"]*\\)".*/\\1/p\')"',
  '[ -n "$LINK" ] || { echo "$RESPONSE" >&2; exit 1; }',
];

const LINUX_CLIPBOARD = [
  'if [ -n "${WAYLAND_DISPLAY:-}" ] && command -v wl-copy >/dev/null 2>&1; then',
  '  printf \'%s\' "$LINK" | wl-copy',
  'elif command -v xclip >/dev/null 2>&1; then',
  '  printf \'%s\' "$LINK" | xclip -selection clipboard',
  'elif command -v xsel >/dev/null 2>&1; then',
  '  printf \'%s\' "$LINK" | xsel --clipboard --input',
  'fi',
  'if command -v notify-send >/dev/null 2>&1; then notify-send "$SITE" "$LINK" || true; fi',
  'echo "$LINK"',
];

export function clientScript(kind: ClientKind, { site, baseUrl, token }: { site: string; baseUrl: string; token: string }): string {
  const uploadUrl = `${baseUrl}/upload`;
  if (kind === 'flameshot') {
    return [
      ...header(site, uploadUrl, token),
      ...TEMP,
      'flameshot gui --raw > "$FILE" 2>/dev/null || exit 0',
      ...UPLOAD,
      ...LINUX_CLIPBOARD,
      '',
    ].join('\n');
  }
  if (kind === 'spectacle') {
    return [
      ...header(site, uploadUrl, token),
      ...TEMP,
      'spectacle --background --region --nonotify --output "$FILE" || exit 0',
      ...UPLOAD,
      ...LINUX_CLIPBOARD,
      '',
    ].join('\n');
  }
  if (kind === 'macos') {
    return [
      ...header(site, uploadUrl, token),
      ...TEMP,
      'screencapture -i "$FILE" || exit 0',
      ...UPLOAD,
      'printf \'%s\' "$LINK" | pbcopy',
      'osascript -e "display notification \\"$LINK\\" with title \\"$SITE\\"" >/dev/null 2>&1 || true',
      'echo "$LINK"',
      '',
    ].join('\n');
  }
  return `curl -H "Authorization: ${token}" -F "file=@bild.png" ${uploadUrl}`;
}

export function clientFilename(kind: ClientKind, slug: string) {
  return `${slug}-${kind}.sh`;
}

export function clientSteps(kind: ClientKind, filename: string): string[] {
  if (kind === 'flameshot') {
    return [
      t('Speichere das Skript, etwa als ~/.local/bin/{file}, und mach es mit chmod +x ausführbar.', { file: filename }),
      t('Nötig sind flameshot und curl, für die Zwischenablage wl-clipboard (Wayland) oder xclip (X11).'),
      t('Lege in den Systemeinstellungen ein Tastenkürzel an, das das Skript startet, zum Beispiel Strg+Umschalt+4.'),
    ];
  }
  if (kind === 'spectacle') {
    return [
      t('Speichere das Skript, etwa als ~/.local/bin/{file}, und mach es mit chmod +x ausführbar.', { file: filename }),
      t('Nötig sind spectacle und curl, für die Zwischenablage wl-clipboard oder xclip.'),
      t('In den Systemeinstellungen unter Tastatur › Kurzbefehle legst du einen neuen Befehl mit dem Skript an.'),
    ];
  }
  if (kind === 'macos') {
    return [
      t('Speichere das Skript, etwa als ~/bin/{file}, und mach es mit chmod +x ausführbar.', { file: filename }),
      t('In Kurzbefehle legst du einen Kurzbefehl mit der Aktion „Shell-Skript ausführen“ an, der das Skript startet.'),
      t('Unter Kurzbefehl-Details › Tastaturkurzbefehl hinzufügen legst du ihn auf eine Taste.'),
    ];
  }
  if (kind === 'curl') {
    return [
      t('Die Antwort ist JSON mit den Links view, direct, preview und delete.'),
      t('Für Texte gibt es /api/texts, für Kurzlinks /api/shorten. Beide nehmen dasselbe Token.'),
    ];
  }
  return [];
}
