#!/bin/bash
# NetherPanel Start Script
# Logs into proot-distro Ubuntu and starts the panel

cd "$(dirname "$0")"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v3.0                          ║"
echo "  ║     Minecraft Server Manager for Termux        ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# Check if proot-distro is installed
if ! command -v proot-distro &> /dev/null; then
    echo "[!] proot-distro not found."
    echo "[*] Run setup first: npm run setup"
    exit 1
fi

# Check if Ubuntu is installed
UBUNTU_ROOT="/data/data/com.termux/files/home/ubuntu"
if [ ! -d "$UBUNTU_ROOT" ]; then
    echo "[!] Ubuntu not installed."
    echo "[*] Run setup first: npm run setup"
    exit 1
fi

# Create the startup script inside Ubuntu
STARTUP_SCRIPT="/data/data/com.termux/files/home/panel/data/.ubuntu-start.sh"

cat > "$STARTUP_SCRIPT" << 'STARTUP'
#!/bin/bash
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export TERM=xterm-256color

cd /data/data/com.termux/files/home/panel

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "[*] Installing dependencies..."
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
echo "  Default login: admin / admin123"
echo ""

# Start the panel
exec node server.js
STARTUP

chmod +x "$STARTUP_SCRIPT"

echo "[*] Starting NetherPanel inside Ubuntu..."
echo "[*] Panel will be available at: http://localhost:3000"
echo "[*] Default login: admin / admin123"
echo ""

# Login to Ubuntu and run the startup script
exec proot-distro login ubuntu -- bash "$STARTUP_SCRIPT"
