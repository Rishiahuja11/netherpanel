#!/bin/bash
# NetherPanel Start Script
# Logs into proot-distro Ubuntu and starts the panel

set -e

cd "$(dirname "$0")"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v3.0                          ║"
echo "  ║     Minecraft Server Manager for Termux        ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "  [!] This script must be run in Termux"
    exit 1
fi

# Check if proot-distro is installed
if ! command -v proot-distro &> /dev/null; then
    echo "  [!] proot-distro not found"
    echo "  [!] Run setup first: bash setup.sh"
    exit 1
fi

# Check if Ubuntu is installed
if ! proot-distro list 2>/dev/null | grep -qi ubuntu; then
    echo "  [!] Ubuntu not installed"
    echo "  [!] Run setup first: bash setup.sh"
    exit 1
fi

if [ ! -d "/data/data/com.termux/files/home/ubuntu" ]; then
    echo "  [!] Ubuntu not properly installed"
    echo "  [!] Run setup first: bash setup.sh"
    exit 1
fi

# Create startup script
STARTUP_SCRIPT="/data/data/com.termux/files/home/panel/data/.start.sh"
mkdir -p data

cat > "$STARTUP_SCRIPT" << 'EOF'
#!/bin/bash
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export TERM=xterm-256color

cd /data/data/com.termux/files/home/panel

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "  [*] Installing dependencies..."
    npm install --production 2>/dev/null || npm install
fi

# Create data dirs
mkdir -p data/servers data/backups data/uploads data/eggs data/crashes

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v3.0                          ║"
echo "  ║     Running inside Ubuntu (proot)             ║"
echo "  ║     http://localhost:3000                     ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
echo "  Login: admin / admin123"
echo ""

exec node server.js
EOF

chmod +x "$STARTUP_SCRIPT"

echo "  [*] Starting NetherPanel inside Ubuntu..."
echo "  [*] Panel URL: http://localhost:3000"
echo ""

# Login to Ubuntu and start
exec proot-distro login ubuntu -- bash "$STARTUP_SCRIPT"
