#!/usr/bin/env node
// Cut a release: bump the version, roll CHANGELOG.md's [Unreleased] section into
// a dated version section, commit, and tag. Never pushes.
//
//   npm run release -- patch|minor|major|<x.y.z> [--dry-run] [--allow-dirty]
//
// See AGENTS.md ("Releases") for the full process.

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

function bumpVersion(current, bump) {
  if (SEMVER.test(bump)) return bump;
  const m = SEMVER.test(current) && current.split('.').map(Number);
  if (!m) throw new Error(`Current version "${current}" is not x.y.z`);
  const [maj, min, pat] = m;
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  if (bump === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Unknown bump "${bump}" — use patch, minor, major or x.y.z`);
}

const UNRELEASED_RE = /^## \[Unreleased\][^\n]*\n/m;

// Returns the body text under "## [Unreleased]" (up to the next "## [" heading).
function unreleasedBody(changelog) {
  const m = UNRELEASED_RE.exec(changelog);
  if (!m) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  const rest = changelog.slice(m.index + m[0].length);
  const next = rest.search(/^## \[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function hasEntries(body) {
  return /^\s*[-*] \S/m.test(body.replace(/<!--[\s\S]*?-->/g, ''));
}

// Rolls [Unreleased] into "## [version] - date", adds a fresh empty [Unreleased],
// and regenerates the compare links at the bottom of the file.
function rollChangelog(changelog, version, date, repoUrl) {
  if (!hasEntries(unreleasedBody(changelog))) {
    throw new Error('[Unreleased] in CHANGELOG.md has no entries — nothing to release');
  }
  if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`);
  }
  let out = changelog.replace(UNRELEASED_RE, `## [Unreleased]\n\n## [${version}] - ${date}\n`);
  return withLinks(out, repoUrl);
}

function withLinks(changelog, repoUrl) {
  const body = changelog.replace(/\n*(^\[[^\]]+\]: .*\n?)+\s*$/m, '\n').replace(/\s+$/, '\n');
  const versions = [...body.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(m => m[1]);
  const links = [];
  links.push(versions.length
    ? `[Unreleased]: ${repoUrl}/compare/v${versions[0]}...HEAD`
    : `[Unreleased]: ${repoUrl}/commits/main`);
  versions.forEach((v, i) => {
    links.push(i + 1 < versions.length
      ? `[${v}]: ${repoUrl}/compare/v${versions[i + 1]}...v${v}`
      : `[${v}]: ${repoUrl}/releases/tag/v${v}`);
  });
  return body + '\n' + links.join('\n') + '\n';
}

function setPackageVersion(pkgText, version) {
  return pkgText.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
}

function setLockVersion(lockText, version) {
  const lock = JSON.parse(lockText);
  lock.version = version;
  if (lock.packages && lock.packages['']) lock.packages[''].version = version;
  return JSON.stringify(lock, null, 2) + '\n';
}

// ── Script ───────────────────────────────────────────────────────────────────

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function main(argv) {
  const flags  = argv.filter(a => a.startsWith('--'));
  const bump   = argv.find(a => !a.startsWith('--'));
  const dryRun = flags.includes('--dry-run');
  if (!bump) throw new Error('Usage: npm run release -- patch|minor|major|<x.y.z> [--dry-run] [--allow-dirty]');

  const pkgPath  = path.join(ROOT, 'package.json');
  const lockPath = path.join(ROOT, 'package-lock.json');
  const clPath   = path.join(ROOT, 'CHANGELOG.md');
  const pkgText  = fs.readFileSync(pkgPath, 'utf8');
  const pkg      = JSON.parse(pkgText);
  const repoUrl  = pkg.repository.url.replace(/\.git$/, '');
  const version  = bumpVersion(pkg.version, bump);
  const tag      = `v${version}`;
  const date     = new Date().toISOString().slice(0, 10);

  if (!dryRun) {
    if (!flags.includes('--allow-dirty') && git('status', '--porcelain')) {
      throw new Error('Working tree is not clean — commit or stash first (or pass --allow-dirty)');
    }
    if (git('tag', '--list', tag)) throw new Error(`Tag ${tag} already exists`);
  }

  const changelog = rollChangelog(fs.readFileSync(clPath, 'utf8'), version, date, repoUrl);

  console.log(`Releasing ${pkg.version} -> ${version} (${tag}, ${date})${dryRun ? ' [dry run]' : ''}`);
  if (dryRun) {
    console.log('Would update package.json, package-lock.json, CHANGELOG.md; commit and tag.');
    return;
  }

  fs.writeFileSync(pkgPath,  setPackageVersion(pkgText, version));
  fs.writeFileSync(lockPath, setLockVersion(fs.readFileSync(lockPath, 'utf8'), version));
  fs.writeFileSync(clPath,   changelog);

  git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md');
  git('commit', '-m', `chore(release): ${tag}`);
  git('tag', '-a', tag, '-m', `Release ${tag}`);

  console.log(`\nCommitted and tagged ${tag}. Nothing has been pushed. Next:`);
  console.log(`  git push origin main ${tag}`);
  console.log(`  gh workflow run release.yml -f tag=${tag}   # builds the installers; draft by default`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(`release: ${e.message}`); process.exit(1); }
}

module.exports = { bumpVersion, unreleasedBody, hasEntries, rollChangelog, withLinks, setPackageVersion, setLockVersion };
