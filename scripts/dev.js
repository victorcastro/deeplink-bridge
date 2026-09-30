#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { build } = require('./build');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist');
const configPath = path.join(root, 'config.json');
const port = Number(process.env.PORT) || 8080;

function rebuild() {
  try { build({ configPath, outDir }); } catch (e) { console.error(e.message); }
}

rebuild();
fs.watch(path.join(root, 'src'), rebuild);
fs.watch(configPath, rebuild);

http.createServer((req, res) => {
  const file = path.join(outDir, req.url.split('?')[0] === '/' ? 'index.html' : '404.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); return res.end('Build missing'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}  (watching src/ and config.json)`));
