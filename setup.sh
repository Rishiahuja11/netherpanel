#!/bin/bash
# NetherPanel Setup Script for Termux
# Run this directly: bash setup.sh

set -e

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v3.0 - Setup Wizard            ║"
echo "  ║     Minecraft Server Manager for Termux        ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "  [!] This script must be run in Termux"
    echo "  [!] Download Termux from F-Droid or GitHub"
    exit 1
fi

cd "$(dirname "$0")"

# Step 1: Install proot-distro
echo "━━━ Step 1: Installing proot-distro ━━━"
if command -v proot-distro &> /dev/null; then
    echo "  [✓] proot-distro already installed"
else
    echo "  [*] Installing proot-distro..."
    pkg update -y
    pkg install -y proot-distro
    echo "  [✓] proot-distro installed"
fi

# Step 2: Check if Ubuntu is installed
echo ""
echo "━━━ Step 2: Installing Ubuntu ━━━"
if proot-distro list 2>/dev/null | grep -qi ubuntu && [ -d "/data/data/com.termux/files/home/ubuntu" ]; then
    echo "  [✓] Ubuntu already installed"
else
    echo "  [*] Available distributions:"
    proot-distro list 2>/dev/null || true
    echo ""
    read -p "  Install Ubuntu? (Y/n): " choice
    if [ "$choice" = "n" ] || [ "$choice" = "N" ]; then
        echo "  [!] Skipping Ubuntu installation"
        echo "  [!] Panel requires Ubuntu to run"
        exit 1
    fi
    echo "  [*] Installing Ubuntu (this may take a few minutes)..."
    proot-distro remove ubuntu 2>/dev/null || true
    proot-distro install ubuntu
    echo "  [✓] Ubuntu installed"
fi

# Step 3: Install dependencies inside Ubuntu
echo ""
echo "━━━ Step 3: Installing dependencies in Ubuntu ━━━"
echo "  [*] Running setup inside Ubuntu..."

proot-distro login ubuntu -- bash -c '
    set -e
    export HOME=/root
    export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

    echo "  [*] Updating packages..."
    apt-get update -qq 2>/dev/null || true

    echo "  [*] Installing Node.js..."
    apt-get install -y -qq curl ca-certificates 2>/dev/null || true
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null || true
    apt-get install -y -qq nodejs 2>/dev/null || {
        apt-get install -y -qq nodejs npm 2>/dev/null || true
    }

    echo "  [*] Installing Java..."
    apt-get install -y -qq openjdk-17-jre-headless 2>/dev/null || {
        apt-get install -y -qq default-jre 2>/dev/null || true
    }

    echo "  [*] Installing build tools..."
    apt-get install -y -qq build-essential python3 git 2>/dev/null || true

    echo "  [✓] Ubuntu dependencies installed"
'

# Step 4: Install npm dependencies
echo ""
echo "━━━ Step 4: Installing npm dependencies ━━━"
proot-distro login ubuntu -- bash -c '
    export HOME=/root
    cd /data/data/com.termux/files/home/panel
    npm install --production 2>/dev/null || npm install
'
echo "  [✓] npm dependencies installed"

# Step 5: Create data directories
echo ""
echo "━━━ Step 5: Creating directories ━━━"
mkdir -p data/servers data/backups data/uploads data/eggs data/crashes
echo "  [✓] Directories created"

# Done
echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     Setup Complete!                            ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "    1. Create an admin user:"
echo "       npm run create-admin -- <username> <password>"
echo ""
echo "    2. Start the panel:"
echo "       npm start"
echo ""
echo "  Panel URL: http://localhost:3000"
echo ""
