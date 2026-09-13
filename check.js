#!/usr/bin/env node
// Lit package.json, vérifie chaque dépendance npm contre l'API Presend
// (maintainer-change-check + vulnerability-check), résume les résultats,
// et sort avec un code d'erreur si quelque chose de suspect est trouvé
// (sauf si fail-on-issue=false).

import { readFileSync } from 'fs';

const API_BASE = process.env.PRESEND_API_BASE || 'https://presend.pages.dev/api';
const PACKAGE_JSON_PATH = process.env.PACKAGE_JSON_PATH || 'package.json';
const FAIL_ON_ISSUE = (process.env.FAIL_ON_ISSUE || 'true') !== 'false';
const CHECKS = (process.env.CHECKS || 'maintainer,vulnerability').split(',').map(s => s.trim());

function readDependencies(path) {
  const pkg = JSON.parse(readFileSync(path, 'utf-8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return Object.keys(deps);
}

async function checkMaintainer(pkgName) {
  const url = `${API_BASE}/maintainer-change-check?ecosystem=npm&package=${encodeURIComponent(pkgName)}`;
  const res = await fetch(url);
  if (!res.ok) return { pkgName, check: 'maintainer', error: `HTTP ${res.status}` };
  const data = await res.json();
  return { pkgName, check: 'maintainer', suspicious: !!data.suspicious, details: data.flagged_events };
}

async function checkVulnerability(pkgName) {
  const url = `${API_BASE}/vulnerability-check?ecosystem=npm&package=${encodeURIComponent(pkgName)}`;
  const res = await fetch(url);
  if (!res.ok) return { pkgName, check: 'vulnerability', error: `HTTP ${res.status}` };
  const data = await res.json();
  const count = (data.vulnerabilities || []).length;
  return { pkgName, check: 'vulnerability', suspicious: count > 0, count, details: data.vulnerabilities };
}

export async function run(packageJsonPath = PACKAGE_JSON_PATH) {
  const deps = readDependencies(packageJsonPath);
  const results = [];

  for (const pkgName of deps) {
    if (CHECKS.includes('maintainer')) results.push(await checkMaintainer(pkgName));
    if (CHECKS.includes('vulnerability')) results.push(await checkVulnerability(pkgName));
  }

  const issues = results.filter(r => r.suspicious);
  const errors = results.filter(r => r.error);

  console.log(`Presend dependency check -- ${deps.length} package(s), ${results.length} check(s) run.`);
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
