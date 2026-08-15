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
    JAVA_VER=$(java -version 2>&1 | head -1)
    echo "  [✓] Java already installed: $JAVA_VER"
else
    pkg install -y openjdk-25
    echo "  [✓] Java 25 installed"
fi

# Step 4: Install build tools and utilities
echo ""
echo "━━━ Step 4: Installing utilities ━━━"
pkg install -y git python3 curl wget unzip tar
echo "  [✓] Utilities installed"

# Step 5: Install cloudflared (Cloudflare Tunnel client)
echo ""
echo "━━━ Step 5: Installing cloudflared (Cloudflare Tunnel) ━━━"
if command -v cloudflared &> /dev/null; then
    echo "  [✓] cloudflared already installed: $(cloudflared --version 2>/dev/null | head -1)"
else
    pkg install -y cloudflared
    echo "  [✓] cloudflared installed"
fi

# Step 6: Install proot-distro + Ubuntu (Java/Forge runtime)
echo ""
echo "━━━ Step 6: Installing proot-distro (Ubuntu runtime) ━━━"
if command -v proot-distro &> /dev/null; then
    echo "  [✓] proot-distro already installed"
else
    pkg install -y proot-distro
    echo "  [✓] proot-distro installed"
fi

if proot-distro login ubuntu -- true 2>/dev/null; then
    echo "  [✓] Ubuntu distro already installed"
else
    echo "  [*] Installing Ubuntu distro (first run downloads ~300 MB)..."
    proot-distro install ubuntu
    echo "  [✓] Ubuntu distro installed"
fi

echo "  [*] Ensuring Java 25 inside Ubuntu..."
if proot-distro login ubuntu -- test -x /usr/lib/jvm/java-25-openjdk-arm64/bin/java 2>/dev/null; then
    echo "  [✓] Java 25 ready inside Ubuntu"
else
    proot-distro login ubuntu -- bash -c 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-25-jre-headless'
    if proot-distro login ubuntu -- test -x /usr/lib/jvm/java-25-openjdk-arm64/bin/java 2>/dev/null; then
        echo "  [✓] Java 25 installed inside Ubuntu"
    else
        echo "  [!] Could not install openjdk-25 inside Ubuntu."
        echo "  [!] Java servers need: /usr/lib/jvm/java-25-openjdk-arm64/bin/java"
        echo "  [!] Install it manually: proot-distro login ubuntu -- apt install openjdk-25-jre-headless"
    fi
fi

# Step 7: Install npm dependencies
echo ""
echo "━━━ Step 7: Installing npm dependencies ━━━"
npm install --production 2>/dev/null || npm install
echo "  [✓] npm dependencies installed"

# Step 8: Create data directories
echo ""
echo "━━━ Step 8: Creating directories ━━━"
mkdir -p data/servers data/backups data/uploads data/eggs data/crashes
echo "  [✓] Directories created"

# Step 9: Make scripts executable
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
echo "    3. Connect Cloudflare for a public tunnel URL:"
echo "       ./netherpanel.sh --api http://localhost:3000"
echo "       ./netherpanel.sh login"
echo "       ./netherpanel.sh cf login"
echo "       (or use the Cloudflare section in the panel UI)"
echo ""
echo "  Panel URL: http://localhost:3000"
echo ""
