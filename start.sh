#!/bin/bash
# NetherPanel Start Script (Native Termux)
# Starts the panel + Cloudflare Tunnel

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

# Kill any existing panel/tunnel processes on port 3000
fuser -k 3000/tcp 2>/dev/null
pkill -f "cloudflared tunnel run" 2>/dev/null
sleep 1

TUNNEL_TOKEN_FILE="$HOME/.cloudflared/token"

echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Running in Termux                         ║"
echo "  ║     Panel:    http://localhost:3000            ║"
if [ -f "$TUNNEL_TOKEN_FILE" ]; then
echo "  ║     Tunnel:   https://panel.smp45.qzz.io      ║"
fi
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

if [ -f "$TUNNEL_TOKEN_FILE" ]; then
    echo "  Starting panel + tunnel..."
    echo "  Press Ctrl+C to stop"
    echo ""

    # Start panel in background
    node server.js &
    PANEL_PID=$!

    # Give panel a moment to bind port
    sleep 2

    if kill -0 $PANEL_PID 2>/dev/null; then
        echo "  Panel started (PID: $PANEL_PID)"
    else
        echo "  [!] Panel failed to start. Check logs."
        exit 1
    fi

    # Start cloudflared tunnel in foreground
    cloudflared tunnel run --token-file "$TUNNEL_TOKEN_FILE" &
    TUNNEL_PID=$!

    # Wait for either to exit
    wait $PANEL_PID $TUNNEL_PID 2>/dev/null
else
    echo "  No tunnel token found. Starting panel only."
    echo "  Access at http://localhost:3000"
    echo "  Press Ctrl+C to stop"
    echo ""
    exec node server.js
fi
