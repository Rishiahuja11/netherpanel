#!/bin/bash
# NetherPanel Start Script (Native Termux)
# Starts the panel directly in Termux

set -e

cd "$(dirname "$0")"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Minecraft Server Manager for Termux        ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "  [!] This script must be run in Termux"
    exit 1
fi

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "  [!] Node.js not found"
    echo "  [!] Run setup first: bash setup.sh"
    exit 1
fi

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "  [*] Installing dependencies..."
    npm install --production 2>/dev/null || npm install
fi

# Create data dirs
mkdir -p data/servers data/backups data/uploads data/eggs data/crashes

echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Running in Termux                         ║"
echo "  ║     http://localhost:3000                     ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
echo "  Panel will start on http://localhost:3000"
echo "  Press Ctrl+C to stop"
echo ""

exec node server.js
