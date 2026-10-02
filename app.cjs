// Startup file. Hosts such as iisnode (Windows/IIS) and Passenger load it with require(),
// which can't load ES modules on Node 18, so this imports the server instead.
//
// If the server can't start (for example, it isn't allowed to write its data folder), this
// serves a page explaining why, instead of the host's blank "HTTP ERROR 500".
'use strict'

const http = require('node:http')

import('./server/index.js').catch((err) => {
  console.error(err)
  startErrorPage(err)
})

function startErrorPage(err) {
  const code = err && err.code
  const permission = code === 'EPERM' || code === 'EACCES'
  const hint = permission
    ? `The server isn't allowed to write to ${err.path || 'its data folder'}. Give the site's user ` +
      '(the IIS application pool identity, IUSR, or the user your host names) permission to modify ' +
      'that folder, or set the DATA_DIR environment variable to a folder it can write. Then restart the site.'
    : code === 'ENOENT'
      ? `A file or folder is missing: ${err.path || 'see the message above'}. Upload the whole release ZIP again, then restart the site.`
      : 'Check that every file from the release ZIP was uploaded, then restart the site. ' +
        'If the problem continues, send this message to whoever maintains the site.'

  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ArteTotal couldn't start</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:44rem;margin:4rem auto;padding:0 1rem;color:#111}
pre{white-space:pre-wrap;background:#f3f3f1;padding:1rem;overflow-wrap:anywhere}</style></head>
<body>
<h1>ArteTotal couldn't start</h1>
<p>${escape(hint)}</p>
<pre>${escape((err && err.message) || err)}</pre>
<p>Node ${escape(process.version)}</p>
</body></html>`

  // PORT is a number, or the named pipe iisnode forwards requests through.
  const port = process.env.PORT || '3001'
  http
    .createServer((req, res) => {
      res.writeHead(500, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(page)
    })
    .listen(/^\d+$/.test(port) ? Number(port) : port)
}
