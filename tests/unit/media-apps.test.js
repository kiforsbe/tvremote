/** @jest-environment jsdom */

const {
  MEDIA_APPS_CATALOG,
  loadMediaApps,
  saveMediaApps,
  parseYouTubeVideoId,
  reorderApp,
  moveApp,
} = require('../../app/remote.js');

describe('MEDIA_APPS_CATALOG', () => {
  test('contains at least 14 apps', () => {
    expect(MEDIA_APPS_CATALOG.length).toBeGreaterThanOrEqual(14);
  });

  test('youtube entry has deepLink true and correct appId', () => {
    const yt = MEDIA_APPS_CATALOG.find(a => a.id === 'youtube');
    expect(yt).toBeDefined();
    expect(yt.deepLink).toBe(true);
    expect(yt.appIds.default).toBe('111299001912');
  });

  test('every entry has required string/boolean fields', () => {
    for (const app of MEDIA_APPS_CATALOG) {
      expect(typeof app.id).toBe('string');
      expect(typeof app.name).toBe('string');
      expect(typeof app.icon).toBe('string');
      expect(typeof app.appIds.default).toBe('string');
      expect(app.deepLink == null || typeof app.deepLink === 'boolean').toBe(true);
    }
  });
});

describe('loadMediaApps', () => {
  beforeEach(() => localStorage.clear());

  test('returns US region defaults when localStorage is empty', () => {
    const apps = loadMediaApps();
    expect(apps).toHaveLength(14);
    expect(apps[0].id).toBe('youtube');
    expect(apps[1].id).toBe('netflix');
    expect(apps[2].id).toBe('prime');
  });

  test('returns saved apps when localStorage has data', () => {
    const saved = [MEDIA_APPS_CATALOG[0]];
    localStorage.setItem('mediaApps', JSON.stringify(saved));
    expect(loadMediaApps()).toEqual(saved);
  });

  test('falls back to defaults on invalid JSON', () => {
    localStorage.setItem('mediaApps', 'not-json{{{');
    expect(loadMediaApps()).toHaveLength(14);
  });
});

describe('saveMediaApps', () => {
  beforeEach(() => localStorage.clear());

  test('persists apps to localStorage as JSON', () => {
    const apps = [MEDIA_APPS_CATALOG[0]];
    saveMediaApps(apps);
    expect(JSON.parse(localStorage.getItem('mediaApps'))).toEqual(apps);
  });
});

describe('parseYouTubeVideoId', () => {
  test('parses watch URL', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('parses short URL', () => {
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('parses shorts URL', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('accepts raw 11-char video ID', () => {
    expect(parseYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('returns null for non-YouTube URL', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/123')).toBeNull();
  });

  test('returns null for short string that is not 11 chars', () => {
    expect(parseYouTubeVideoId('abc')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseYouTubeVideoId('')).toBeNull();
  });
});

describe('reorderApp', () => {
  const apps = [
    { id: 'a', name: 'A', icon: '', appId: '1', deepLink: false },
    { id: 'b', name: 'B', icon: '', appId: '2', deepLink: false },
    { id: 'c', name: 'C', icon: '', appId: '3', deepLink: false },
  ];

  test('moves item up', () => {
    expect(reorderApp(apps, 'b', 'up').map(a => a.id)).toEqual(['b', 'a', 'c']);
  });

  test('moves item down', () => {
    expect(reorderApp(apps, 'b', 'down').map(a => a.id)).toEqual(['a', 'c', 'b']);
  });

  test('no-ops when moving first item up', () => {
    expect(reorderApp(apps, 'a', 'up').map(a => a.id)).toEqual(['a', 'b', 'c']);
  });

  test('no-ops when moving last item down', () => {
    expect(reorderApp(apps, 'c', 'down').map(a => a.id)).toEqual(['a', 'b', 'c']);
  });

  test('returns new array (does not mutate original)', () => {
    const result = reorderApp(apps, 'b', 'up');
    expect(result).not.toBe(apps);
    expect(apps[0].id).toBe('a');
  });

  test('returns copy unchanged for unknown id', () => {
    expect(reorderApp(apps, 'z', 'up').map(a => a.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('moveApp', () => {
  const apps = (ids) => ids.map(id => ({ id, name: id, icon: '', appId: 'x', deepLink: false }));

  test('moves item from index 0 to index 2 (inserts before index 2)', () => {
    expect(moveApp(apps(['a','b','c']), 0, 2).map(a => a.id)).toEqual(['b','a','c']);
  });

  test('moves item from index 2 to index 1 (inserts before index 1)', () => {
    expect(moveApp(apps(['a','b','c']), 2, 1).map(a => a.id)).toEqual(['a','c','b']);
  });

  test('moves item to beginning (toIdx 0)', () => {
    expect(moveApp(apps(['a','b','c']), 2, 0).map(a => a.id)).toEqual(['c','a','b']);
  });

  test('moves item to end (toIdx length)', () => {
    expect(moveApp(apps(['a','b','c']), 0, 3).map(a => a.id)).toEqual(['b','c','a']);
  });

  test('no-op when fromIdx === toIdx', () => {
    expect(moveApp(apps(['a','b','c']), 1, 1).map(a => a.id)).toEqual(['a','b','c']);
  });

  test('no-op when fromIdx + 1 === toIdx (inserting after itself)', () => {
    expect(moveApp(apps(['a','b','c']), 1, 2).map(a => a.id)).toEqual(['a','b','c']);
  });

  test('does not mutate original array', () => {
    const original = apps(['a','b','c']);
    const result = moveApp(original, 0, 2);
    expect(result).not.toBe(original);
    expect(original.map(a => a.id)).toEqual(['a','b','c']);
  });
});
