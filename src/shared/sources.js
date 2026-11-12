// SPDX-License-Identifier: GPL-3.0-only
// Only filter data is downloaded. Executable code always ships in the package.
export const SOURCES = [
  { id: 'easylist', name: 'EasyList · anúncios', enabled: true, license: 'GPL-3.0-or-later / CC-BY-SA-3.0', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/thirdparties/easylist/easylist.txt' },
  { id: 'easyprivacy', name: 'EasyPrivacy · rastreamento', enabled: true, license: 'GPL-3.0-or-later / CC-BY-SA-3.0', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/thirdparties/easylist/easyprivacy.txt' },
  { id: 'ublock', name: 'uBlock filters', enabled: true, license: 'GPL-3.0', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt' },
  { id: 'privacy', name: 'uBlock · privacidade', enabled: true, license: 'GPL-3.0', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt' },
  { id: 'unbreak', name: 'uBlock · compatibilidade', enabled: true, license: 'GPL-3.0', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt' },
  { id: 'quick', name: 'uBlock · correções rápidas', enabled: true, license: 'GPL-3.0', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt' },
  { id: 'badware', name: 'uBlock · sites maliciosos', enabled: true, license: 'GPL-3.0', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt' },
  { id: 'portuguese', name: 'AdGuard · português (opcional)', enabled: false, license: 'GPL-3.0', url: 'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_17_Portuguese/filter.txt' },
  { id: 'hagezi', name: 'HaGeZi Multi PRO · domínios (opcional)', enabled: false, license: 'GPL-3.0', url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt' }
];
export const VERSION = '0.2.0';
export const LIMITS = { inputBytes: 16 * 1024 * 1024, lines: 450000, includes: 24, selectors: 60000, customBytes: 2 * 1024 * 1024, backupBytes: 6 * 1024 * 1024, logEntries: 2500, diagSeconds: 30, diagMaxSeconds: 300 };
