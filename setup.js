#!/usr/bin/env node
/**
 * NetherPanel Setup Script (Native Termux)
 * Installs all dependencies directly in Termux
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PANEL_DIR = path.join(__dirname);
const DATA_DIR = path.join(PANEL_DIR, 'data');

const c = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    bold: '\x1b[1m',
};

function log(msg, color = '') {
    console.log(`${color}${msg}${c.reset}`);
}

function success(msg) { log(`  ✓ ${msg}`, c.green); }
function error(msg) { log(`  ✗ ${msg}`, c.red); }
function info(msg) { log(`  ℹ ${msg}`, c.cyan); }

function exec(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
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

function header() {
    console.log('');
    log('  ╔═══════════════════════════════════════════════╗', c.magenta);
    log('  ║     NetherPanel v4.0 - Setup                  ║', c.magenta);
    log('  ║     Minecraft Server Manager for Termux        ║', c.magenta);
    log('  ╚═══════════════════════════════════════════════╝', c.magenta);
    console.log('');
}

async function main() {
    header();

    // Check Termux
    if (!fs.existsSync('/data/data/com.termux')) {
        error('This script must be run in Termux');
        process.exit(1);
    }

    // Step 1: Update packages
    log('━━━ Step 1: Updating Termux packages ━━━', c.bold);
    execLive('pkg update -y');
    success('Packages updated');

    // Step 2: Install Node.js
    console.log('');
    log('━━━ Step 2: Installing Node.js ━━━', c.bold);
    if (exec('command -v node')) {
        success(`Node.js ${exec('node -v')} already installed`);
    } else {
        execLive('pkg install -y nodejs');
        success('Node.js installed');
    }

    // Step 3: Install Java
    console.log('');
    log('━━━ Step 3: Installing Java ━━━', c.bold);
    if (exec('command -v java')) {
        success('Java already installed');
    } else {
        execLive('pkg install -y openjdk-17');
        success('Java 17 installed');
    }

    // Step 4: Install utilities
    console.log('');
    log('━━━ Step 4: Installing utilities ━━━', c.bold);
    execLive('pkg install -y git python3 curl wget unzip tar');
    success('Utilities installed');

    // Step 5: Install npm dependencies
    console.log('');
    log('━━━ Step 5: Installing npm dependencies ━━━', c.bold);
    process.chdir(PANEL_DIR);
    execLive('npm install --production 2>/dev/null || npm install');
    success('npm dependencies installed');

    // Step 6: Create data directories
    console.log('');
    log('━━━ Step 6: Creating directories ━━━', c.bold);
    const dirs = ['data/servers', 'data/backups', 'data/uploads', 'data/eggs', 'data/crashes'];
    dirs.forEach(dir => {
        fs.mkdirSync(path.join(PANEL_DIR, dir), { recursive: true });
    });
    success('Directories created');

    // Done
    console.log('');
    log('  ╔═══════════════════════════════════════════════╗', c.green);
    log('  ║     Setup Complete!                            ║', c.green);
    log('  ╚═══════════════════════════════════════════════╝', c.green);
    console.log('');
    log('  Next steps:', c.bold);
    log('    1. Create an admin user:');
    log('       node create-admin.js <username> <password>');
    console.log('');
    log('    2. Start the panel:');
    log('       bash start.sh');
    log('       or: npm start');
    console.log('');
    log('  Panel URL: http://localhost:3000', c.cyan);
    console.log('');
}

main().catch(err => {
    error(err.message);
    process.exit(1);
});
