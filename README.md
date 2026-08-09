# NetherPanel

A modern Minecraft server management panel built for Termux with proot-distro Ubuntu. No Docker, no FQDN required - just install and run.

![NetherPanel](https://img.shields.io/badge/NetherPanel-v3.0-orange) ![License](https://img.shields.io/badge/License-MIT-blue) ![Platform](https://img.shub.io/badge/Platform-Termux-purple)

## Features

### Core Features
- **One-click setup** - Installs proot-distro and Ubuntu automatically
- **No Docker required** - Runs servers directly via Java process
- **No FQDN needed** - Works on localhost out of the box
- **Real-time console** - WebSocket-based terminal with history
- **File manager** - Browse, edit, upload, delete server files
- **Backup system** - Create and restore server backups
- **Crash detection** - Automatic crash analysis and reporting
- **Activity logging** - Track all server actions

### Server Management
- Start, stop, restart, kill servers
- Live console output with command input
- Server properties editor
- Memory and disk usage monitoring
- Automatic port allocation

### Mod Manager
- Search mods from Modrinth API
- Install and remove mods
- Browse popular Minecraft mods

### Schedule System
- Cron-based task scheduling
- Automated server commands
- Power actions on schedule

### User System
- User registration (no default admin)
- Admin CLI tool for creating admins
- Role-based access control
- Activity tracking

## Requirements

- **Termux** (Android)
- **proot-distro** (installed automatically)
- **Ubuntu** (installed automatically)
- **Node.js 18+** (installed inside Ubuntu)
- **Java 17** (installed inside Ubuntu)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/netherpanel.git
cd netherpanel
```

### 2. Run setup

```bash
npm run setup
```

This will:
- Install proot-distro
- Install Ubuntu
- Install Node.js and Java inside Ubuntu
- Install npm dependencies

### 3. Create an admin user

```bash
npm run create-admin -- <username> <password> [email]
```

Example:
```bash
npm run create-admin -- admin mypassword123 admin@example.com
```

### 4. Start the panel

```bash
npm start
```

The panel will be available at **http://localhost:3000**

## Usage

### Creating Admin Users

```bash
node create-admin.js <username> <password> [email]
```

### User Registration

Users can register through the login page at http://localhost:3000. They will have regular user access by default.

### Managing Servers

1. Login to the panel
2. Click "Create Server" 
3. Select server type (Paper, Spigot, Forge, etc.)
4. Configure memory, disk, and other settings
5. Upload your `server.jar` to the server directory
6. Start the server

### File Management

- Navigate to server files
- Edit files directly in the browser
- Upload new files
- Create directories

### Backups

- Create backups from the server page
- Download backup files
- Restore from backups

## Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Initial setup (installs proot-distro, Ubuntu, dependencies) |
| `npm start` | Start the panel |
| `npm run create-admin -- <user> <pass> [email]` | Create an admin user |
| `npm run dev` | Start in development mode |

## Configuration

The panel uses a SQLite database stored in `data/panel.db`. Configuration is stored in the database settings table.

### Default Settings

- **Port**: 3000
- **Host**: 0.0.0.0
- **Registration**: Enabled

## Project Structure

```
netherpanel/
├── server.js                 # Main Express server
├── setup.js                  # Setup script (proot-distro + Ubuntu)
├── start.sh                  # Start script (logs into Ubuntu)
├── create-admin.js           # CLI to create admin users
├── package.json
├── src/
│   ├── database.js           # SQLite database
│   ├── middleware/
│   │   └── auth.js           # JWT authentication
│   ├── routes/
│   │   ├── auth.js           # Login/register
│   │   ├── servers.js        # Server CRUD + management
│   │   ├── admin.js          # Admin API
│   │   └── client.js         # Client API
│   └── services/
│       ├── ServerService.js  # Server process management
│       ├── UserService.js    # User management
│       ├── BackupService.js  # Backup system
│       ├── ScheduleService.js # Task scheduling
│       ├── ModService.js     # Modrinth API integration
│       └── CrashService.js   # Crash detection
├── public/
│   ├── login.html            # Login page
│   ├── index.html            # Dashboard
│   ├── server.html           # Server management
│   ├── css/
│   │   └── style.css         # Dark theme CSS
│   └── js/
│       ├── auth.js           # Auth page logic
│       ├── app.js            # Dashboard logic
│       └── server.js         # Server page logic
└── data/
    ├── servers/              # Server files
    ├── backups/              # Backup files
    └── panel.db              # SQLite database
```

## How It Works

### Architecture

1. **Termux Layer**: Runs proot-distro
2. **Ubuntu Layer**: Runs Node.js server (via proot)
3. **Panel**: Express.js + Socket.IO server
4. **Servers**: Java processes spawned directly

### No Docker

Unlike Pterodactyl, NetherPanel runs game servers directly as Java processes. This makes it lightweight and easy to set up on Termux.

### No FQDN

The panel works on localhost without any domain configuration. Just install and access at http://localhost:3000.

## Differences from Pterodactyl

| Feature | Pterodactyl | NetherPanel |
|---------|-------------|-------------|
| Docker Required | Yes | No |
| FQDN Required | Yes | No |
| Complexity | High | Low |
| Setup Time | 30+ minutes | 5 minutes |
| Mod Manager | No | Yes |
| Crash Detection | No | Yes |
| Platform | Linux VPS | Termux/Android |

## Troubleshooting

### Java not found

```bash
proot-distro login ubuntu
apt install openjdk-17-jre-headless
```

### Node.js not found

```bash
proot-distro login ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install nodejs
```

### Port already in use

Change the port in `.env` or set the PORT environment variable:

```bash
PORT=8080 npm start
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.

## Support

If you have issues, please open a GitHub issue or contact us.
