#!/bin/bash
# NetherPanel Setup Script for Termux (Native)
# Run this directly: bash setup.sh

set -e

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0 - Setup                  ║"
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

# Step 1: Update packages
echo "━━━ Step 1: Updating Termux packages ━━━"
pkg update -y
echo "  [✓] Packages updated"

# Step 2: Install Node.js
echo ""
echo "━━━ Step 2: Installing Node.js ━━━"
if command -v node &> /dev/null; then
    echo "  [✓] Node.js $(node -v) already installed"
else
    pkg install -y nodejs
    echo "  [✓] Node.js installed"
fi

# Step 3: Install Java for Minecraft servers
echo ""
echo "━━━ Step 3: Installing Java ━━━"
if command -v java &> /dev/null; then
    echo "  [✓] Java already installed"
else
    pkg install -y openjdk-17
    echo "  [✓] Java 17 installed"
fi

# Step 4: Install build tools and utilities
echo ""
echo "━━━ Step 4: Installing utilities ━━━"
pkg install -y git python3 curl wget unzip tar
echo "  [✓] Utilities installed"

# Step 5: Install npm dependencies
echo ""
echo "━━━ Step 5: Installing npm dependencies ━━━"
npm install --production 2>/dev/null || npm install
echo "  [✓] npm dependencies installed"

# Step 6: Create data directories
echo ""
echo "━━━ Step 6: Creating directories ━━━"
mkdir -p data/servers data/backups data/uploads data/eggs data/crashes
echo "  [✓] Directories created"

# Step 7: Make scripts executable
chmod +x start.sh

# Done
echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     Setup Complete!                            ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "    1. Create an admin user:"
echo "       node create-admin.js <username> <password>"
echo ""
echo "    2. Start the panel:"
echo "       bash start.sh"
echo "       or: npm start"
echo ""
echo "  Panel URL: http://localhost:3000"
echo ""
