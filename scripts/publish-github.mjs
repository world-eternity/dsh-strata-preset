#!/usr/bin/env node
// Publish this repository to GitHub through api.github.com only.
//
// Written for machines where github.com:443 is unreachable but api.github.com
// works: nothing here talks to the web UI or uses git.
//
//   $env:GITHUB_TOKEN = 'ghp_...'          # needs repo scope (classic) or
//   node scripts/publish-github.mjs        # Contents: read+write (fine-grained)
//
// Options:
//   --repo <name>     repository name (default: package.json name)
//   --private         create it private instead of public
//   --dry-run         print the plan and the file that would be uploaded, do nothing
//   --replace-owner   rewrite OWNER placeholders in the working tree first
//
// The token is read from GITHUB_TOKEN (or GH_TOKEN) so it never lands in shell
// history. Create it at https://github.com/settings/tokens, revoke it after.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import https from 'node:https'

const root = process.cwd()
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const isPrivate = argv.includes('--private')
const replaceOwner = argv.includes('--replace-owner')
const repoName = (() => {
  const i = argv.indexOf('--repo')
  return i >= 0 && argv[i + 1] ? argv[i + 1] : JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
})()

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!token && !dryRun) {
  console.error('GITHUB_TOKEN (or GH_TOKEN) is not set. See the header of this file.')
  process.exit(1)
}

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          'user-agent': 'dsh-strata-preset-publisher',
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let parsed
          try { parsed = text ? JSON.parse(text) : undefined } catch { parsed = text }
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed)
          const error = new Error(`${method} ${path} -> ${res.statusCode}: ${text.slice(0, 300)}`)
          error.status = res.statusCode
          reject(error)
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error(`timeout: ${method} ${path}`)))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const SKIP = new Set(['node_modules', '.git', '.plugin-market'])
const files = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.endsWith('.tgz') || name.endsWith('.log')) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full)
    else files.push(relative(root, full).split(sep).join('/'))
  }
})(root)

// README first: the first PUT creates the branch.
files.sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : a.localeCompare(b)))

if (replaceOwner && token) {
  for (const file of ['package.json', 'market/index.json', 'LICENSE']) {
    const before = readFileSync(join(root, file), 'utf8')
    const after = before.replace(/\bOWNER\b/g, '__LOGIN__')
    if (after !== before) writeFileSync(join(root, file), after)
  }
}

const main = async () => {
  if (dryRun) {
    console.log(`repo: ${repoName} (${isPrivate ? 'private' : 'public'})`)
    console.log(`files: ${files.length}`)
    for (const file of files) console.log('  ' + file)
    return
  }

  const me = await api('GET', '/user')
  console.log(`authenticated as ${me.login} (${me.email ?? 'no public email'})`)

  if (replaceOwner) {
    for (const file of ['package.json', 'market/index.json', 'LICENSE']) {
      const before = readFileSync(join(root, file), 'utf8')
      writeFileSync(join(root, file), before.replace(/__LOGIN__/g, me.login))
    }
    console.log(`OWNER placeholders set to ${me.login}`)
  }

  let repo
  try {
    repo = await api('POST', '/user/repos', { name: repoName, private: isPrivate, description: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).description })
    console.log(`created ${repo.html_url}`)
  } catch (error) {
    if (error.status !== 422) throw error
    repo = await api('GET', `/repos/${me.login}/${repoName}`)
    console.log(`repository already exists: ${repo.html_url} (uploading into it)`)
  }

  for (const [index, file] of files.entries()) {
    const content = readFileSync(join(root, file)).toString('base64')
    const body = { message: `add ${file}`, content }
    if (index === 0) body.branch = 'main'
    let attempt = 0
    for (;;) {
      try {
        await api('PUT', `/repos/${me.login}/${repoName}/contents/${file}`, body)
        break
      } catch (error) {
        if (error.status === 422 && /already exists/i.test(error.message)) { console.log(`  = ${file} (exists)`); break }
        if (attempt >= 2 || (error.status && error.status < 500)) throw error
        attempt += 1
        await new Promise((r) => setTimeout(r, 1500 * attempt))
      }
    }
    console.log(`  + ${file} (${index + 1}/${files.length})`)
  }

  if (repo.default_branch !== 'main') {
    await api('PATCH', `/repos/${me.login}/${repoName}`, { default_branch: 'main' })
    console.log('default branch set to main')
  }
  console.log(`\ndone: ${repo.html_url}`)
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`)
  process.exit(1)
})
