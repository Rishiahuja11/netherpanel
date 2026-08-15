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

# Ensure cloudflared (needed for the Cloudflare Tunnel)
CLOUDFLARED_OK=0
if command -v cloudflared &> /dev/null; then
    CLOUDFLARED_OK=1
else
    echo "  [*] cloudflared not found - installing..."
    pkg install -y cloudflared >/dev/null 2>&1
    if command -v cloudflared &> /dev/null; then
        CLOUDFLARED_OK=1
        echo "  [✓] cloudflared installed"
    else
        echo "  [!] cloudflared install failed. Run: bash setup.sh"
    fi
fi

# Ensure proot-distro + Ubuntu (needed for Java/Forge servers)
PROOT_OK=0
if command -v proot-distro &> /dev/null; then
    if proot-distro login ubuntu -- true 2>/dev/null; then
        PROOT_OK=1
        echo "  [✓] Ubuntu runtime ready (proot-distro)"
    else
        echo "  [!] Ubuntu distro not installed - needed for Java servers."
        echo "  [!] Run: bash setup.sh   (or: proot-distro install ubuntu)"
    fi
else
    echo "  [*] proot-distro not found - installing..."
    pkg install -y proot-distro >/dev/null 2>&1
    if command -v proot-distro &> /dev/null; then
        if proot-distro login ubuntu -- true 2>/dev/null; then
            PROOT_OK=1
            echo "  [✓] proot-distro + Ubuntu ready"
        else
            echo "  [!] Ubuntu distro not installed - needed for Java servers."
            echo "  [!] Run: bash setup.sh   (or: proot-distro install ubuntu)"
        fi
    else
        echo "  [!] proot-distro install failed. Run: bash setup.sh"
    fi
fi

# Kill any existing panel process on port 3000
fuser -k 3000/tcp 2>/dev/null || true
pkill -f "node serve[r].js" 2>/dev/null || true
sleep 1

echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Running in Termux                         ║"
echo "  ║     Panel:    http://localhost:3000            ║"
if [ "$CLOUDFLARED_OK" = "1" ] && { [ -f "$HOME/.cloudflared/token" ] || [ -f "$HOME/.cloudflared/credentials.json" ]; }; then
echo "  ║     Tunnel:   https://panel.smp45.qzz.io      ║"
fi
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
echo "  Starting panel..."
echo "  The panel starts the Cloudflare Tunnel automatically."
echo "  Press Ctrl+C to stop"
echo ""

exec node server.js
