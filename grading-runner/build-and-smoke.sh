#!/bin/sh
set -eu
cd "$(dirname "$0")"
[ "$(docker info --format '{{.OSType}}')" = linux ]
# Only trusted repository image definitions are built; no submission Dockerfile is used.
docker pull node:22-bookworm-slim
node_base=$(docker image inspect node:22-bookworm-slim --format '{{index .RepoDigests 0}}')
docker build --build-arg "NODE_IMAGE=$node_base" -t vintern-runtime-smoke images/runtime
docker build --build-arg "NODE_IMAGE=$node_base" -t vintern-tester-smoke images/tester
RUNTIME_IMAGE=$(docker image inspect vintern-runtime-smoke --format '{{.Id}}')
TESTER_IMAGE=$(docker image inspect vintern-tester-smoke --format '{{.Id}}')
export RUNTIME_IMAGE TESTER_IMAGE
node test/docker-smoke.mjs
node -e 'console.log(JSON.stringify({runtimeImage:process.env.RUNTIME_IMAGE,testerImage:process.env.TESTER_IMAGE}))'
