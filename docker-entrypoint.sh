#!/bin/sh
set -e

DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
if ! getent group docker >/dev/null; then
  addgroup -g "$DOCKER_GID" docker
fi
addgroup nodejs docker

exec node server.js 
