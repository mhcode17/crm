#!/bin/bash
# TruckRecruit CRM — Auto Deploy Script for Ubuntu/Debian VPS
# Run as: bash deploy.sh

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "========================================"
echo "   TruckRecruit CRM — Deployment"
echo "========================================"
echo ""

# ── 1. System packages ──────────────────────────────────────────────
log "Updating system packages..."
sudo apt-get update -qq

# ── 2. Node.js 20 via NodeSource ────────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js already installed: $(node -v)"
fi

# ── 3. PM2 ──────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  log "Installing PM2..."
  sudo npm install -g pm2
else
  log "PM2 already installed: $(pm2 -v)"
fi

# ── 4. Nginx ────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
  log "Installing Nginx..."
  sudo apt-get install -y nginx
else
  log "Nginx already installed"
fi

# ── 5. Create logs directory ────────────────────────────────────────
mkdir -p logs
log "Logs directory ready"

# ── 6. Install dependencies ─────────────────────────────────────────
log "Installing server dependencies..."
cd server && npm install --production && cd ..

log "Installing client dependencies..."
cd client && npm install && cd ..

# ── 7. Build React app ──────────────────────────────────────────────
log "Building React application..."
cd client && npm run build && cd ..
log "React build complete (client/dist/)"

# ── 8. Set up .env if missing ───────────────────────────────────────
if [ ! -f server/.env ]; then
  warn "server/.env not found — creating from example..."
  cp server/.env.example server/.env
  JWT_SECRET=$(openssl rand -hex 32)
  sed -i "s/your-super-secret-jwt-key-change-this-in-production/$JWT_SECRET/" server/.env
  echo ""
  warn "⚠️  Edit server/.env and set your email settings!"
  echo "    nano server/.env"
  echo ""
fi

# ── 9. Start / reload PM2 ───────────────────────────────────────────
if pm2 list | grep -q "truckrecruit-crm"; then
  log "Reloading existing PM2 process..."
  pm2 reload ecosystem.config.js --update-env
else
  log "Starting CRM with PM2..."
  NODE_ENV=production pm2 start ecosystem.config.js
fi

pm2 save
log "PM2 process saved"

# ── 10. PM2 auto-start on system boot ───────────────────────────────
log "Enabling PM2 startup on boot..."
pm2 startup | tail -1 | bash 2>/dev/null || true

# ── 11. Nginx configuration ──────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/truckrecruit-crm"
if [ ! -f "$NGINX_CONF" ]; then
  log "Setting up Nginx..."
  sudo cp nginx.conf "$NGINX_CONF"
  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/truckrecruit-crm
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx
  log "Nginx configured and reloaded"
else
  log "Nginx config already exists — skipping"
fi

sudo systemctl enable nginx

# ── Done ─────────────────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
echo "========================================"
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "========================================"
echo ""
echo "  CRM is running at: http://$SERVER_IP"
echo "  API health check:  http://$SERVER_IP/api/health"
echo ""
echo "  PM2 commands:"
echo "    pm2 status              — check status"
echo "    pm2 logs truckrecruit-crm — view logs"
echo "    pm2 restart truckrecruit-crm — restart"
echo ""
echo "  ⚠️  Remember to:"
echo "    1. Edit server/.env with real settings"
echo "    2. Replace 'your-domain.com' in nginx.conf with your domain"
echo "    3. Set up SSL: sudo apt install certbot python3-certbot-nginx"
echo "       then: sudo certbot --nginx -d your-domain.com"
echo ""
