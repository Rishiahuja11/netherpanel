# NetherPanel

A modern Minecraft server management panel for Termux. No Docker, no proot-distro, no FQDN required - just install and run natively.

![NetherPanel](https://img.shields.io/badge/NetherPanel-v4.0-orange) ![License](https://img.shields.io/badge/License-MIT-blue) ![Platform](https://img.shields.io/badge/Platform-Termux-purple)

## Features

### Core Features
- **Native Termux** - Runs directly in Termux without proot-distro or Docker
- **One-click setup** - Installs all dependencies automatically
- **No FQDN needed** - Works on localhost out of the box
- **Real-time console** - Terminal-based console with history
- **File manager** - Browse, edit, upload, delete server files
- **Backup system** - Create and restore server backups
- **Crash detection** - Automatic crash analysis and reporting
- **Activity logging** - Track all server actions

### Server Management
- Java and Bedrock server support
- Paper, Spigot, Purpur, Fabric, Forge, Vanilla
- PocketMine-MP, Nukkit for Bedrock
- Start, stop, restart, kill servers
- Live console output with command input
- Server properties editor
- Memory and disk usage monitoring
- Automatic port allocation

### Mod Manager
- Search mods from Modrinth API
- Install and remove mods/plugins
- Browse popular Minecraft mods
- Supports Paper, Spigot, Forge, Fabric loaders

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

- **Termux** (Android) - Download from F-Droid or GitHub
- **Node.js** (installed by setup)
- **Java 17** (installed by setup)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Rishiahuja11/netherpanel.git
cd netherpanel
```

### 2. Run setup

```bash
bash setup.sh
```

Or using npm:
```bash
npm run setup
```

This will:
- Install Node.js, Java, and utilities
- Install npm dependencies
- Create data directories

### 3. Create an admin user

```bash
node create-admin.js <username> <password> [email]
```

Example:
```bash
node create-admin.js admin mypassword123 admin@example.com
```

### 4. Start the panel

```bash
bash start.sh
```

Or using npm:
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
3. Select game type (Java or Bedrock)
4. Select server software (Paper, Spigot, Forge, etc.)
5. Configure memory and port settings
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
| `bash setup.sh` | Initial setup (installs dependencies) |
| `bash start.sh` | Start the panel |
| `npm start` | Start the panel |
| `node create-admin.js <user> <pass> [email]` | Create an admin user |

## Configuration

The panel uses a SQLite database stored in `data/netherpanel.db`. Configuration is stored in the database settings table.

### Default Settings

- **Port**: 3000
- **Host**: 0.0.0.0
- **Registration**: Enabled

## Project Structure

```
netherpanel/
├── server.js                 # Main Express server
├── setup.sh                  # Setup script (native Termux)
├── setup.js                  # Setup script (Node.js version)
├── start.sh                  # Start script
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
    └── netherpanel.db        # SQLite database
```

## How It Works

### Architecture

1. **Termux**: Native Android terminal emulator
2. **Panel**: Express.js server running directly in Termux
3. **Servers**: Java/Bedrock processes spawned directly

### No Docker

Unlike Pterodactyl, NetherPanel runs game servers directly as Java processes. This makes it lightweight and easy to set up on Termux.

### No proot-distro

Unlike other solutions, NetherPanel runs natively in Termux without needing Ubuntu or proot-distro. This simplifies setup and improves reliability.

### No FQDN

The panel works on localhost without any domain configuration. Just install and access at http://localhost:3000.

## Differences from Pterodactyl

| Feature | Pterodactyl | NetherPanel |
|---------|-------------|-------------|
| Docker Required | Yes | No |
| FQDN Required | Yes | No |
| proot Required | No | No |
| Complexity | High | Low |
| Setup Time | 30+ minutes | 2 minutes |
| Mod Manager | No | Yes |
| Crash Detection | No | Yes |
| Platform | Linux VPS | Termux/Android |

## Troubleshooting

### Java not found

```bash
pkg install openjdk-17
```

### Node.js not found

```bash
pkg install nodejs
```

### Port already in use

Change the port using environment variable:

```bash
PORT=8080 npm start
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.

## Support

If you have issues, please open a GitHub issue or contact us at **ahujarishi741@gmail.com**.
