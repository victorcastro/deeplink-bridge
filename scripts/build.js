#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function validateConfig(c) {
  const errors = [];
  const str = (k) => typeof c[k] === 'string' && c[k].trim() !== '';
  const httpsUrl = (k) => str(k) && /^https:\/\/[^\s\\]+$/.test(c[k]);

  if (!httpsUrl('universalLink') || c.universalLink.includes(';')) {
    errors.push('universalLink must be an https URL without ";"');
  }
  if (!httpsUrl('iosStoreUrl')) errors.push('iosStoreUrl must be an https URL');
  if (!httpsUrl('androidStoreUrl')) errors.push('androidStoreUrl must be an https URL');
  if (!str('androidPackage') || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(c.androidPackage)) {
    errors.push('androidPackage must look like "com.example.app"');
  }
  for (const k of ['fallbackDelay', 'inAppAndroidDelay']) {
    if (!Number.isInteger(c[k]) || c[k] <= 0) errors.push(`${k} must be a positive integer (ms)`);
  }
  return errors;
}

function read(file) {
  return fs.readFileSync(path.join(root, 'src', file), 'utf8');
}

function build({ configPath, outDir }) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const errors = validateConfig(config);
  if (errors.length) {
    throw new Error(`Invalid ${path.relative(root, configPath) || configPath}:\n - ${errors.join('\n - ')}`);
  }

  const configJs = 'window.DEEPLINK_CONFIG = ' +
    JSON.stringify(config, null, 2).replace(/</g, '\\u003c') + ';';

  const parts = {
    '/* @styles */': read('styles.css'),
    '/* @config */': configJs,
    '/* @lib */': read('lib.js'),
    '/* @app */': read('app.js')
  };

  let html = read('index.html');
  for (const [marker, content] of Object.entries(parts)) {
    if (!html.includes(marker)) throw new Error(`Marker ${marker} not found in src/index.html`);
    html = html.replace(marker, () => content);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  fs.writeFileSync(path.join(outDir, '404.html'), html);
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  return html.length;
}

if (require.main === module) {
  try {
    const outDir = path.resolve(root, arg('--out', 'dist'));
    const size = build({ configPath: path.resolve(root, arg('--config', 'config.json')), outDir });
    console.log(`Built ${path.relative(root, outDir) || '.'}/ (${size} bytes)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { build, validateConfig };
