#!/bin/bash
# NetherPanel Setup Script for proot-distro Ubuntu

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v3.0 - Setup Wizard            ║"
echo "  ║     Minecraft Server Manager for Termux        ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# Detect environment
if [ -d "/data/data/com.termux" ]; then
    echo "[*] Detected Termux environment"
    IS_TERMUX=1
else
    echo "[*] Detected Linux environment"
    IS_TERMUX=0
fi

# Check if running in proot-distro
if grep -q "proot" /proc/1/cmdline 2>/dev/null || [ -f /.proot.* ]; then
    echo "[*] Detected proot-distro environment"
    IN_PROOT=1
elif command -v proot-distro &> /dev/null; then
    echo "[*] proot-distro available (run inside Ubuntu for best results)"
    IN_PROOT=0
else
    IN_PROOT=0
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "[*] Installing Node.js..."
    if [ "$IS_TERMUX" = "1" ] && [ "$IN_PROOT" = "0" ]; then
        pkg install -y nodejs
    else
        apt-get update && apt-get install -y nodejs npm
    fi
fi
echo "[✓] Node.js $(node --version 2>/dev/null || echo 'installed')"

# Install Java if not present
if ! command -v java &> /dev/null; then
    echo "[*] Installing Java 17 (required for Minecraft)..."
    if [ "$IS_TERMUX" = "1" ] && [ "$IN_PROOT" = "0" ]; then
        pkg install -y openjdk-17
    else
        apt-get update && apt-get install -y openjdk-17-jre-headless
    fi
fi
echo "[✓] Java installed"

# Install build tools if needed
if ! command -v gcc &> /dev/null; then
    echo "[*] Installing build tools..."
    if [ "$IS_TERMUX" = "1" ] && [ "$IN_PROOT" = "0" ]; then
        pkg install -y build-essential
    else
        apt-get update && apt-get install -y build-essential python3
    fi
fi

# Install npm dependencies
echo "[*] Installing npm dependencies..."
cd "$(dirname "$0")"
npm install --production 2>/dev/null || npm install
echo "[✓] Dependencies installed"

# Create data directories
mkdir -p data/servers data/backups data/uploads data/eggs data/crashes
echo "[✓] Data directories created"

# Make scripts executable
chmod +x start.sh 2>/dev/null

echo ""
echo "  ═══════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Start the panel:  ./start.sh"
echo "  Default login:    admin / admin123"
echo "  Panel URL:        http://localhost:3000"
echo ""
echo "  No FQDN required - just install and run!"
echo "  ═══════════════════════════════════════════════"
echo ""
