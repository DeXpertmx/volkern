const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to fix Android dependency conflicts.
 * 
 * Problem: Some transitive dependency pulls in the old pre-AndroidX
 * support-compat:28.0.0 which conflicts with androidx.core:core.
 * 
 * Fix: Exclude com.android.support from all Gradle configurations.
 */
module.exports = function withFixAndroidDependencies(config) {
  return withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;

    if (!buildGradle.includes('exclude group: "com.android.support"')) {
      config.modResults.contents = buildGradle.replace(
        /android\s*\{/,
        `configurations.all {
    exclude group: "com.android.support"
}

android {`
      );
    }

    return config;
  });
};
