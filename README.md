# NetherPanel

A modern Minecraft server management panel for Termux. Runs directly in Termux with Java servers executed through proot-distro (Ubuntu). Works on localhost out of the box, with optional Cloudflare Tunnel and subdomain support.

![NetherPanel](https://img.shields.io/badge/NetherPanel-v4.0-orange) ![License](https://img.shields.io/badge/License-MIT-blue) ![Platform](https://img.shields.io/badge/Platform-Termux-purple)

## Features

### Core Features
- **Native Termux** - Panel runs directly in Termux, no Docker needed
- **One-click setup** - Installs all dependencies automatically
- **No FQDN needed** - Works on localhost out of the box
- **Real-time console** - Terminal-based console (xterm.js) with history and command input
- **File manager** - Browse, edit, upload, delete server files
- **Backup system** - Create, download, and restore server backups
- **Crash detection** - Automatic crash analysis, reporting, and auto-restart
- **Activity logging** - Track all server actions
- **Cloudflare Tunnel** - Optional tunnel for remote access via panel.smp45.qzz.io
- **Subdomain management** - Automatic DNS A records for each server subdomain

### Server Management
- Java and Bedrock server support
- Java: Paper, Folia, Spigot, Purpur, Fabric, Forge, NeoForge, Quilt, Vanilla
- Bedrock: Official Bedrock Server, PocketMine-MP, Nukkit, PowerNukkit
- Start, stop, restart, kill servers
- Live console output with command input
- Server properties editor
- Memory, CPU, and disk usage monitoring
- Automatic port allocation

### Mod Manager
- Search and install plugins from Modrinth, Hangar, and Poggit
- Install and remove mods/plugins
- Auto-detects compatible loader for each server type

### Schedule System
- Cron-based task scheduling
- Automated server commands
- Power actions on schedule

### User System
- User registration
- Default admin user (`admin` / `admin123`) auto-created on first run - change it after login
- Admin CLI tool for creating admins
- Role-based access control
- Activity tracking

## Requirements

- **Termux** (Android) - Download from F-Droid or GitHub
- **Node.js** (installed by setup)
- **Java 25** (installed by setup, used inside a proot-distro Ubuntu container)
- **proot-distro** with the `ubuntu` distribution installed (used to run Java servers)

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
│       ├── ServerService.js  # Server process management + software downloads
│       ├── UserService.js    # User management
│       ├── BackupService.js  # Backup system
│       ├── ScheduleService.js # Task scheduling
│       ├── ModService.js     # Modrinth/Hangar/Poggit integration
│       ├── CrashService.js   # Crash detection + auto-restart
│       ├── PlayerService.js  # Whitelist/ops/bans management
│       ├── CloudflareService.js # DNS subdomain management
│       └── SystemInfoService.js # CPU/memory/disk monitoring
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
3. **Servers**: Java servers run inside a proot-distro Ubuntu container; Bedrock/PocketMine run natively

### Java via proot-distro

Java servers are spawned with `proot-distro login ubuntu` and Java 25 installed inside the Ubuntu container. Bedrock Edition servers run directly on Termux:

- **PocketMine-MP** uses PMMP's prebuilt Android ARM64 PHP runtime (auto-downloaded to `data/pmmpphp/` on first use) — no system PHP needed.
- **Nukkit / PowerNukkit** run the NukkitX-family jar via the proot Ubuntu Java. Official Nukkit (CloudburstMC) has no downloadable releases, so Nukkit uses the maintained PowerNukkitX jar.
- **Official Bedrock Dedicated Server** only supports x86_64 CPUs, so on ARM devices the panel shows a clear error and recommends PocketMine or Nukkit.

### Optional Cloudflare Tunnel

If a Cloudflare tunnel token is present at `~/.cloudflared/token`, `start.sh` will launch `cloudflared` alongside the panel and expose it at `https://panel.smp45.qzz.io`. Without the token, the panel simply runs on `http://localhost:3000`.

### No Docker

Unlike Pterodactyl, NetherPanel runs game servers directly as Java processes. This makes it lightweight and easy to set up on Termux.

## Differences from Pterodactyl

| Feature | Pterodactyl | NetherPanel |
|---------|-------------|-------------|
| Docker Required | Yes | No |
| FQDN Required | Yes | No |
| Complexity | High | Low |
| Setup Time | 30+ minutes | 2 minutes |
| Mod Manager | No | Yes |
| Crash Detection | No | Yes |
| Platform | Linux VPS | Termux/Android |

## Troubleshooting

### Java not found

```bash
pkg install openjdk-25
```

Java servers need the `ubuntu` proot-distro with Java 25 installed:

```bash
proot-distro install ubuntu
proot-distro login ubuntu -- apt update && apt install -y openjdk-25
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
