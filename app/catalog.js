'use strict';

const REGIONS = [
  { id: 'US',     label: 'United States' },
  { id: 'CA',     label: 'Canada' },
  { id: 'UK',     label: 'United Kingdom' },
  { id: 'NORDIC', label: 'Nordic (SE / NO / DK / FI)' },
  { id: 'DE',     label: 'Germany / Austria / CH' },
  { id: 'EU',     label: 'Europe (other)' },
  { id: 'AU',     label: 'Australia / NZ' },
];

// Maps Samsung TV countryCode to our region IDs
const CC_TO_REGION = {
  US: 'US', MX: 'US',
  CA: 'CA',
  GB: 'UK', IE: 'UK',
  SE: 'NORDIC', NO: 'NORDIC', DK: 'NORDIC', FI: 'NORDIC', IS: 'NORDIC',
  DE: 'DE', AT: 'DE', CH: 'DE',
  FR: 'EU', NL: 'EU', BE: 'EU', ES: 'EU', IT: 'EU', PT: 'EU',
  PL: 'EU', CZ: 'EU', HU: 'EU', SK: 'EU', RO: 'EU', HR: 'EU',
  AU: 'AU', NZ: 'AU',
};

// available: [] = all regions; ['US', 'UK', ...] = specific regions only.
// appIds: region key overrides fall back to `default`.
// IDs marked (*) are best-guess — use Sync with TV to validate.
const APP_CATALOG = [

  // ── Global ──────────────────────────────────────────────────────────────────
  { id: 'youtube',    name: 'YouTube',      icon: '▶',  deepLink: true,  available: [],
    appIds: { default: '111299001912' } },
  { id: 'netflix',    name: 'Netflix',      icon: 'N',                   available: [],
    appIds: { default: '11101200001', UK: '3201907018807', NORDIC: '3201907018807', DE: '3201907018807', EU: '3201907018807', AU: '3201907018807' } },
  { id: 'prime',      name: 'Prime Video',  icon: '📦',                  available: [],
    appIds: { default: '3201910019365' } },
  { id: 'disney',     name: 'Disney+',      icon: '🏰',                  available: [],
    appIds: { default: '3201901017640' } },
  { id: 'appletv',    name: 'Apple TV+',    icon: '',                   available: [],
    appIds: { default: '3201807016597' } },
  { id: 'spotify',    name: 'Spotify',      icon: '🎵',                  available: [],
    appIds: { default: '3201606009684' } },
  { id: 'applemusic', name: 'Apple Music',  icon: '🎶',                  available: [],
    appIds: { default: '3201908019041' } },
  { id: 'plex',       name: 'Plex',         icon: '🎬',                  available: [],
    appIds: { default: '3201512006963' } },
  { id: 'twitch',     name: 'Twitch',       icon: '🎮',                  available: [],
    appIds: { default: '3202203026841' } },
  { id: 'crunchyroll',name: 'Crunchyroll',  icon: '🍥',                  available: [],
    appIds: { default: '3202302030097' } },
  { id: 'dazn',       name: 'DAZN',         icon: '🥊',
    available: ['UK', 'DE', 'EU', 'AU', 'CA', 'US'],
    appIds: { default: '3202103020674' } }, // *
  { id: 'discovery',  name: 'Discovery+',   icon: '🔍',
    available: ['US', 'UK', 'EU', 'NORDIC', 'AU', 'CA', 'DE'],
    appIds: { default: '3201803015944', US: '3202006021105' } },

  // ── United States ────────────────────────────────────────────────────────────
  { id: 'hulu',       name: 'Hulu',         icon: '🟢',  available: ['US'],
    appIds: { default: '3201601007625' } },
  { id: 'max',        name: 'Max',           icon: 'M',
    available: ['US', 'CA', 'EU', 'UK', 'NORDIC', 'AU', 'DE'],
    appIds: { default: '3202301029760' } },
  { id: 'peacock',    name: 'Peacock',       icon: '🦚',  available: ['US'],
    appIds: { default: '3202006020991' } },
  { id: 'paramount',  name: 'Paramount+',    icon: '⛰',
    available: ['US', 'CA', 'UK', 'AU', 'EU', 'DE'],
    appIds: { default: '3202110025305', US: '3201710014981' } },
  { id: 'tubi',       name: 'Tubi',          icon: '📺',  available: ['US', 'CA', 'AU'],
    appIds: { default: '3201504901843' } },
  { id: 'pluto',      name: 'Pluto TV',      icon: '🪐',
    available: ['US', 'CA', 'EU', 'UK', 'AU', 'DE'],
    appIds: { default: '3202008022518' } },
  { id: 'espn',       name: 'ESPN',          icon: '🏈',  available: ['US', 'CA'],
    appIds: { default: '3201601007724' } },
  { id: 'sling',      name: 'Sling TV',      icon: '📡',  available: ['US'],
    appIds: { default: '3201612011235' } }, // *
  { id: 'fubo',       name: 'FuboTV',        icon: '⚽',  available: ['US', 'CA', 'EU'],
    appIds: { default: '3202007014344' } }, // *
  { id: 'starz',      name: 'Starz',         icon: '⭐',  available: ['US', 'CA'],
    appIds: { default: '3201608010135' } }, // *
  { id: 'shudder',    name: 'Shudder',       icon: '👻',  available: ['US', 'CA', 'UK', 'AU'],
    appIds: { default: '3201907018494' } }, // *

  // ── Canada ───────────────────────────────────────────────────────────────────
  { id: 'crave',      name: 'Crave',         icon: '🍿',  available: ['CA'],
    appIds: { default: '3201506003488' } },
  { id: 'cbcgem',     name: 'CBC Gem',       icon: '💎',  available: ['CA'],
    appIds: { default: '3202205027481' } },

  // ── United Kingdom ────────────────────────────────────────────────────────────
  { id: 'bbc',        name: 'BBC iPlayer',   icon: '🟠',  available: ['UK'],
    appIds: { default: '3201601007670' } },
  { id: 'itvx',       name: 'ITVX',          icon: '🔴',  available: ['UK'],
    appIds: { default: '3201604007382' } }, // *
  { id: 'channel4',   name: 'Channel 4',     icon: '4️⃣', available: ['UK'],
    appIds: { default: '111299002148' } },
  { id: 'channel5',   name: 'My5',           icon: '5️⃣', available: ['UK'],
    appIds: { default: '3201505006690' } }, // *
  { id: 'britbox',    name: 'BritBox',       icon: '🇬🇧', available: ['UK', 'US', 'CA', 'AU'],
    appIds: { default: '3201905018484' } },
  { id: 'nowtv',      name: 'Now',           icon: '🌊',  available: ['UK', 'IE'],
    appIds: { default: '3201602007414' } }, // *

  // ── Nordic ────────────────────────────────────────────────────────────────────
  { id: 'viaplay',    name: 'Viaplay',       icon: 'V',   available: ['NORDIC', 'EU', 'UK'],
    appIds: { default: '11111300404' } },
  { id: 'svtplay',    name: 'SVT Play',      icon: '🏛',  available: ['NORDIC'],
    appIds: { default: '3201612011287' } },
  { id: 'tv4play',    name: 'TV4 Play',      icon: '4️⃣', available: ['NORDIC'],
    appIds: { default: '3202306031514' } },
  { id: 'cmore',      name: 'C More',        icon: '🎬',  available: ['NORDIC'],
    appIds: { default: '3201705012147' } }, // *
  { id: 'nrk',        name: 'NRK TV',        icon: '🎙',  available: ['NORDIC'],
    appIds: { default: '3202012022410' } },
  { id: 'tv2play',    name: 'TV 2 Play',     icon: '2️⃣', available: ['NORDIC'],
    appIds: { default: '111399002181' } },  // NO
  { id: 'tv2play_dk', name: 'TV 2 PLAY',    icon: '2️⃣', available: ['NORDIC'],
    appIds: { default: '3202204027042' } }, // DK
  { id: 'drtv',       name: 'DR TV',         icon: '🎭',  available: ['NORDIC'],
    appIds: { default: '3201803015892' } }, // * DK
  { id: 'yle',        name: 'Yle Areena',    icon: '🎙',  available: ['NORDIC'],
    appIds: { default: '3202104023586' } },

  // ── Germany / Austria / Switzerland ──────────────────────────────────────────
  { id: 'ardmed',     name: 'ARD Mediathek', icon: '🎭',  available: ['DE', 'EU'],
    appIds: { default: '3201412000679' } },
  { id: 'zdfmed',     name: 'ZDF Mediathek', icon: '🎭',  available: ['DE', 'EU'],
    appIds: { default: '3201808016446' } }, // *
  { id: 'rtlplus',    name: 'RTL+',          icon: '📺',  available: ['DE', 'EU'],
    appIds: { default: '3202105021481' } }, // *
  { id: 'joyn',       name: 'Joyn',          icon: '🎬',  available: ['DE'],
    appIds: { default: '3202009013322' } }, // *

  // ── France ────────────────────────────────────────────────────────────────────
  { id: 'tf1plus',    name: 'TF1+',          icon: '1️⃣', available: ['EU'],
    appIds: { default: '3201605007791' } }, // *
  { id: 'francetv',   name: 'france.tv',     icon: '🇫🇷', available: ['EU'],
    appIds: { default: '3201701012477' } }, // *

  // ── Australia / New Zealand ───────────────────────────────────────────────────
  { id: 'stan',       name: 'Stan',          icon: '🌀',  available: ['AU'],
    appIds: { default: '3201606009219' } }, // *
  { id: 'ninenow',    name: '9Now',          icon: '9️⃣', available: ['AU'],
    appIds: { default: '3201607010031' } },
  { id: 'tenplay',    name: '10 Play',       icon: '🔟',  available: ['AU'],
    appIds: { default: '3201901017453' } }, // *
  { id: 'sevenplus',  name: '7plus',         icon: '7️⃣', available: ['AU'],
    appIds: { default: '3202011016010' } }, // *
  { id: 'abciview',   name: 'ABC iview',     icon: '📻',  available: ['AU'],
    appIds: { default: '3201812017479' } },
  { id: 'binge',      name: 'BINGE',         icon: '🎬',  available: ['AU'],
    appIds: { default: '3202010022098' } },
];

