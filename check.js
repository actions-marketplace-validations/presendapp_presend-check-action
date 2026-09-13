#!/usr/bin/env node
// Lit package.json (npm) ou requirements.txt (PyPI), vérifie chaque dépendance
// contre l'API Presend, résume les résultats, et sort avec un code d'erreur
// si quelque chose de suspect est trouvé (sauf si fail-on-issue=false).
//
// maintainer-change-check est npm uniquement pour l'instant -- ignoré
// silencieusement en mode pypi plutôt que de générer des erreurs inutiles.

import { readFileSync, existsSync } from 'fs';

const API_BASE = process.env.PRESEND_API_BASE || 'https://presend.pages.dev/api';
const ECOSYSTEM = (process.env.ECOSYSTEM || 'npm').toLowerCase();
const MANIFEST_PATH = process.env.MANIFEST_PATH || (ECOSYSTEM === 'pypi' ? 'requirements.txt' : 'package.json');
const FAIL_ON_ISSUE = (process.env.FAIL_ON_ISSUE || 'true') !== 'false';
const REQUESTED_CHECKS = (process.env.CHECKS || 'maintainer,vulnerability').split(',').map(s => s.trim());

function readNpmDependencies(path) {
  const pkg = JSON.parse(readFileSync(path, 'utf-8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return Object.keys(deps);
}

function readPypiDependencies(path) {
  const lines = readFileSync(path, 'utf-8').split('\n');
  const names = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
    if (match) names.push(match[1]);
  }
  return [...new Set(names)];
}

function readDependencies(ecosystem, path) {
  if (!existsSync(path)) {
    throw new Error(`Manifest file not found: ${path}`);
  }
  return ecosystem === 'pypi' ? readPypiDependencies(path) : readNpmDependencies(path);
}

async function checkMaintainer(ecosystem, pkgName) {
  const url = `${API_BASE}/maintainer-change-check?ecosystem=${ecosystem}&package=${encodeURIComponent(pkgName)}`;
  const res = await fetch(url);
  if (!res.ok) return { pkgName, check: 'maintainer', error: `HTTP ${res.status}` };
  const data = await res.json();
  return { pkgName, check: 'maintainer', suspicious: !!data.suspicious, details: data.flagged_events };
}

async function checkVulnerability(ecosystem, pkgName) {
  const url = `${API_BASE}/vulnerability-check?ecosystem=${ecosystem}&package=${encodeURIComponent(pkgName)}`;
  const res = await fetch(url);
  if (!res.ok) return { pkgName, check: 'vulnerability', error: `HTTP ${res.status}` };
  const data = await res.json();
  const count = (data.vulnerabilities || []).length;
  return { pkgName, check: 'vulnerability', suspicious: count > 0, count, details: data.vulnerabilities };
}

export async function run(manifestPath = MANIFEST_PATH, ecosystem = ECOSYSTEM) {
  const deps = readDependencies(ecosystem, manifestPath);
  const results = [];

  const effectiveChecks = REQUESTED_CHECKS.filter(c => c !== 'maintainer' || ecosystem === 'npm');
  const skippedMaintainer = REQUESTED_CHECKS.includes('maintainer') && ecosystem !== 'npm';

  for (const pkgName of deps) {
    if (effectiveChecks.includes('maintainer')) results.push(await checkMaintainer(ecosystem, pkgName));
    if (effectiveChecks.includes('vulnerability')) results.push(await checkVulnerability(ecosystem, pkgName));
  }

  const issues = results.filter(r => r.suspicious);
  const errors = results.filter(r => r.error);

  console.log(`Presend dependency check (${ecosystem}) -- ${deps.length} package(s), ${results.length} check(s) run.`);
  if (skippedMaintainer) {
    console.log('(maintainer-change check skipped: npm only for now)');
  }
  if (issues.length === 0) {
    console.log('✅ No issues found.');
  } else {
    console.log(`⚠️  ${issues.length} issue(s) found:`);
    for (const issue of issues) {
      console.log(`  - ${issue.pkgName} [${issue.check}]`, JSON.stringify(issue.details));
    }
  }
  if (errors.length > 0) {
    console.log(`(${errors.length} check(s) could not complete: network/API errors, not counted as issues)`);
  }

  return { deps, results, issues, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(({ issues }) => {
    if (issues.length > 0 && FAIL_ON_ISSUE) {
      process.exit(1);
    }
    process.exit(0);
  }).catch((e) => {
    console.error('Fatal error:', e.message);
    process.exit(1);
  });
}
