#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Uruchom jako root: sudo bash scripts/install-ubuntu.sh"
  echo "Run as root: sudo bash scripts/install-ubuntu.sh"
  exit 1
fi

REPO="https://github.com/iwo2003/projekt_dashbord.git"
TARGET="/opt/helios"
SCRIPT_FILE="${BASH_SOURCE[0]:-}"

if [[ ! -f "${SCRIPT_FILE}" ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates git
  if [[ -d "${TARGET}/.git" ]]; then
    git -C "${TARGET}" pull --ff-only
  elif [[ ! -f "${TARGET}/package.json" ]]; then
    if [[ -e "${TARGET}" ]]; then
      echo "Katalog ${TARGET} już istnieje i nie jest tym projektem."
      echo "Directory ${TARGET} already exists and is not this project."
      exit 1
    fi
    git clone "${REPO}" "${TARGET}"
  fi
  exec bash "${TARGET}/scripts/install-ubuntu.sh"
fi

ROOT="$(cd "$(dirname "${SCRIPT_FILE}")/.." && pwd)"
if [[ ! -f "${ROOT}/package.json" ]]; then
  echo "Nie widzę package.json w ${ROOT}"
  echo "package.json was not found in ${ROOT}"
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

if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp || true
  ufw allow 3000/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow 25565/tcp || true
  ufw allow 27015/tcp || true
  ufw allow 27015/udp || true
  ufw allow 27020/udp || true
  ufw allow 27016/udp || true
  ufw allow 10823/tcp || true
  ufw allow 10823/udp || true
  ufw allow 10824/tcp || true
  ufw allow 30120/tcp || true
  ufw allow 30120/udp || true
  ufw allow 3306/tcp || true
  ufw allow 2222/tcp || true
  ufw allow 21/tcp || true
  ufw allow 21000:21010/tcp || true
  ufw allow 25/tcp || true
  ufw allow 465/tcp || true
  ufw allow 587/tcp || true
  ufw allow 993/tcp || true
  if ufw status | grep -q "Status: active"; then
    ufw reload || true
  fi
fi
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
systemctl restart docker || true

IP="$(hostname -I | awk '{print $1}')"
echo
echo "Helios działa: http://${IP}:3000"
echo "Helios is running: http://${IP}:3000"
echo "Logi / logs: journalctl -u helios -f"
