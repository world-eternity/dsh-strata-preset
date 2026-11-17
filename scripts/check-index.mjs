#!/usr/bin/env node
// Structural check for a plugin index (format 1) before publishing it.
// Mirrors the published rules closely enough to catch the mistakes that make
// DSH reject the whole document. The authoritative validator is
// @deepseek-ai/dsh-plugin-market-index; this script has no dependencies so it
// can run in CI without a checkout.
//
// Usage: node scripts/check-index.mjs [path/to/index.json]

import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? new URL('../market/index.json', import.meta.url)
const problems = []
const at = (path, reason) => problems.push(`${path}: ${reason}`)

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const HTTPS = /^https:\/\/[^\s]+$/i
const COMMIT = /^[0-9a-f]{40}$/

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

function localized(value, path) {
  if (typeof value === 'string') return value !== '' ? undefined : `${path} must not be empty`
  if (!isObject(value)) return `${path} must be a string or an object of language ids`
  if (typeof value.en !== 'string') return `${path} must contain "en"`
  for (const [lang, text] of Object.entries(value)) {
    if (!/^[a-z]{2,3}(-[a-z0-9]+)*$/.test(lang)) return `${path} has invalid language id ${JSON.stringify(lang)}`
    if (typeof text !== 'string') return `${path}.${lang} must be a string`
  }
  return undefined
}

let doc
try {
  doc = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`cannot read ${String(file)}: ${error.message}`)
  process.exit(1)
}

if (!isObject(doc)) at('$', 'must be an object')
else {
  if (doc.format !== 1) at('$.format', 'must be 1')
  const titleProblem = localized(doc.title, '$.title')
  if (titleProblem) at('$.title', titleProblem)
  if (doc.description !== undefined) {
    const problem = localized(doc.description, '$.description')
    if (problem) at('$.description', problem)
  }

  const categories = isObject(doc.metadata?.categories) ? doc.metadata.categories : {}
  const labels = isObject(doc.metadata?.labels) ? doc.metadata.labels : {}
  const sortKeys = isObject(doc.metadata?.sortKeys) ? doc.metadata.sortKeys : {}
  for (const [id, entry] of Object.entries(categories)) {
    const problem = localized(entry?.title, `$.metadata.categories.${id}.title`)
    if (problem) at(`$.metadata.categories.${id}.title`, problem)
  }
  for (const [id, entry] of Object.entries(labels)) {
    const problem = localized(entry?.title, `$.metadata.labels.${id}.title`)
    if (problem) at(`$.metadata.labels.${id}.title`, problem)
  }
  for (const [id, entry] of Object.entries(sortKeys)) {
    const problem = localized(entry?.title, `$.metadata.sortKeys.${id}.title`)
    if (problem) at(`$.metadata.sortKeys.${id}.title`, problem)
    if (entry?.order !== 'asc' && entry?.order !== 'desc') at(`$.metadata.sortKeys.${id}.order`, 'must be "asc" or "desc"')
  }

  if (!Array.isArray(doc.plugins) || doc.plugins.length === 0) at('$.plugins', 'must be a non-empty array')
  const names = new Set()
  for (const [i, plugin] of (Array.isArray(doc.plugins) ? doc.plugins : []).entries()) {
    const path = `$.plugins[${i}]`
    if (!isObject(plugin)) { at(path, 'must be an object'); continue }
    if (typeof plugin.name !== 'string' || plugin.name === '') at(`${path}.name`, 'must be a non-empty npm package name')
    else if (names.has(plugin.name)) at(`${path}.name`, `duplicate plugin ${plugin.name}`)
    else names.add(plugin.name)
    for (const field of ['title', 'description']) {
      if (plugin[field] === undefined) continue
      const problem = localized(plugin[field], `${path}.${field}`)
      if (problem) at(`${path}.${field}`, problem)
    }
    if (plugin.homepage !== undefined && !HTTPS.test(plugin.homepage)) at(`${path}.homepage`, 'must be an https URL')
    if (plugin.repository !== undefined) {
      if (!isObject(plugin.repository) || typeof plugin.repository.url !== 'string') at(`${path}.repository.url`, 'must be a string')
      else if (plugin.repository.directory !== undefined && typeof plugin.repository.directory !== 'string') at(`${path}.repository.directory`, 'must be a string')
    }
    if (plugin.icon !== undefined) {
      if (typeof plugin.icon !== 'string') at(`${path}.icon`, 'must be a string')
      else if (!plugin.icon.startsWith('data:') && !/^https:\/\//i.test(plugin.icon)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(plugin.icon)) at(`${path}.icon`, 'absolute icons must use https:')
      }
    }
    const meta = isObject(plugin.metadata) ? plugin.metadata : {}
    if (meta.category !== undefined && !(meta.category in categories)) at(`${path}.metadata.category`, 'must be a declared category id')
    if (meta.labels !== undefined) {
      if (!Array.isArray(meta.labels)) at(`${path}.metadata.labels`, 'must be an array')
      else for (const label of meta.labels) if (!(label in labels)) at(`${path}.metadata.labels`, `undeclared label ${label}`)
    }
    if (meta.sortKeys !== undefined) {
      if (!isObject(meta.sortKeys)) at(`${path}.metadata.sortKeys`, 'must be an object')
      else for (const [key, value] of Object.entries(meta.sortKeys)) {
        if (!(key in sortKeys)) at(`${path}.metadata.sortKeys.${key}`, 'must be a declared sort key')
        if (value !== null && !Number.isFinite(value)) at(`${path}.metadata.sortKeys.${key}`, 'must be a finite number or null')
      }
    }

    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) { at(`${path}.versions`, 'must be a non-empty array'); continue }
    const versions = new Set()
    for (const [j, version] of plugin.versions.entries()) {
      const vpath = `${path}.versions[${j}]`
      if (!isObject(version)) { at(vpath, 'must be an object'); continue }
      if (typeof version.version !== 'string' || !SEMVER.test(version.version)) at(`${vpath}.version`, 'must be an exact semver version')
      else if (versions.has(version.version)) at(`${vpath}.version`, 'duplicate version')
      else versions.add(version.version)
      if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0) at(`${vpath}.publishTimestamp`, 'must be unix seconds')
      if (version.engines !== undefined && (typeof version.engines?.dsh !== 'string' || version.engines.dsh === '')) at(`${vpath}.engines.dsh`, 'must be a non-empty range string')
      const source = version.source
      if (!isObject(source)) { at(`${vpath}.source`, 'must be an object'); continue }
      if (source.type === 'npm') {
        if (source.registry !== undefined && !HTTPS.test(source.registry)) at(`${vpath}.source.registry`, 'must be an https URL')
      } else if (source.type === 'git') {
        if (!HTTPS.test(source.url ?? '')) at(`${vpath}.source.url`, 'must be an https URL')
        if (!COMMIT.test(source.commit ?? '')) at(`${vpath}.source.commit`, 'must be a 40-hex commit')
        if (source.path !== undefined && (typeof source.path !== 'string' || source.path.startsWith('/'))) at(`${vpath}.source.path`, 'must be a relative directory')
      } else at(`${vpath}.source.type`, 'must be "npm" or "git"')
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`)
  console.error(`\n${problems.length} problem(s) — DSH would reject this index.`)
  process.exit(1)
}
console.log(`✓ index ok: ${doc.plugins.length} plugin(s), ${doc.plugins.reduce((n, p) => n + p.versions.length, 0)} version(s)`)
