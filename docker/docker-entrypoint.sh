#!/bin/sh
set -e

DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
if [ "$DOCKER_GID" -ne 0 ]; then
  if ! getent group docker >/dev/null; then
    addgroup -g "$DOCKER_GID" docker
  fi
  addgroup nodejs docker
else
  addgroup nodejs root
fi

exec su nodejs -c "node server.js" 
