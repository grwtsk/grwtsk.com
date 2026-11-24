#!/bin/sh
set -eu
umask 077
if [ "$(id -u)" = 0 ]; then
  if [ "${STATE_BACKEND:-github}" = volume ] && [ "${STATE_DIR:-}" = /data/correspondence ] && [ "${RAILWAY_VOLUME_MOUNT_PATH:-}" = /data ]; then
    [ -d /data ] && [ ! -L /data ] || exit 1
    if [ ! -e /data/correspondence ]; then mkdir -m 700 /data/correspondence; fi
    [ -d /data/correspondence ] && [ ! -L /data/correspondence ] || exit 1
    chown node:node /data/correspondence
    chmod 700 /data/correspondence
  fi
  exec setpriv --reuid=node --regid=node --init-groups --no-new-privs node server.mjs
fi
exec node server.mjs
