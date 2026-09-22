#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Uruchom jako root: sudo bash scripts/install-ubuntu.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "${ROOT}/package.json" ]]; then
  echo "Nie widzę package.json w ${ROOT}"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg tar git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

cd "${ROOT}"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build

cat > /etc/systemd/system/helios.service <<EOF
[Unit]
Description=Helios panel serwerów
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=${ROOT}
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 0.0.0.0 --port 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now helios

# Kontenery Dockera wychodzą w świat przez łańcuch FORWARD. Przy polityce DROP
# Paper nie może rozwiązać DNS i pobieranie kończy się „Network is unreachable”.
sysctl -w net.ipv4.ip_forward=1
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-helios.conf
iptables -P FORWARD ACCEPT || true
if [[ -f /etc/default/ufw ]]; then
  sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw reload || true
  ufw allow 3000/tcp
  ufw allow 25565/tcp
  ufw allow 27015/tcp
  ufw allow 27015/udp
  ufw allow 27020/udp
  ufw allow 3306/tcp
  ufw allow 2222/tcp
  ufw allow 21/tcp
  ufw allow 21000:21010/tcp
  ufw allow 25/tcp
  ufw allow 465/tcp
  ufw allow 587/tcp
  ufw allow 993/tcp
fi
systemctl restart docker || true

IP="$(hostname -I | awk '{print $1}')"
echo
echo "Helios działa: http://${IP}:3000"
echo "Logi: journalctl -u helios -f"
