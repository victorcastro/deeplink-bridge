#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RELEASE_PATHS = [
  /^src\//,
  /^scripts\//,
  /^test\//,
  /^config\.json$/,
  /^package\.json$/,
  /^\.github\/workflows\/release\.yml$/
];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function compareSemver(a, b) {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`Invalid semver: "${!pa ? a : b}" (expected X.Y.Z)`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function check(baseRef) {
  const errors = [];
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
  if (!SEMVER.test(version)) return [`package.json version "${version}" must be X.Y.Z`];

  const changed = git('diff', '--name-only', `${baseRef}...HEAD`).split('\n').filter(Boolean);
  if (!changed.some((f) => RELEASE_PATHS.some((re) => re.test(f)))) {
    console.log('No deployable files changed: version bump not required.');
    return [];
  }

  let baseVersion = null;
  try {
    baseVersion = JSON.parse(git('show', `${baseRef}:package.json`)).version;
  } catch (e) {
    console.log(`No package.json in ${baseRef}: skipping bump comparison.`);
  }
  if (baseVersion && compareSemver(version, baseVersion) <= 0) {
    errors.push(`package.json version ${version} must be greater than ${baseRef} (${baseVersion}). Bump it.`);
  }

  if (git('tag', '--list', `v${version}`).trim()) {
    errors.push(`Tag v${version} already exists. Bump the version.`);
  }
  return errors;
}

if (require.main === module) {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error('Usage: node scripts/check-version.js <base-ref>');
    process.exit(2);
  }
  try {
    const errors = check(baseRef);
    if (errors.length) {
      errors.forEach((e) => console.error(`::error::${e}`));
      process.exit(1);
    }
    console.log('Version check passed.');
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}

module.exports = { compareSemver };
