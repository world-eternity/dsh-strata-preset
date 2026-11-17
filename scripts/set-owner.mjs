#!/usr/bin/env node
// One-shot replacement of the OWNER placeholder.
//
// Usage: node scripts/set-owner.mjs <github-user>

import { readFileSync, writeFileSync } from 'node:fs'

const owner = process.argv[2]
if (!owner || !/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(owner)) {
  console.error('usage: node scripts/set-owner.mjs <github-user>')
  process.exit(1)
}

const files = ['package.json', 'market/index.json', 'LICENSE']
let changed = 0
for (const file of files) {
  const before = readFileSync(file, 'utf8')
  const after = before.replace(/\bOWNER\b/g, owner)
  if (after !== before) {
    writeFileSync(file, after)
    const hits = (before.match(/\bOWNER\b/g) ?? []).length
    changed += hits
    console.log(`${file}: ${hits} replacement(s)`)
  }
}
console.log(changed > 0 ? `done: ${owner}` : 'nothing to replace — was this already run?')
