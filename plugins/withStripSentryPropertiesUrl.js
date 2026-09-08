const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function stripDefaultsUrl(projectRoot, platform) {
  const file = path.join(projectRoot, platform, 'sentry.properties');
  if (!fs.existsSync(file)) {
    return;
  }
  const next = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('defaults.url='))
    .join('\n');
  fs.writeFileSync(file, next);
}

function withStripSentryPropertiesUrl(config) {
  for (const platform of ['ios', 'android']) {
    config = withDangerousMod(config, [
      platform,
      (mod) => {
        stripDefaultsUrl(mod.modRequest.projectRoot, platform);
        return mod;
      },
    ]);
  }
  return config;
}

module.exports = withStripSentryPropertiesUrl;
