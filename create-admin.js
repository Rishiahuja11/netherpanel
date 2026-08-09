#!/usr/bin/env node
/**
 * NetherPanel - Create Admin User CLI
 * Usage: node create-admin.js <username> <password> [email]
 */

const path = require('path');
const bcrypt = require('bcryptjs');

// Set up paths
const PANEL_DIR = path.join(__dirname);
process.chdir(PANEL_DIR);

// Initialize database
const { initDatabase, getDb } = require('./src/database');

async function createAdmin() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('');
        console.log('  \x1b[36mNetherPanel - Create Admin User\x1b[0m');
        console.log('');
        console.log('  \x1b[33mUsage:\x1b[0m');
        console.log('    node create-admin.js <username> <password> [email]');
        console.log('');
        console.log('  \x1b[33mExamples:\x1b[0m');
        console.log('    node create-admin.js admin mypassword123');
        console.log('    node create-admin.js admin mypassword123 admin@example.com');
        console.log('');
        process.exit(1);
    }

    const username = args[0];
    const password = args[1];
    const email = args[2] || null;

    if (username.length < 3) {
        console.log('\x1b[31m  Error: Username must be at least 3 characters\x1b[0m');
        process.exit(1);
    }

    if (password.length < 6) {
        console.log('\x1b[31m  Error: Password must be at least 6 characters\x1b[0m');
        process.exit(1);
    }

    try {
        // Initialize database
        initDatabase();
        const db = getDb();

        // Check if user exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            console.log(`\x1b[31m  Error: User '${username}' already exists\x1b[0m`);
            process.exit(1);
        }

        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 12);
        const result = db.prepare(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)'
        ).run(username, email, hashedPassword, 'admin');

        console.log('');
        console.log('  \x1b[32m✓ Admin user created successfully!\x1b[0m');
        console.log('');
        console.log(`  Username: \x1b[36m${username}\x1b[0m`);
        console.log(`  Email:    \x1b[36m${email || 'not set'}\x1b[0m`);
        console.log(`  Role:     \x1b[32madmin\x1b[0m`);
        console.log(`  ID:       \x1b[36m${result.lastInsertRowid}\x1b[0m`);
        console.log('');
        console.log('  You can now login at http://localhost:3000');
        console.log('');

        process.exit(0);
    } catch (err) {
        console.log(`\x1b[31m  Error: ${err.message}\x1b[0m`);
        process.exit(1);
    }
}

createAdmin();
