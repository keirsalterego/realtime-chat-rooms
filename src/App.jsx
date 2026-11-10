import { useEffect, useRef, useState } from 'react';

const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export default function App() {
  const [session, setSession] = useState(null);
  return session ? (
    <Room {...session} onLeave={() => setSession(null)} />
  ) : (
    <JoinForm onJoin={setSession} />
  );
}

function JoinForm({ onJoin }) {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [room, setRoom] = useState('general');

  const submit = (e) => {
    e.preventDefault();
    if (!username.trim() || !room.trim()) return;
    localStorage.setItem('username', username.trim());
    onJoin({ username: username.trim(), room: room.trim().toLowerCase() });
  };

  return (
    <form className="join" onSubmit={submit}>
      <h1>Chat Rooms</h1>
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24} autoFocus required />
      </label>
      <label>
        Room
        <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={40} required />
      </label>
      <button type="submit">Join</button>
    </form>
  );
}

function Room({ username, room, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [text, setText] = useState('');
  const socket = useRef(null);
  const typingTimers = useRef({});
  const stopTypingTimer = useRef(null);
  const bottom = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    socket.current = ws;
    const timers = typingTimers.current;

    const setUserTyping = (name, isTyping) => {
      clearTimeout(timers[name]);
      setTyping((list) => list.filter((n) => n !== name).concat(isTyping ? [name] : []));
      // clear it ourselves in case the "stopped typing" event never arrives
      if (isTyping) timers[name] = setTimeout(() => setUserTyping(name, false), 5000);
    };

    ws.onopen = () => {
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'join', room, username }));
    };
    ws.onclose = () => setStatus('disconnected');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history') setMessages(data.messages);
      else if (data.type === 'message') {
        setMessages((list) => [...list, data.message]);
        setUserTyping(data.message.username, false);
      } else if (data.type === 'typing') setUserTyping(data.username, data.typing);
    };

    return () => {
      ws.close();
      Object.values(timers).forEach(clearTimeout);
    };
  }, [room, username]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (data) => socket.current?.readyState === WebSocket.OPEN && socket.current.send(JSON.stringify(data));

  const onChange = (e) => {
    setText(e.target.value);
    if (!stopTypingTimer.current) send({ type: 'typing', typing: true });
    clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => {
      send({ type: 'typing', typing: false });
      stopTypingTimer.current = null;
    }, 2000);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    send({ type: 'message', text });
    setText('');
    clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = null;
  };

  return (
    <div className="room">
      <header>
        <div>
          <strong>#{room}</strong>
          <span className={`status ${status}`}>{status}</span>
        </div>
        <div>
          <span className="me">{username}</span>
          <button onClick={onLeave}>Leave</button>
        </div>
      </header>

      <ul className="messages">
        {messages.length === 0 && <li className="empty">No messages yet. Say hi!</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.username === username ? 'mine' : ''}>
            <div className="meta">
              <span>{m.username}</span>
              <time>{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
            <p>{m.text}</p>
          </li>
        ))}
        <li ref={bottom} />
      </ul>

      <div className="typing" aria-live="polite">
        {typing.length === 1 && `${typing[0]} is typing…`}
        {typing.length === 2 && `${typing[0]} and ${typing[1]} are typing…`}
        {typing.length > 2 && 'Several people are typing…'}
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          value={text}
          onChange={onChange}
          placeholder={`Message #${room}`}
          maxLength={2000}
          disabled={status !== 'connected'}
          aria-label="Message"
          autoFocus
        />
        <button type="submit" disabled={status !== 'connected' || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
