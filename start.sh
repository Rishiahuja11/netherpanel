#!/bin/bash
# NetherPanel Start Script (Native Termux)
# Starts the panel + Cloudflare Tunnel

set -e

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
    echo "  [!] Node.js not found. Run: bash setup.sh"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "  [*] Installing dependencies..."
    npm install --production 2>/dev/null || npm install
fi

mkdir -p data/servers data/backups data/uploads data/eggs data/crashes

TUNNEL_TOKEN=$(cat ~/.cloudflared/token 2>/dev/null || echo "")

echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Running in Termux                         ║"
echo "  ║     Panel:    http://localhost:3000            ║"
if [ -n "$TUNNEL_TOKEN" ]; then
echo "  ║     Tunnel:   https://panel.smp45.qzz.io      ║"
fi
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

if [ -n "$TUNNEL_TOKEN" ]; then
    echo "  Starting panel + tunnel..."
    echo "  Press Ctrl+C to stop"
    echo ""
    npx concurrently --names "panel,tunnel" --colors "node server.js" "cloudflared tunnel run --token $TUNNEL_TOKEN"
else
    echo "  No tunnel token found. Starting panel only."
    echo "  Access at http://localhost:3000"
    echo "  Press Ctrl+C to stop"
    echo ""
    exec node server.js
fi
