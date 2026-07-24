# Deployment runbook — finance.imaadhusoof.com

Fresh Ubuntu 22.04 Lightsail instance → live HTTPS site. Work through in order;
each step assumes the previous one succeeded.

**Target architecture:** one instance runs everything. nginx serves the built
React files and reverse-proxies `/api` to uvicorn on loopback. The parquet cache
lives at `/var/lib/options-pricer/cache`, outside the app directory, so
redeploys never wipe it.

| Thing | Value |
|---|---|
| Domain | `finance.imaadhusoof.com` |
| Static IP | `15.135.171.212` |
| App directory | `/opt/options-pricer` |
| Cache directory | `/var/lib/options-pricer/cache` |
| Backend | uvicorn on `127.0.0.1:8000` (never exposed publicly) |

---

## Step 0 — Prerequisites

Confirm before starting:

- [ ] Lightsail instance running Ubuntu 22.04, **at least 1 GB RAM**
- [ ] Static IP attached
- [ ] Firewall allows ports 22, 80, 443
- [ ] `nslookup finance.imaadhusoof.com` returns `15.135.171.212`

**Do not start step 8 (certbot) until DNS resolves** — certificate issuance will
fail and Let's Encrypt rate-limits repeated failures.

---

## Step 1 — Get the code onto GitHub

> **This project is not a git repository yet.** You need it somewhere the server
> can clone from. Run these **on your Windows machine**, in the project root.

```bash
git init
git add .
git commit -m "Initial commit: data layer + frontend"
```

Then point it at the GitHub repo and push:

```bash
git remote add origin https://github.com/imaadhusoof/Finance-website.git
git branch -M main
git push -u origin main
```

Check that `data_cache/`, `.venv/`, and `node_modules/` are **not** in the push —
`.gitignore` already excludes them. The server builds its own copies.

*No-git alternative:* you can `scp -r` the project to the server instead, but
then `deploy.sh` won't work and every update is a manual copy. Git is worth it.

---

## Step 2 — Connect to the server

Use the **Connect using SSH** button in the Lightsail console (easiest), or your
own terminal with the downloaded key:

```bash
ssh -i LightsailDefaultKey.pem ubuntu@15.135.171.212
```

Everything from here runs **on the server**.

---

## Step 3 — System prep

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl
```

**Add swap.** On a 1 GB instance this is the difference between a working box
and one that gets OOM-killed mid cache-refresh (pandas + pyarrow are hungry):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verify:

```bash
free -h
```

You should see ~2 Gi under `Swap`.

---

## Step 4 — Install uv and Node

uv manages Python (Ubuntu 22.04 ships 3.10; the project wants 3.12):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"
uv --version
```

Node 20 for the frontend build:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

---

## Step 5 — Clone the app

```bash
sudo mkdir -p /opt/options-pricer
sudo chown ubuntu:ubuntu /opt/options-pricer
git clone https://github.com/imaadhusoof/Finance-website.git /opt/options-pricer
cd /opt/options-pricer
```

(The repo is public, so this clones without credentials. If you later switch it
to private, GitHub will prompt — use a **personal access token** as the
password, not your account password.)

---

## Step 6 — Python environment

```bash
cd /opt/options-pricer
uv venv --python 3.12
uv pip install -r requirements.txt --python /opt/options-pricer/.venv/bin/python
```

Create the cache directory and do the first populate (takes ~1 minute for 18
tickers):

```bash
sudo mkdir -p /var/lib/options-pricer/cache
sudo chown -R ubuntu:ubuntu /var/lib/options-pricer
```

```bash
cd /opt/options-pricer
OPTIONS_PRICER_CACHE_DIR=/var/lib/options-pricer/cache \
  .venv/bin/python -m backend.data.populate_cache
```

Expect `Cached OK (18)` and `Skipped (0)`.

---

## Step 7 — Build the frontend

```bash
cd /opt/options-pricer
npm --prefix frontend ci
npm --prefix frontend run build
ls -la frontend/dist
```

You should see `index.html` and an `assets/` directory.

---

## Step 8 — Install the services

```bash
cd /opt/options-pricer
sudo cp deploy/options-pricer.service /etc/systemd/system/
sudo cp deploy/cache-refresh.service /etc/systemd/system/
sudo cp deploy/cache-refresh.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now options-pricer
```

Confirm it's running:

```bash
sudo systemctl status options-pricer --no-pager
curl -s http://127.0.0.1:8000/health
```

