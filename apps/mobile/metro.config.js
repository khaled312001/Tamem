// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root so shared packages refresh automatically
config.watchFolders = [monorepoRoot];

// Block paths that crash Metro's FallbackWatcher on Windows long paths.
// The WhatsApp Web (wppconnect) cache writes deeply-nested chrome profile
// folders under apps/backend/tokens/ that Metro can't `lstat` — and any
// lstat error in the watcher crashes the whole bundler.
const blockedPatterns = [
  /\/apps\/backend\/tokens\//,
  /\/apps\/backend\/dist\//,
  /\/apps\/backend\/uploads\//,
  /\\apps\\backend\\tokens\\/,
  /\\apps\\backend\\dist\\/,
  /\\apps\\backend\\uploads\\/,
];
config.resolver.blockList = blockedPatterns;
config.watcher = {
  ...(config.watcher ?? {}),
  additionalExts: config.watcher?.additionalExts ?? [],
  watchman: { deferStates: ['hg.update'] },
  unstable_autoSaveCache: { enabled: false },
  healthCheck: {
    enabled: false,
  },
};

// Resolve node_modules from both the app and the workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Force Metro to pick the first node_modules instance it finds for each package
config.resolver.disableHierarchicalLookup = true;

// Strip the `.js` suffix when @tamem/* packages import sibling modules with the ESM
// extension (`./foo.js`) — Metro should resolve to the TypeScript source instead.
const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Only intervene for relative imports ending in `.js`
  if ((moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js')) {
    const candidates = [moduleName.replace(/\.js$/, '.ts'), moduleName.replace(/\.js$/, '.tsx')];
    for (const candidate of candidates) {
      try {
        const resolved = (originalResolver ?? context.resolveRequest)(context, candidate, platform);
        return resolved;
      } catch {
        // fall through to next candidate
      }
    }
  }
  return (originalResolver ?? context.resolveRequest)(context, moduleName, platform);
};

// Keep this last so `fs` reference doesn't get tree-shaken / linted out
void fs;

module.exports = config;
