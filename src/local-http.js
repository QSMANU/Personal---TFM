// Same-origin, loopback-only boundary for the read-only panel and HTTP MCP.
export function allowLocalRequest(req, res) {
  const local = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const valid = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' && !url.username && !url.password
        && local.has(url.hostname) && Number(url.port || 80) === req.socket.localPort;
    } catch { return false; }
  };
  if (!req.headers.host || !valid('http://' + req.headers.host)
    || (req.headers.origin !== undefined && !valid(req.headers.origin))) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Host/Origin no permitido; usar loopback y el puerto del servicio.' }));
    return false;
  }
  return true;
}

export function loopback(host) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('El servicio local solo puede escuchar en loopback.');
  return host;
}
