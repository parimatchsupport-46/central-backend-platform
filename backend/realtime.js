// Strict Project-Isolated Real-Time SSE Broadcaster
const clients = new Map(); // projectId -> Set<res>

function subscribe(projectId, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering for SSE
  res.flushHeaders?.();

  if (!clients.has(projectId)) {
    clients.set(projectId, new Set());
  }
  clients.get(projectId).add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  res.on('close', () => {
    clearInterval(heartbeat);
    const set = clients.get(projectId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(projectId);
    }
  });
}

function broadcast(projectId, event, payload) {
  const set = clients.get(projectId);
  if (!set) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    res.write(msg);
  }
}

module.exports = { subscribe, broadcast };
