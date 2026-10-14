#!/bin/sh
set -eu
# Run only on a dedicated, newly provisioned Ubuntu worker, never the API/database host.
[ "$(id -u)" = 0 ] || { echo 'Root on the dedicated worker is required' >&2; exit 1; }
. /etc/os-release
[ "$ID" = ubuntu ] && [ "$VERSION_CODENAME" = noble ] || { echo 'This provisioner targets Ubuntu 24.04 only' >&2; exit 1; }
[ "$(dpkg --print-architecture)" = amd64 ] || { echo 'An amd64 worker is required' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils
install -m 0755 -d /etc/apt/keyrings
curl -fsSL --max-time 60 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<'SOURCES'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
SOURCES
apt-get update
apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin
download_dir=$(mktemp -d /tmp/vintern-node.XXXXXXXX)
trap 'rm -f "$download_dir/SHASUMS256.txt" "$download_dir/checksum.txt" "$download_dir/node.tar.xz"; rmdir "$download_dir"' EXIT
curl -fsSL --max-time 60 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$download_dir/SHASUMS256.txt"
node_file=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ { print $2 }' "$download_dir/SHASUMS256.txt")
case "$node_file" in node-v22.*-linux-x64.tar.xz) ;; *) echo 'Invalid Node release metadata' >&2; exit 1 ;; esac
curl -fsSL --max-time 180 "https://nodejs.org/dist/latest-v22.x/$node_file" -o "$download_dir/node.tar.xz"
awk -v name="$node_file" '$2 == name { print $1 "  node.tar.xz" }' "$download_dir/SHASUMS256.txt" > "$download_dir/checksum.txt"
(cd "$download_dir" && sha256sum --check checksum.txt)
tar -xJf "$download_dir/node.tar.xz" -C /opt
node_directory=${node_file%.tar.xz}
ln -sf "/opt/$node_directory/bin/node" /usr/local/bin/node
systemctl enable --now docker
node --version
docker info --format '{{.OSType}}'
