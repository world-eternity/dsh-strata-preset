#!/usr/bin/env node
// Publish or update this repository on GitHub through api.github.com only.
//
// Written for machines where github.com:443 is unreachable but api.github.com
// works: nothing here talks to the web UI or uses git.
//
//   node scripts/publish-github.mjs              # create repo, then sync files
//   node scripts/publish-github.mjs --dry-run    # print what would change
//   node scripts/publish-github.mjs --message "bump preset to 2.3.0"
//
// Token lookup, first hit wins:
//   1. GITHUB_TOKEN / GH_TOKEN
//   2. %LOCALAPPDATA%\dsh-secrets\github-token   (Windows)
//      ~/.config/dsh/github-token                (other systems)
//   Keep the file outside any repository; it is plaintext.
//
// Sync semantics: a file whose git blob hash matches the remote one is skipped,
// so re-running is safe and every change becomes one commit.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import https from 'node:https'

const root = process.cwd()
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const isPrivate = argv.includes('--private')
const replaceOwner = argv.includes('--replace-owner')
const flag = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const repoName = flag('--repo', JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name)
const message = flag('--message', `sync ${new Date().toISOString().slice(0, 10)}`)

const tokenFile = process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA ?? '', 'dsh-secrets', 'github-token')
  : join(process.env.HOME ?? '', '.config', 'dsh', 'github-token')

const token = process.env.GITHUB_TOKEN
  || process.env.GH_TOKEN
  || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')

if (!token && !dryRun) {
  console.error(`no token: set GITHUB_TOKEN or write one to ${tokenFile}`)
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

const blobSha = (buffer) => {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8')
  return createHash('sha1').update(header).update(buffer).digest('hex')
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

// README first: when the repository is new, the first PUT creates the branch.
files.sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : a.localeCompare(b)))

const main = async () => {
  if (dryRun) {
    console.log(`repo: ${repoName} (${isPrivate ? 'private' : 'public'})`)
    console.log(`token: ${token ? (process.env.GITHUB_TOKEN || process.env.GH_TOKEN ? 'from env' : `from ${tokenFile}`) : 'MISSING'}`)
    console.log(`files: ${files.length}`)
    for (const file of files) console.log('  ' + file)
    return
  }

  const me = await api('GET', '/user')
  console.log(`authenticated as ${me.login}`)

  if (replaceOwner) {
    for (const file of ['package.json', 'market/index.json', 'LICENSE']) {
      const before = readFileSync(join(root, file), 'utf8')
      const after = before.replace(/\bOWNER\b/g, me.login)
      if (after !== before) { writeFileSync(join(root, file), after); console.log(`OWNER → ${me.login} in ${file}`) }
    }
  }

  let repo
  let created = false
  try {
    repo = await api('POST', '/user/repos', {
      name: repoName,
      private: isPrivate,
      description: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).description,
    })
    created = true
    console.log(`created ${repo.html_url}`)
  } catch (error) {
    if (error.status !== 422) throw error
    repo = await api('GET', `/repos/${me.login}/${repoName}`)
    console.log(`existing repository: ${repo.html_url}`)
  }

  let added = 0
  let updated = 0
  let skipped = 0

  for (const [index, file] of files.entries()) {
    const buffer = readFileSync(join(root, file))
    const path = `/repos/${me.login}/${repoName}/contents/${file}`
    let remote
    if (!created) {
      try { remote = await api('GET', `${path}?ref=main`) } catch (error) { if (error.status !== 404) throw error }
    }
    if (remote && remote.sha === blobSha(buffer)) { skipped += 1; continue }

    const body = { message: remote ? `${message}: ${file}` : `add ${file}`, content: buffer.toString('base64') }
    if (!remote && index === 0) body.branch = 'main'
    if (remote) body.sha = remote.sha

    let attempt = 0
    for (;;) {
      try {
        await api('PUT', path, body)
        break
      } catch (error) {
        if (attempt >= 2 || (error.status && error.status < 500)) throw error
        attempt += 1
        await new Promise((r) => setTimeout(r, 1500 * attempt))
      }
    }
    if (remote) { updated += 1; console.log(`  ~ ${file}`) } else { added += 1; console.log(`  + ${file}`) }
  }

  if (!created && repo.default_branch !== 'main') {
    await api('PATCH', `/repos/${me.login}/${repoName}`, { default_branch: 'main' })
    console.log('default branch set to main')
  }
  console.log(`\nadded ${added}, updated ${updated}, unchanged ${skipped}\n${repo.html_url}`)
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`)
  process.exit(1)
})
