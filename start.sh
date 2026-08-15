#!/bin/bash
# NetherPanel Start Script (Native Termux)
# Starts the panel. The panel automatically starts the Cloudflare Tunnel.

cd "$(dirname "$0")"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Minecraft Server Manager for Termux        ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

if [ ! -d "/data/data/com.termux" ]; then
    echo "  [!] This script must be run in Termux"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "  [!] Node.js not found. Run: pkg install nodejs"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "  [*] Installing dependencies..."
    npm install --production 2>/dev/null || npm install
fi

mkdir -p data/servers data/backups data/uploads data/eggs data/crashes

# Kill any existing panel process on port 3000
fuser -k 3000/tcp 2>/dev/null
sleep 1

echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Running in Termux                         ║"
echo "  ║     Panel:    http://localhost:3000            ║"
if [ -f "$HOME/.cloudflared/token" ] || [ -f "$HOME/.cloudflared/credentials.json" ]; then
echo "  ║     Tunnel:   https://panel.smp45.qzz.io      ║"
fi
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
echo "  Starting panel..."
echo "  The panel starts the Cloudflare Tunnel automatically."
echo "  Press Ctrl+C to stop"
echo ""

exec node server.js
