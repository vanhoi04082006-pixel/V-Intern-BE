/** Local demonstration inbox. Loopback only; bounded RAM; never relays mail externally. */
"use strict";
const net = require("node:net"),
  http = require("node:http"),
  { randomUUID } = require("node:crypto");
const messages = [];
function decoded(raw) {
  const qp = (value) =>
    Buffer.from(
      value
        .replace(/=\r\n/g, "")
        .replace(/=([a-f0-9]{2})/gi, (_, h) =>
          String.fromCharCode(parseInt(h, 16)),
        ),
      "latin1",
    ).toString("utf8");
  const subject = (
    raw.match(/^Subject: ([\s\S]*?)(?=\r\n\S|\r\n\r\n)/im)?.[1] ?? ""
  )
    .replace(/\r\n\s+/g, " ")
    .replace(/=\?UTF-8\?([BQ])\?([^?]+)\?=/gi, (_, mode, value) =>
      mode.toUpperCase() === "B"
        ? Buffer.from(value, "base64").toString("utf8")
        : qp(value.replace(/_/g, " ")),
    );
  const plain = raw.match(
    /Content-Type: text\/plain[^\r]*\r\nContent-Transfer-Encoding: ([^\r]+)\r\n\r\n([\s\S]*?)(?=\r\n--|$)/i,
  );
  const text = plain
    ? plain[1] === "base64"
      ? Buffer.from(plain[2].replace(/\s/g, ""), "base64").toString("utf8")
      : qp(plain[2])
    : qp(raw);
  return { subject, text };
}
const smtp = net.createServer((socket) => {
  socket.setTimeout(60000, () => socket.destroy());
  socket.write("220 V-Intern LOCAL demo inbox\r\n");
  let buffer = "",
    data = false,
    body = "",
    recipient = "";
  socket.on("error", () => undefined);
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    if (buffer.length + body.length > 2 * 1024 * 1024) return socket.destroy();
    let index;
    while ((index = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (data) {
        if (line === ".") {
          messages.push({
            id: randomUUID(),
            recipient,
            createdAt: new Date().toISOString(),
            ...decoded(body),
          });
          if (messages.length > 100) messages.shift();
          body = "";
          data = false;
          socket.write("250 accepted into LOCAL memory inbox\r\n");
        } else body += line.replace(/^\.\./, ".") + "\r\n";
      } else if (/^EHLO/.test(line))
        socket.write("250-localhost\r\n250 8BITMIME\r\n");
      else if (/^RCPT TO:/.test(line)) {
        recipient = line.slice(8).trim().replace(/[<>]/g, "");
        socket.write("250 ok\r\n");
      } else if (line === "DATA") {
        data = true;
        socket.write("354 send body\r\n");
      } else if (line === "QUIT") socket.end("221 bye\r\n");
      else socket.write("250 ok\r\n");
    }
  });
});
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>V-Intern · Hộp thư local</title><style>body{font:16px/1.6 system-ui;margin:40px auto;max-width:1000px;padding:0 20px;color:#172b4d;background:#f5f7fc}h1{font-size:26px}button{padding:10px 14px;border:1px solid #ddd;border-radius:6px;background:white;color:#174ab2;cursor:pointer}article{background:white;padding:24px;margin-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.7 system-ui}a{color:#2563eb}small{color:#64748b}</style><h1>V-Intern · Hộp thư local</h1><p>Chỉ phục vụ demo trên máy này. Thư được giữ trong bộ nhớ tối đa 24 giờ và không gửi đến Gmail/Outlook.</p><button id="refresh">Làm mới hộp thư</button><section id="mails"></section><script>async function load(){const data=await(await fetch('/messages')).json(),root=document.querySelector('#mails');root.replaceChildren();for(const m of data.reverse()){const a=document.createElement('article'),h=document.createElement('h2'),meta=document.createElement('small'),body=document.createElement('pre');h.textContent=m.subject;meta.textContent=m.recipient+' · '+new Date(m.createdAt).toLocaleString('vi-VN');body.textContent=m.text;a.append(h,meta,body);for(const match of m.text.matchAll(/https?:[^\\s<>]+/g)){try{const url=new URL(match[0]);if(!['localhost','127.0.0.1'].includes(url.hostname))continue;const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Mở liên kết V-Intern →';a.append(link)}catch{}}root.append(a)}}document.querySelector('#refresh').onclick=load;load()</script></html>`;
const inbox = http.createServer((req, res) => {
  const allowed = ['localhost:8025', '127.0.0.1:8025'];
  if (!allowed.includes(req.headers.host ?? '') || req.headers.origin && !allowed.map(host => 'http://' + host).includes(req.headers.origin)) { res.statusCode = 403; res.end(); return; }
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.url === "/messages") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(messages));
  } else if (req.url === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  } else {
    res.statusCode = 404;
    res.end();
  }
});
smtp.listen(2525, "127.0.0.1");
inbox.listen(8025, "127.0.0.1");
setInterval(() => {
  const cutoff = Date.now() - 86400000;
  while (messages.length && new Date(messages[0].createdAt).getTime() < cutoff)
    messages.shift();
}, 60000).unref();
console.log(
  "V-Intern local SMTP 127.0.0.1:2525; inbox http://localhost:8025; no external delivery.",
);
