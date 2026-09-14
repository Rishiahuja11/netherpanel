#!/bin/bash
# NetherPanel Start Script (Linux / Termux)
# Starts the panel server.

cd "$(dirname "$0")"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Minecraft Server Manager                  ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

if ! command -v node &> /dev/null; then
    echo "  [!] Node.js not found. Install Node 18+ and retry."
    exit 1
fi

if ! command -v java &> /dev/null; then
    echo "  [!] Java not found in PATH. Java servers (Paper, vanilla, Forge...)"
    echo "  [!] will still be created, but cannot start until you install a JDK"
    echo "  [!] (e.g. openjdk-21-jre) and add it to PATH."
    echo ""
fi

if [ ! -d "node_modules" ]; then
    echo "  [*] Installing dependencies..."
    npm install --production 2>/dev/null || npm install || exit 1
fi

mkdir -p data/servers data/backups data/uploads data/eggs data/crashes data/logs

echo "  [*] Runtime: $(uname -s) $(uname -m) | Node $(node -v 2>/dev/null || echo '?')"
if [ -d "/data/data/com.termux" ]; then
    echo "  [*] Termux detected - Java servers run via proot-distro Ubuntu"
elif command -v java &> /dev/null; then
    echo "  [*] Native Java detected: $(java -version 2>&1 | head -1)"
fi
echo ""

# Stop any previous instance of THIS panel. Only processes whose command line
# references this project's server.js are touched, so other users' processes
# on shared hosts are never killed.
PANEL_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$PANEL_DIR/data/panel.pid"
if [ -f "$PIDFILE" ]; then
    PID="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        if ps -p "$PID" -o args= 2>/dev/null | grep -q "server\.js"; then
            echo "  [*] Stopping existing panel (PID $PID)..."
            kill "$PID" 2>/dev/null || true
            for _ in 1 2 3 4 5; do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
            kill -9 "$PID" 2>/dev/null || true
        else
            rm -f "$PIDFILE"
        fi
    else
        rm -f "$PIDFILE"
    fi
fi
sleep 1

echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v4.0                          ║"
echo "  ║     Panel:    http://localhost:3000            ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
echo "  Starting panel..."
echo "  Access it from a browser at http://localhost:3000"
echo "  Press Ctrl+C to stop"
echo ""

echo $$ > data/panel.pid

exec node server.js