module.exports = ({ config }) => {
  const profile = process.env.DRIVESENTRY_BUILD_PROFILE || 'release';
  if (profile !== 'release' && profile !== 'academic-testing') {
    throw Error('Unknown DriveSentry build profile: ' + profile);
  }
  const academic = profile === 'academic-testing';
  const requestedRevision = process.env.DRIVESENTRY_BUILD_REVISION;
  const revision = /^[a-f0-9]{7,40}$/.test(requestedRevision || '') ? requestedRevision : 'local';
  return {
    ...config,
    name: academic ? 'DriveSentry V3' : config.name,
    version: '3.0.0',
    android: {
      ...config.android,
      package: academic ? 'com.drivesentry.testing' : 'com.drivesentry.app',
      versionCode: 3,
    },
    extra: { ...config.extra, buildProfile: profile, buildRevision: revision, androidBuild: 3 },
    plugins: config.plugins.map(plugin => plugin === 'expo-build-properties' && academic
      ? ['expo-build-properties', { android: {
        enableMinifyInReleaseBuilds: false,
        enableShrinkResourcesInReleaseBuilds: false,
      } }]
      : plugin),
  };
};