`/health` should return JSON with `"status":"ok"` and the cache dir pointing at
`/var/lib/options-pricer/cache`. If not, jump to Troubleshooting.

Make the deploy script executable:

```bash
chmod +x /opt/options-pricer/deploy/deploy.sh
```

---

## Step 9 — nginx

```bash
cd /opt/options-pricer
sudo cp deploy/nginx.conf /etc/nginx/sites-available/options-pricer
sudo ln -sf /etc/nginx/sites-available/options-pricer /etc/nginx/sites-enabled/options-pricer
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` must say **syntax is ok / test is successful** before you reload.

**Check it over plain HTTP now**, before adding TLS:

```bash
curl -I http://finance.imaadhusoof.com
```

Expect `200 OK`. Open it in a browser too — the site should fully work over
`http://`. Fix any problems here; HTTPS only adds a layer on top.

---

## Step 10 — HTTPS

Only proceed once step 9 works and DNS resolves.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d finance.imaadhusoof.com
```

Answer the prompts (email, agree to ToS). When asked about redirecting HTTP to
HTTPS, **choose redirect**. Certbot rewrites the nginx config to add the TLS
block and installs a renewal timer automatically.

Verify:

```bash
curl -I https://finance.imaadhusoof.com
```

Confirm auto-renewal is armed:

```bash
sudo certbot renew --dry-run
```

---

## Step 11 — Enable the daily cache refresh

```bash
sudo systemctl enable --now cache-refresh.timer
systemctl list-timers cache-refresh --no-pager
```

Runs at **22:30 UTC** daily (after the US close in both EST and EDT). Test the
job itself immediately rather than waiting a day:

```bash
sudo systemctl start cache-refresh.service
journalctl -u cache-refresh -n 30 --no-pager
```

---

## Step 12 — Final checklist

- [ ] `https://finance.imaadhusoof.com` loads with a valid padlock
- [ ] The Universe view lists 18 assets with live prices
- [ ] Clicking an asset renders its price chart
- [ ] Build portfolio → submit shows the "Algorithm not connected yet" panel
      (this is correct until you implement `recommend()`)
- [ ] `http://` redirects to `https://`
- [ ] `sudo reboot`, wait a minute, confirm the site comes back by itself

That last one matters — it proves systemd will bring everything up
unattended after an instance restart.

---

## Day-to-day operations

**Deploy an update.** Push from your machine, then on the server:

```bash
/opt/options-pricer/deploy/deploy.sh
```

**Watch backend logs:**

```bash
journalctl -u options-pricer -f
```

**Restart the backend:**

```bash
sudo systemctl restart options-pricer
```

**Force a cache refresh:**

```bash
sudo systemctl start cache-refresh.service
```

---

## Troubleshooting

**502 Bad Gateway** — nginx is up but uvicorn isn't. Check:

```bash
journalctl -u options-pricer -n 50 --no-pager
```

**Site loads but the data is empty / API calls fail** — the cache directory is
missing or unwritable. Confirm ownership:

```bash
ls -la /var/lib/options-pricer/cache
```

It must be owned by `ubuntu`. Re-run the populate command from step 6.

**Backend dies during a cache refresh** — out of memory. Confirm swap is active
(`free -h`), and drop `--workers 2` to `--workers 1` in
`/etc/systemd/system/options-pricer.service`, then
`sudo systemctl daemon-reload && sudo systemctl restart options-pricer`.

**certbot fails** — almost always DNS. Confirm
`nslookup finance.imaadhusoof.com` returns the static IP from a machine that
isn't the server, and that port 80 is open in the Lightsail firewall.

**Frontend shows a stale version after deploy** — hard-refresh once. `index.html`
is sent `no-cache`, so this should self-correct; only the hashed assets are
cached long-term.

---

## Notes

- The `allow_origins` entry for `localhost:5173` in `backend/main.py` is
  **dev-only**. In production the frontend is same-origin behind nginx, so CORS
  never comes into play. Harmless to leave.
- uvicorn binds to `127.0.0.1`, so port 8000 is unreachable from the internet
  regardless of firewall rules. nginx is the only public entry point.
- To tune cache freshness without editing code, create `/etc/options-pricer.env`
  with lines like `OPTIONS_PRICER_QUOTE_TTL_SECONDS=30` — both units read it.
- Once you're confident SSH works, consider restricting port 22 in the Lightsail
  firewall to your home IP.
