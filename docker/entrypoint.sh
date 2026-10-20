#!/bin/sh
set -e

if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

uid="${PUID:-1000}"
gid="${PGID:-1000}"
case "$uid$gid" in
  '' | *[!0-9]*)
    echo "PUID und PGID müssen Zahlen sein (gerade: PUID=$uid, PGID=$gid)." >&2
    exit 1
    ;;
esac

for dir in /opt/moeshare/db /opt/moeshare/uploads; do
  mkdir -p "$dir"
  find "$dir" \( ! -user "$uid" -o ! -group "$gid" \) -exec chown -h "$uid:$gid" {} + 2>/dev/null || true
  if ! setpriv --reuid="$uid" --regid="$gid" --clear-groups test -w "$dir"; then
    echo "MoeShare kann nicht in $dir schreiben. Gib dem Ordner auf dem Host die Rechte von $uid:$gid oder setze PUID und PGID passend." >&2
  fi
done

exec setpriv --reuid="$uid" --regid="$gid" --clear-groups --inh-caps=-all "$@"
