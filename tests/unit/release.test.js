// tests/unit/release.test.js
const {
  bumpVersion, unreleasedBody, hasEntries, rollChangelog, releaseNotes, setPackageVersion, setLockVersion,
} = require('../../scripts/release.js');

const REPO = 'https://github.com/x/y';
const BASE = `# Changelog

## [Unreleased]

### Added
- New thing.

## [1.0.0] - 2026-01-01

### Added
- First.

[Unreleased]: ${REPO}/compare/v1.0.0...HEAD
[1.0.0]: ${REPO}/releases/tag/v1.0.0
`;

describe('bumpVersion', () => {
  test('patch/minor/major', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });
  test('explicit version passes through; garbage throws', () => {
    expect(bumpVersion('1.2.3', '4.5.6')).toBe('4.5.6');
    expect(() => bumpVersion('1.2.3', 'banana')).toThrow();
  });
});

describe('changelog helpers', () => {
  test('hasEntries ignores headings and comments', () => {
    expect(hasEntries('\n### Added\n\n<!-- - hidden -->\n')).toBe(false);
    expect(hasEntries('\n### Added\n- Real\n')).toBe(true);
  });

  test('unreleasedBody stops at the next version heading', () => {
    const body = unreleasedBody(BASE);
    expect(body).toContain('New thing');
    expect(body).not.toContain('First');
  });

  test('rollChangelog dates the section, adds empty Unreleased and fixes links', () => {
    const out = rollChangelog(BASE, '1.1.0', '2026-02-02', REPO);
    expect(out).toMatch(/## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-02-02\n\n### Added\n- New thing\./);
    expect(out).toContain(`[Unreleased]: ${REPO}/compare/v1.1.0...HEAD`);
    expect(out).toContain(`[1.1.0]: ${REPO}/compare/v1.0.0...v1.1.0`);
    expect(out).toContain(`[1.0.0]: ${REPO}/releases/tag/v1.0.0`);
    expect(out.match(/^\[Unreleased\]:/gm)).toHaveLength(1);
  });

  test('rollChangelog refuses an empty Unreleased or a duplicate version', () => {
    const empty = BASE.replace('- New thing.\n', '');
    expect(() => rollChangelog(empty, '1.1.0', '2026-02-02', REPO)).toThrow(/no entries/);
    expect(() => rollChangelog(BASE, '1.0.0', '2026-02-02', REPO)).toThrow(/already has/);
  });

  test('first release has no compare link', () => {
    const first = '# Changelog\n\n## [Unreleased]\n\n- Everything.\n';
    const out = rollChangelog(first, '1.0.0', '2026-02-02', REPO);
    expect(out).toContain(`[1.0.0]: ${REPO}/releases/tag/v1.0.0`);
    expect(out).toContain(`[Unreleased]: ${REPO}/compare/v1.0.0...HEAD`);
  });
});

describe('version files', () => {
  test('setPackageVersion only changes the version', () => {
    const pkg = '{\n  "name": "a",\n  "version": "1.0.0",\n  "x": 1\n}\n';
    expect(setPackageVersion(pkg, '1.1.0')).toBe('{\n  "name": "a",\n  "version": "1.1.0",\n  "x": 1\n}\n');
  });
  test('setLockVersion updates both root version fields', () => {
    const lock = JSON.stringify({ name: 'a', version: '1.0.0', packages: { '': { version: '1.0.0' } } }, null, 2);
    const out = JSON.parse(setLockVersion(lock, '2.0.0'));
    expect(out.version).toBe('2.0.0');
    expect(out.packages[''].version).toBe('2.0.0');
  });
});

describe('releaseNotes', () => {
  test('returns only the requested version body', () => {
    expect(releaseNotes(BASE, '1.0.0')).toBe('### Added\n- First.\n');
  });
  test('throws for a missing or empty section', () => {
    expect(() => releaseNotes(BASE, '9.9.9')).toThrow(/no section/);
    expect(() => releaseNotes('## [1.0.0] - x\n\n## [0.9.0] - y\n- a\n', '1.0.0')).toThrow(/no entries/);
  });
});
