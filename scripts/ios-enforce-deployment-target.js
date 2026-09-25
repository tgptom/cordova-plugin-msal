#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const IOS_TARGET_FLOOR = 15.0;
const IOS_TARGET_FLOOR_STRING = '15.0';
const HELPER_NAME = 'cordova_plugin_msal_enforce_ios15_deployment_target';
const HELPER_MARKER_BEGIN = '# cordova-plugin-msal iOS 15 deployment target fix - begin';
const HELPER_MARKER_END = '# cordova-plugin-msal iOS 15 deployment target fix - end';
const HELPER_CALL_REGEX = /^\s+cordova_plugin_msal_enforce_ios15_deployment_target\([^)]+\)\s*$/m;

function parseNumericVersion(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const match = value.match(/\d+(?:\.\d+)?/);
    return match ? Number.parseFloat(match[0]) : null;
}

function ensurePodfileHookContent(content) {
    let output = content;
    let changed = false;

    const helperBlock = `${HELPER_MARKER_BEGIN}\ndef ${HELPER_NAME}(installer)\n  installer.pods_project.targets.each do |target|\n    target.build_configurations.each do |config|\n      deployment_target = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']\n      parsed_target = deployment_target.to_s[/\\d+(?:\\.\\d+)?/]\n\n      if parsed_target.nil? || parsed_target.to_f < ${IOS_TARGET_FLOOR_STRING}\n        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${IOS_TARGET_FLOOR_STRING}'\n      end\n    end\n  end\nend\n${HELPER_MARKER_END}\n\n`;

    const hasHelper = output.includes(HELPER_MARKER_BEGIN);
    const postInstallRegex = /(^|\n)(\s*)post_install\s+do\s+\|([^|]+)\|/;
    const hasPostInstall = postInstallRegex.test(output);

    if (!hasHelper) {
        if (hasPostInstall) {
            output = output.replace(postInstallRegex, `$1${helperBlock}$2post_install do |$3|`);
        } else {
            output = `${output.replace(/\s*$/, '')}\n\n${helperBlock}`;
        }
        changed = true;
    }

    if (!HELPER_CALL_REGEX.test(output)) {
        if (hasPostInstall || postInstallRegex.test(output)) {
            output = output.replace(
                postInstallRegex,
                (match, start, indentation, installerVarName) =>
                    `${start}${indentation}post_install do |${installerVarName}|\n${indentation}  ${HELPER_NAME}(${installerVarName.trim()})`
            );
        } else {
            output = `${output.replace(/\s*$/, '')}\npost_install do |installer|\n  ${HELPER_NAME}(installer)\nend\n`;
        }
        changed = true;
    }

    return {
        content: output,
        changed
    };
}

function ensurePodfileHook(podfilePath, logger = console) {
    if (!fs.existsSync(podfilePath)) {
        logger.log(`[cordova-plugin-msal] Podfile not found at ${podfilePath}; skipping.`);
        return false;
    }

    const current = fs.readFileSync(podfilePath, 'utf8');
    const result = ensurePodfileHookContent(current);

    if (result.changed) {
        fs.writeFileSync(podfilePath, result.content, 'utf8');
        logger.log('[cordova-plugin-msal] Added/updated Podfile iOS 15 post_install deployment target fix.');
        return true;
    }

    logger.log('[cordova-plugin-msal] Podfile already contains iOS 15 deployment target fix.');
    return false;
}

function bumpPodsProjectDeploymentTarget(pbxprojPath, logger = console) {
    if (!fs.existsSync(pbxprojPath)) {
        logger.log(`[cordova-plugin-msal] Pods project not found at ${pbxprojPath}; skipping.`);
        return false;
    }

    const current = fs.readFileSync(pbxprojPath, 'utf8');
    let changed = false;

    const updated = current.replace(
        /(IPHONEOS_DEPLOYMENT_TARGET\s*=\s*)("?)(\d+(?:\.\d+)?)("?)(\s*;)/g,
        (full, prefix, quoteStart, version, quoteEnd, suffix) => {
            const parsed = parseNumericVersion(version);
            if (parsed !== null && parsed < IOS_TARGET_FLOOR) {
                changed = true;
                return `${prefix}${quoteStart}${IOS_TARGET_FLOOR_STRING}${quoteEnd}${suffix}`;
            }

            return full;
        }
    );

    if (changed) {
        fs.writeFileSync(pbxprojPath, updated, 'utf8');
        logger.log('[cordova-plugin-msal] Raised Pods project IPHONEOS_DEPLOYMENT_TARGET values below 15.0.');
    } else {
        logger.log('[cordova-plugin-msal] Pods project already satisfies minimum iOS deployment target 15.0.');
    }

    return changed;
}

function run(context) {
    const projectRoot = context && context.opts && context.opts.projectRoot ? context.opts.projectRoot : process.cwd();
    const iosPlatformPath = path.join(projectRoot, 'platforms', 'ios');

    if (!fs.existsSync(iosPlatformPath)) {
        console.log('[cordova-plugin-msal] iOS platform not found; skipping iOS deployment target fix.');
        return;
    }

    const podfilePath = path.join(iosPlatformPath, 'Podfile');
    const podsProjectPath = path.join(iosPlatformPath, 'Pods', 'Pods.xcodeproj', 'project.pbxproj');

    ensurePodfileHook(podfilePath);
    bumpPodsProjectDeploymentTarget(podsProjectPath);
}

module.exports = function (context) {
    run(context);
};

module.exports.ensurePodfileHookContent = ensurePodfileHookContent;
module.exports.bumpPodsProjectDeploymentTarget = bumpPodsProjectDeploymentTarget;

if (require.main === module) {
    run();
}
