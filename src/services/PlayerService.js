const fs = require('fs');
const path = require('path');
const ServerService = require('./ServerService');
const UserService = require('./UserService');

class PlayerService {
  static getWhitelist(serverId) {
    const serverDir = ServerService.getServerDir(serverId);
    const whitelistPath = path.join(serverDir, 'whitelist.json');
    try {
      const data = fs.readFileSync(whitelistPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  static addToWhitelist(serverId, playerName, userId) {
    const whitelist = this.getWhitelist(serverId);
    if (whitelist.some(p => p.name === playerName)) {
      throw new Error('Player is already whitelisted');
    }

    try { ServerService.sendCommand(serverId, `whitelist add ${playerName}`, userId); } catch {}

    whitelist.push({ name: playerName });
    const serverDir = ServerService.getServerDir(serverId);
    fs.writeFileSync(path.join(serverDir, 'whitelist.json'), JSON.stringify(whitelist, null, 2));

    UserService.logActivity(userId, 'whitelist_add', 'server', serverId, `Added "${playerName}" to whitelist`);
    return whitelist;
  }

  static removeFromWhitelist(serverId, playerName, userId) {
    const whitelist = this.getWhitelist(serverId);
    const index = whitelist.findIndex(p => p.name === playerName);
    if (index === -1) {
      throw new Error('Player is not whitelisted');
    }

    try { ServerService.sendCommand(serverId, `whitelist remove ${playerName}`, userId); } catch {}

    whitelist.splice(index, 1);
    const serverDir = ServerService.getServerDir(serverId);
    fs.writeFileSync(path.join(serverDir, 'whitelist.json'), JSON.stringify(whitelist, null, 2));

    UserService.logActivity(userId, 'whitelist_remove', 'server', serverId, `Removed "${playerName}" from whitelist`);
    return whitelist;
  }

  static getOps(serverId) {
    const serverDir = ServerService.getServerDir(serverId);
    const opsPath = path.join(serverDir, 'ops.json');
    try {
      const data = fs.readFileSync(opsPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  static addOp(serverId, playerName, level = 4, userId) {
    const ops = this.getOps(serverId);
    if (ops.some(p => p.name === playerName)) {
      throw new Error('Player is already an operator');
    }

    try { ServerService.sendCommand(serverId, `op ${playerName}`, userId); } catch {}

    ops.push({ name: playerName, level, bypassesPlayerLimit: false });
    const serverDir = ServerService.getServerDir(serverId);
    fs.writeFileSync(path.join(serverDir, 'ops.json'), JSON.stringify(ops, null, 2));

    UserService.logActivity(userId, 'op_add', 'server', serverId, `Opped "${playerName}" (level ${level})`);
    return ops;
  }

  static removeOp(serverId, playerName, userId) {
    const ops = this.getOps(serverId);
    const index = ops.findIndex(p => p.name === playerName);
    if (index === -1) {
      throw new Error('Player is not an operator');
    }

    try { ServerService.sendCommand(serverId, `deop ${playerName}`, userId); } catch {}

    ops.splice(index, 1);
    const serverDir = ServerService.getServerDir(serverId);
    fs.writeFileSync(path.join(serverDir, 'ops.json'), JSON.stringify(ops, null, 2));

    UserService.logActivity(userId, 'op_remove', 'server', serverId, `Deopped "${playerName}"`);
    return ops;
  }

  static getBannedPlayers(serverId) {
    const serverDir = ServerService.getServerDir(serverId);
    const bannedPath = path.join(serverDir, 'banned-players.json');
    try {
      const data = fs.readFileSync(bannedPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  static banPlayer(serverId, playerName, reason = 'Banned by server operator', userId) {
    const banned = this.getBannedPlayers(serverId);
    if (banned.some(p => p.name === playerName)) {
      throw new Error('Player is already banned');
    }

    try { ServerService.sendCommand(serverId, `ban ${playerName} ${reason}`, userId); } catch {}

    banned.push({
      name: playerName,
      created: new Date().toISOString(),
      expires: 'forever',
      reason,
      source: 'Server'
    });
    const serverDir = ServerService.getServerDir(serverId);
    fs.writeFileSync(path.join(serverDir, 'banned-players.json'), JSON.stringify(banned, null, 2));

    UserService.logActivity(userId, 'ban_player', 'server', serverId, `Banned "${playerName}": ${reason}`);
    return banned;
  }

  static unbanPlayer(serverId, playerName, userId) {
    const banned = this.getBannedPlayers(serverId);
    const index = banned.findIndex(p => p.name === playerName);
    if (index === -1) {
      throw new Error('Player is not banned');
    }

    try { ServerService.sendCommand(serverId, `pardon ${playerName}`, userId); } catch {}

    banned.splice(index, 1);
    const serverDir = ServerService.getServerDir(serverId);
    fs.writeFileSync(path.join(serverDir, 'banned-players.json'), JSON.stringify(banned, null, 2));

    UserService.logActivity(userId, 'unban_player', 'server', serverId, `Unbanned "${playerName}"`);
    return banned;
  }
}

module.exports = PlayerService;
