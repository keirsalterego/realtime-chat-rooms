# Realtime Chat Rooms

Chat rooms that update instantly, built with Node.js, WebSockets (`ws`) and React (Vite).

## Features

- Join any room with a username (rooms are created on first join)
- Messages show up live for everyone in the same room
- The last 50 messages per room are saved to disk and loaded when you join
- Typing indicator ("alice is typing…")
- Connection status badge, basic input validation and length limits

## Requirements

- Node.js 20 or newer
- npm

## Setup

```bash
git clone https://github.com/keirsalterego/realtime-chat-rooms.git
cd realtime-chat-rooms
npm install
```

## Run

### Production (single server)

```bash
npm run build   # builds the React app into dist/
npm start       # serves the app + WebSocket on http://localhost:3001
```

Open http://localhost:3001 in two browser windows, join the same room with different usernames and start chatting.

Use a different port with `PORT=8080 npm start`.

### Development (hot reload)

Run these in two terminals:

```bash
npm run dev:server   # WebSocket server on :3001, restarts on changes
npm run dev          # Vite dev server on http://localhost:5173 (proxies /ws to :3001)
```

### Tests

```bash
npm test
```

Covers live broadcast per room, the typing indicator, the 50-message history and input validation.

## How it works

- `server.js` runs one HTTP server. It serves the built React app and accepts WebSocket connections on `/ws`.
- History is kept in memory and written to `data/messages.json` after every message, so it survives restarts. Only the latest 50 messages per room are kept.
- `src/App.jsx` holds the join screen and the chat room UI.

### WebSocket messages

Client to server:

| Type      | Payload                     |
| --------- | --------------------------- |
| `join`    | `{ room, username }`        |
| `message` | `{ text }`                  |
| `typing`  | `{ typing: true \| false }` |

Server to client:

| Type      | Payload                                        |
| --------- | ---------------------------------------------- |
| `history` | `{ room, messages: [...] }` (sent after join)  |
| `message` | `{ message: { id, username, text, ts } }`      |
| `typing`  | `{ username, typing }`                         |
| `error`   | `{ error }`                                    |

## Project structure

```
server.js            HTTP + WebSocket server, message history
src/App.jsx          React UI (join form, room, typing indicator)
src/style.css        Styles
test/                Server tests (node:test)
vite.config.js       Vite config with /ws proxy for development
```
