/**
 * app.json stays the one place for the app's settings; this only adds to it. A build made for the automated tests
 * (OVERLAP_TEST_BUILD=1) talks to a website on the same computer over plain http, which Android blocks in release
 * builds unless told otherwise. A normal build never sets that switch, so it never allows plain http.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(process.env.OVERLAP_TEST_BUILD === '1' ? [['expo-build-properties', { android: { usesCleartextTraffic: true } }]] : []),
  ],
});
