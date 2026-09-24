const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pluginXml = fs.readFileSync(path.join(root, 'plugin.xml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildExtras = fs.readFileSync(path.join(root, 'src/android/build-extras.gradle'), 'utf8');
const appDelegateCallback = fs.readFileSync(path.join(root, 'src/ios/AppDelegate+MsalCallback.m'), 'utf8');
const iosWrapper = fs.readFileSync(path.join(root, 'src/ios/MsalPlugin.m'), 'utf8');
const typeDecls = fs.readFileSync(path.join(root, 'index.d.ts'), 'utf8');

function getMatch(source, regex, label) {
  const match = source.match(regex);
  assert.ok(match, `Expected ${label}`);
  return match[1];
}

test('package/plugin versions and Cordova engine metadata stay synchronized', () => {
  const pluginVersion = getMatch(pluginXml, /<plugin[\s\S]*?version="([^"]+)"/, 'plugin version');
  assert.equal(packageJson.version, pluginVersion);

  const pluginAndroidEngine = getMatch(pluginXml, /<engine name="cordova-android" version="([^"]+)"\/>/, 'plugin cordova-android engine');
  const pluginIosEngine = getMatch(pluginXml, /<engine name="cordova-ios" version="([^"]+)"\/>/, 'plugin cordova-ios engine');

  const packageCordovaDeps = packageJson.engines.cordovaDependencies[packageJson.version];
  assert.equal(packageCordovaDeps['cordova-android'], pluginAndroidEngine);
  assert.equal(packageCordovaDeps['cordova-ios'], pluginIosEngine);
});

test('native dependency pins are exact expected versions', () => {
  const androidMsal = getMatch(pluginXml, /<framework src="com\.microsoft\.identity\.client:msal:([^"]+)" \/>/, 'Android MSAL dependency');
  assert.equal(androidMsal, '8.5.0');

  const iosMsal = getMatch(pluginXml, /<pod name="MSAL" spec="([^"]+)" \/>/, 'iOS MSAL pod spec');
  assert.equal(iosMsal, '= 2.16.0');
});

test('android compile sdk policy is enforced without target sdk override', () => {
  assert.match(buildExtras, /ext\.cdvCompileSdkVersion\s*=\s*36/);
  assert.doesNotMatch(buildExtras, /cdvTargetSdkVersion/);

  assert.match(
    buildExtras,
    /pkgs\.dev\.azure\.com\/MicrosoftDeviceSDK\/DuoSDK-Public\/[_A-Za-z0-9\-\/]+/,
    'Expected Duo SDK Maven repository to remain configured for transitive dependencies'
  );
});

test('javascript bridge API remains stable and typed surface still declares key calls', () => {
  const bridge = require(path.join(root, 'www/msalplugin.js'));
  const methods = ['msalInit', 'startLogger', 'getAccounts', 'signInSilent', 'signInInteractive', 'signOut'];

  for (const method of methods) {
    assert.equal(typeof bridge[method], 'function', `Missing bridge function ${method}`);
    assert.match(typeDecls, new RegExp(`\\b${method}\\s*\\(`), `Missing TypeScript declaration for ${method}`);
  }
});

test('ios URL callback and native callback completion contracts remain in place', () => {
  assert.match(appDelegateCallback, /handleMSALResponse:url/);
  assert.match(appDelegateCallback, /sourceApplication:options\[UIApplicationOpenURLOptionsSourceApplicationKey\]/);

  assert.match(iosWrapper, /signInSilent:[\s\S]*acquireTokenSilentWithParameters:[\s\S]*completionBlock:/);
  assert.match(
    iosWrapper,
    /completionBlock:\^\(MSALResult \*result, NSError \*error\) \{[\s\S]*?if \(!error\)[\s\S]*?else[\s\S]*?sendPluginResult:[\s\S]*?callbackId:command\.callbackId[\s\S]*?\}/,
    'Expected signInSilent completion block to always resolve callback on error'
  );
});
