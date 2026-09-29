#!/usr/bin/env bash
#
# Redeploy the app on the server. Run from anywhere:
#   /opt/options-pricer/deploy/deploy.sh
#
# Pulls the latest code, syncs dependencies, rebuilds the frontend, restarts
# the backend, and verifies it came back up.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/options-pricer}"
UV="${UV:-$HOME/.local/bin/uv}"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

cd "$APP_DIR" || fail "app directory $APP_DIR not found"

step "Pulling latest code"
git pull --ff-only

step "Syncing Python dependencies"
"$UV" pip install -r requirements.txt --python "$APP_DIR/.venv/bin/python"

step "Building frontend"
if [ -f frontend/package-lock.json ]; then
    npm --prefix frontend ci
else
    npm --prefix frontend install
fi
npm --prefix frontend run build
[ -f frontend/dist/index.html ] || fail "frontend build produced no dist/index.html"

step "Restarting backend"
sudo systemctl restart options-pricer

step "Installing nightly cache refresh"
# Idempotent: re-copying unchanged units and re-enabling an enabled timer is a no-op.
sudo install -m 644 deploy/cache-refresh.service deploy/cache-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cache-refresh.timer
systemctl list-timers cache-refresh --no-pager

step "Installing nginx hardening"
# conf.d, not the site file: certbot owns the site file's HTTPS config.
sudo install -m 644 deploy/nginx-hardening.conf /etc/nginx/conf.d/options-pricer-hardening.conf

step "Reloading nginx"
if ! sudo nginx -t; then
    # Don't leave a config behind that would stop nginx on its next restart
    sudo rm -f /etc/nginx/conf.d/options-pricer-hardening.conf
    fail "nginx config test failed; removed the hardening config, site left unchanged"
fi
sudo systemctl reload nginx

step "Health check"
# Give uvicorn a moment to bind before probing.
for i in $(seq 1 10); do
    if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
        curl -fsS http://127.0.0.1:8000/health
        printf '\n\n\033[1;32mDeploy complete.\033[0m\n'
        exit 0
    fi
    sleep 1
done

fail "backend did not become healthy — check: journalctl -u options-pricer -n 50"