// Ordered default selection per region
const REGION_DEFAULTS = {
  US:     ['youtube', 'netflix', 'prime', 'disney', 'appletv', 'max', 'hulu', 'peacock',
           'paramount', 'espn', 'tubi', 'pluto', 'spotify', 'crunchyroll'],
  CA:     ['youtube', 'netflix', 'prime', 'disney', 'appletv', 'max', 'crave', 'cbcgem',
           'tubi', 'paramount', 'spotify', 'crunchyroll'],
  UK:     ['youtube', 'netflix', 'prime', 'disney', 'appletv', 'bbc', 'itvx', 'channel4',
           'channel5', 'nowtv', 'peacock', 'paramount', 'spotify', 'crunchyroll'],
  NORDIC: ['youtube', 'netflix', 'prime', 'disney', 'appletv', 'viaplay', 'svtplay',
           'tv4play', 'nrk', 'tv2play', 'tv2play_dk', 'drtv', 'yle', 'max', 'spotify', 'crunchyroll'],
  DE:     ['youtube', 'netflix', 'prime', 'disney', 'appletv', 'ardmed', 'zdfmed',
           'rtlplus', 'joyn', 'max', 'paramount', 'spotify', 'dazn'],
  EU:     ['youtube', 'netflix', 'prime', 'disney', 'appletv', 'max', 'paramount',
           'pluto', 'viaplay', 'spotify', 'crunchyroll'],
  AU:     ['youtube', 'netflix', 'prime', 'disney', 'appletv', 'stan', 'binge', 'ninenow',
           'tenplay', 'sevenplus', 'abciview', 'paramount', 'tubi', 'spotify'],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APP_CATALOG, REGIONS, CC_TO_REGION, REGION_DEFAULTS };
}
