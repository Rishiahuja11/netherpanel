#!/usr/bin/env node
/**
 * NetherPanel Setup Script
 * Installs proot-distro, Ubuntu, and all dependencies
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PANEL_DIR = path.join(__dirname);
const DATA_DIR = path.join(PANEL_DIR, 'data');
const UBUNTU_ROOT = '/data/data/com.termux/files/home/ubuntu';
const STARTUP_SCRIPT = path.join(UBUNTU_ROOT, 'root', 'start-netherpanel.sh');

// Colors for terminal output
const c = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function log(msg, color = c.white) {
    console.log(`${color}${msg}${c.reset}`);
}

function success(msg) { log(`  ✓ ${msg}`, c.green); }
function error(msg) { log(`  ✗ ${msg}`, c.red); }
function info(msg) { log(`  ℹ ${msg}`, c.cyan); }
function warn(msg) { log(`  ⚠ ${msg}`, c.yellow); }

function exec(cmd, opts = {}) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
    } catch (e) {
        return null;
    }
}

function execLive(cmd) {
    try {
        execSync(cmd, { stdio: 'inherit' });
        return true;
    } catch (e) {
        return false;
    }
}

async function main() {
    console.log('');
    log('  ╔═══════════════════════════════════════════════╗', c.magenta);
    log('  ║     NetherPanel v3.0 - Setup Wizard            ║', c.magenta);
    log('  ║     Minecraft Server Manager for Termux        ║', c.magenta);
    log('  ╚═══════════════════════════════════════════════╝', c.magenta);
    console.log('');

    // Check if running in Termux
    const isTermux = fs.existsSync('/data/data/com.termux');
    if (!isTermux) {
        warn('Not running in Termux. Some features may not work.');
        warn('This panel is designed for Termux with proot-distro.');
    }

    // Step 1: Install proot-distro
    log('\n━━━ Step 1: Installing proot-distro ━━━', c.bold);
    const hasProotDistro = exec('command -v proot-distro');
    if (hasProotDistro) {
        success('proot-distro already installed');
    } else {
        info('Installing proot-distro...');
        const result = exec('pkg install -y proot-distro 2>&1');
        if (result && result.includes('error')) {
            // Try apt if pkg fails
            exec('apt update && apt install -y proot-distro 2>&1');
        }
        // Verify
        if (exec('command -v proot-distro')) {
            success('proot-distro installed successfully');
        } else {
            error('Failed to install proot-distro');
            error('Try manually: pkg install proot-distro');
            process.exit(1);
        }
    }

    // Step 2: Check if Ubuntu is already installed
    log('\n━━━ Step 2: Installing Ubuntu ━━━', c.bold);
    const installedDistros = exec('proot-distro list 2>/dev/null') || '';
    const ubuntuInstalled = installedDistros.toLowerCase().includes('ubuntu') &&
                           fs.existsSync(UBUNTU_ROOT);

    if (ubuntuInstalled) {
        success('Ubuntu already installed');
    } else {
        // Get available distros
        info('Available distributions:');
        console.log('');
        const distroList = exec('proot-distro list 2>/dev/null');
        if (distroList) {
            distroList.split('\n').forEach(line => {
                if (line.trim()) log(`    ${line}`, c.dim);
            });
        }
        console.log('');

        const installUbuntu = await ask(`${c.cyan}  Install Ubuntu? (Y/n): ${c.reset}`);
        if (installUbuntu.toLowerCase() === 'n') {
            warn('Ubuntu installation skipped. Panel may not work without it.');
        } else {
            info('Installing Ubuntu (this may take a few minutes)...');

            // Remove existing if partially installed
            exec('proot-distro remove ubuntu 2>/dev/null');

            // Install Ubuntu
            const installResult = exec('proot-distro install ubuntu 2>&1');
            if (installResult && installResult.includes('error') && !installResult.includes('already')) {
                error('Failed to install Ubuntu');
                error(installResult);
                process.exit(1);
            }

            success('Ubuntu installed successfully');
        }
    }

    // Step 3: Install dependencies inside Ubuntu
    log('\n━━━ Step 3: Installing dependencies in Ubuntu ━━━', c.bold);

    // Create the setup script that runs inside Ubuntu
    const ubuntuSetupScript = `#!/bin/bash
set -e

echo ""
echo "  Setting up NetherPanel inside Ubuntu..."
echo ""

# Update packages
echo "[*] Updating package lists..."
apt-get update -qq 2>/dev/null || true

# Install Node.js
if ! command -v node &> /dev/null; then
    echo "[*] Installing Node.js..."
    apt-get install -y -qq curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y -qq nodejs 2>/dev/null || {
        # Fallback: install from Ubuntu repos
        apt-get install -y -qq nodejs npm 2>/dev/null
    }
fi
echo "[✓] Node.js \$(node --version 2>/dev/null || echo 'installed')"

# Install Java
if ! command -v java &> /dev/null; then
    echo "[*] Installing Java 17..."
    apt-get install -y -qq openjdk-17-jre-headless 2>/dev/null || \
    apt-get install -y -qq default-jre 2>/dev/null
fi
echo "[✓] Java installed"

# Install build tools
echo "[*] Installing build essentials..."
apt-get install -y -qq build-essential python3 git 2>/dev/null || true

# Install npm dependencies for the panel
echo "[*] Installing NetherPanel dependencies..."
cd /data/data/com.termux/files/home/panel
npm install --production 2>/dev/null || npm install

# Create data directories
mkdir -p data/servers data/backups data/uploads data/eggs data/crashes

echo ""
echo "  ═══════════════════════════════════════════════"
echo "  Ubuntu setup complete!"
echo "  ═══════════════════════════════════════════════"
`;

    // Write the setup script
    const tmpSetup = path.join(DATA_DIR, '.ubuntu-setup.sh');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(tmpSetup, ubuntuSetupScript);

    // Run setup inside Ubuntu
    info('Running setup inside Ubuntu...');
    console.log('');
    execLive(`proot-distro login ubuntu -- bash ${tmpSetup}`);
    console.log('');

    // Step 4: Create startup script inside Ubuntu
    log('\n━━━ Step 4: Creating startup script ━━━', c.bold);

    const startupScript = `#!/bin/bash
# NetherPanel Startup Script (runs inside Ubuntu)

export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export TERM=xterm-256color

cd /data/data/com.termux/files/home/panel

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║     NetherPanel v3.0                          ║"
echo "  ║     Running inside Ubuntu (proot)             ║"
echo "  ║     http://localhost:3000                     ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
echo "  Default login: admin / admin123"
echo ""

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "[*] Installing dependencies..."
    npm install --production 2>/dev/null || npm install
fi

# Create data dirs
mkdir -p data/servers data/backups data/uploads data/eggs data/crashes

# Start the panel
exec node server.js
`;

    const startupPath = path.join(DATA_DIR, '.ubuntu-start.sh');
    fs.writeFileSync(startupPath, startupScript);

    success('Startup script created');

    // Step 5: Final setup
    log('\n━━━ Step 5: Final setup ━━━', c.bold);

    // Create .env file
    const envContent = `PANEL_PORT=3000
PANEL_HOST=0.0.0.0
JWT_SECRET=${require('crypto').randomBytes(32).toString('hex')}
`;
    fs.writeFileSync(path.join(PANEL_DIR, '.env'), envContent);
    success('Environment configured');

    // Cleanup
    try { fs.unlinkSync(tmpSetup); } catch(e) {}

    // Done!
    console.log('');
    log('  ╔═══════════════════════════════════════════════╗', c.green);
    log('  ║     Setup Complete!                            ║', c.green);
    log('  ╚═══════════════════════════════════════════════╝', c.green);
    console.log('');
    log('  To start NetherPanel:', c.bold);
    log('    npm start', c.cyan);
    log('    or: ./start.sh', c.cyan);
    console.log('');
    log('  Panel URL:  http://localhost:3000', c.bold);
    log('  Login:      admin / admin123', c.bold);
    console.log('');

    rl.close();
}

main().catch(err => {
    error('Setup failed: ' + err.message);
    rl.close();
    process.exit(1);
});
