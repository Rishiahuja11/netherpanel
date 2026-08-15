const net = require('net');
const dgram = require('dgram');

const cache = new Map();
const TTL = 5000;
const HOST = '127.0.0.1';

const MAGIC = Buffer.from([
  0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe,
  0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78
]);

function writeVarInt(value) {
  const out = [];
  while (true) {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    out.push(byte);
    if (value === 0) break;
  }
  return Buffer.from(out);
}

function readVarInt(buf, offset) {
  let result = 0;
  let shift = 0;
  let i = offset || 0;
  while (i < buf.length) {
    const b = buf[i++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, offset: i };
}

function writeString(str) {
  const buf = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(buf.length), buf]);
}

async function pingJava(port, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (result) => {
      if (!done) { done = true; socket.destroy(); resolve(result); }
    };
    const timer = setTimeout(() => finish(null), timeout);

    socket.connect(port, HOST, () => {
      const handshake = Buffer.concat([
        writeVarInt(0x00),
        writeVarInt(754),
        writeString(HOST),
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        writeVarInt(1)
      ]);
      const request = Buffer.concat([
        writeVarInt(0x01),
        writeVarInt(0x00)
      ]);
      socket.write(handshake);
      socket.write(request);
    });

    let received = Buffer.alloc(0);
    socket.on('data', (data) => {
      received = Buffer.concat([received, data]);
      try {
        const len = readVarInt(received, 0);
        const payloadStart = len.offset;
        if (received.length < payloadStart + len.value) return;
        const id = readVarInt(received, payloadStart);
        const str = readVarInt(received, id.offset);
        const jsonStr = received.toString('utf8', str.offset, str.offset + str.value);
        const parsed = JSON.parse(jsonStr);
        clearTimeout(timer);
        const players = parsed.players || {};
        finish({
          online: true,
          motd: typeof parsed.description === 'string' ? parsed.description
            : (parsed.description && parsed.description.text) || '',
          version: parsed.version && parsed.version.name,
          playersOnline: players.online || 0,
          playersMax: players.max || 0,
          latency: Date.now() - socketStart
        });
      } catch (e) {
        // wait for more data
      }
    });

    const socketStart = Date.now();
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));
  });
}

async function pingRakNet(port, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let done = false;
    const finish = (result) => {
      if (!done) { done = true; try { socket.close(); } catch (e) {} resolve(result); }
    };
    const timer = setTimeout(() => finish(null), timeout);

    const timestamp = Buffer.alloc(8);
    const clientGuid = Buffer.alloc(8);
    timestamp.writeBigUInt64BE(BigInt(Date.now()), 0);
    const ping = Buffer.concat([Buffer.from([0x01]), timestamp, MAGIC, clientGuid]);

    socket.on('message', (msg) => {
      if (msg.length < 35 || msg[0] !== 0x1c) return;
      const magic = msg.slice(1, 17);
      if (!magic.equals(MAGIC)) return;
      const motdLen = msg.readUInt16BE(33);
      const motd = msg.toString('utf8', 35, 35 + motdLen);
      const parts = motd.split(';');
      let playersOnline = 0;
      let playersMax = 0;
      let name = motd;
      if (parts.length >= 6 && parts[0] === 'MCPE') {
        name = parts[1] || parts[0];
        const version = parts[3];
        playersOnline = parseInt(parts[4], 10) || 0;
        playersMax = parseInt(parts[5], 10) || 0;
        if (parts[0] === 'MCPE' && !name && parts[1]) name = parts[1];
        clearTimeout(timer);
        finish({ online: true, motd: name, version, playersOnline, playersMax, latency: Date.now() - started });
        return;
      }
      clearTimeout(timer);
      finish({ online: true, motd: motd.slice(0, 64), version: '', playersOnline: 0, playersMax: 0, latency: Date.now() - started });
    });

    const started = Date.now();
    socket.on('error', () => finish(null));
    socket.bind(0, () => {
      socket.send(ping, port, HOST);
    });
  });
}

class ServerQueryService {
  static async query(server) {
    if (!server) return null;

    const cached = cache.get(server.id);
    if (cached && Date.now() - cached.ts < TTL) return cached.result;

    const port = server.port || 25565;
    const isBedrock = (server.game_type || server.server_type || 'java').toLowerCase() !== 'java';

    let result;
    try {
      result = isBedrock ? await pingRakNet(port) : await pingJava(port);
    } catch (e) {
      result = null;
    }

    const final = result || { online: false };
    cache.set(server.id, { ts: Date.now(), result: final });
    return final;
  }

  static clearCache(serverId) {
    if (serverId) cache.delete(serverId);
    else cache.clear();
  }
}

module.exports = ServerQueryService;
