'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    ensurePodfileHookContent,
    bumpPodsProjectDeploymentTarget
} = require('../ios-enforce-deployment-target');

function testAddsHelperAndPostInstallWhenMissing() {
    const input = "platform :ios, '14.0'\nuse_frameworks!\n";
    const output = ensurePodfileHookContent(input).content;

    assert.ok(output.includes('def cordova_plugin_msal_enforce_ios15_deployment_target(installer)'));
    assert.ok(output.includes('post_install do |installer|'));
    assert.ok(output.includes('cordova_plugin_msal_enforce_ios15_deployment_target(installer)'));
}

function testPreservesExistingPostInstallAndComposes() {
    const input = [
        "platform :ios, '14.0'",
        'post_install do |installer|',
        '  puts \"existing hook\"',
        'end',
        ''
    ].join('\n');

    const output = ensurePodfileHookContent(input).content;

    assert.ok(output.includes('puts "existing hook"'));
    assert.ok(output.includes('cordova_plugin_msal_enforce_ios15_deployment_target(installer)'));
}

function testPreservesCustomPostInstallVariableName() {
    const input = [
        "platform :ios, '14.0'",
        'post_install do |postInstaller|',
        "  puts 'custom installer variable'",
        'end',
        ''
    ].join('\n');

    const output = ensurePodfileHookContent(input).content;

    assert.ok(output.includes('post_install do |postInstaller|'));
    assert.ok(output.includes('cordova_plugin_msal_enforce_ios15_deployment_target(postInstaller)'));
}

function testPodfilePatchIsIdempotent() {
    const input = "platform :ios, '14.0'\n";
    const once = ensurePodfileHookContent(input).content;
    const twice = ensurePodfileHookContent(once).content;

    assert.strictEqual(once, twice);
}

function testPodsProjectBumpOnlyBelowFloor() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cordova-plugin-msal-test-'));
    const pbxprojPath = path.join(tempDir, 'project.pbxproj');
    const input = [
        'IPHONEOS_DEPLOYMENT_TARGET = 14.0;',
        'IPHONEOS_DEPLOYMENT_TARGET = 15.0;',
        'IPHONEOS_DEPLOYMENT_TARGET = 16.2;',
        ''
    ].join('\n');

    fs.writeFileSync(pbxprojPath, input, 'utf8');
    const changed = bumpPodsProjectDeploymentTarget(pbxprojPath, { log: () => {} });
    const output = fs.readFileSync(pbxprojPath, 'utf8');

    assert.strictEqual(changed, true);
    assert.ok(output.includes('IPHONEOS_DEPLOYMENT_TARGET = 15.0;'));
    assert.ok(!output.includes('IPHONEOS_DEPLOYMENT_TARGET = 14.0;'));
    assert.ok(output.includes('IPHONEOS_DEPLOYMENT_TARGET = 16.2;'));
}

function run() {
    testAddsHelperAndPostInstallWhenMissing();
    testPreservesExistingPostInstallAndComposes();
    testPreservesCustomPostInstallVariableName();
    testPodfilePatchIsIdempotent();
    testPodsProjectBumpOnlyBelowFloor();
    // eslint-disable-next-line no-console
    console.log('All ios-enforce-deployment-target tests passed.');
}

run();
