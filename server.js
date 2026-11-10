import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_LIMIT = 50;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function createServer({ dataFile = path.join(root, 'data', 'messages.json'), staticDir = path.join(root, 'dist') } = {}) {
  // room name -> last 50 messages
  let history = {};
  try {
    history = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    // no saved history yet
  }

  // shortcut: rewrites the whole file on every message, fine for small rooms; move to SQLite/Redis if traffic grows
  const save = () => {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile + '.tmp', JSON.stringify(history));
    fs.renameSync(dataFile + '.tmp', dataFile);
  };

  const server = http.createServer((req, res) => {
    // serve the built React app (npm run build)
    let urlPath = '/';
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      // malformed URL, fall back to index.html
    }
    let file = path.join(staticDir, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(staticDir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(staticDir, 'index.html');
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Client not built. Run "npm run build" or use "npm run dev".');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

  const send = (ws, data) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(data));
  const broadcast = (room, data, except) => {
    for (const client of wss.clients) {
      if (client.room === room && client !== except) send(client, data);
    }
  };
  const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return send(ws, { type: 'error', error: 'Invalid JSON' });
      }

      if (msg.type === 'join') {
        const room = clean(msg.room, 40).toLowerCase();
        const username = clean(msg.username, 24);
        if (!room || !username) return send(ws, { type: 'error', error: 'Room and username are required' });
        ws.room = room;
        ws.username = username;
        send(ws, { type: 'history', room, messages: history[room] || [] });
        return;
      }

      if (!ws.room) return send(ws, { type: 'error', error: 'Join a room first' });

      if (msg.type === 'message') {
        const text = clean(msg.text, 2000);
        if (!text) return;
        const message = { id: crypto.randomUUID(), username: ws.username, text, ts: Date.now() };
        history[ws.room] = [...(history[ws.room] || []), message].slice(-HISTORY_LIMIT);
        save();
        broadcast(ws.room, { type: 'message', message });
        broadcast(ws.room, { type: 'typing', username: ws.username, typing: false }, ws);
      } else if (msg.type === 'typing') {
        broadcast(ws.room, { type: 'typing', username: ws.username, typing: Boolean(msg.typing) }, ws);
      }
    });

    ws.on('close', () => {
      if (ws.room) broadcast(ws.room, { type: 'typing', username: ws.username, typing: false });
    });
  });

  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3001;
  createServer().listen(port, () => console.log(`Chat server running on http://localhost:${port}`));
}
