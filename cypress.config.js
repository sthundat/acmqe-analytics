const { defineConfig } = require('cypress');
const { execSync } = require('child_process');
const fs = require('fs');
const env = JSON.parse(fs.readFileSync('cypress.env.json', 'utf8'));
const OC_USERNAME = env.USERNAME;
const OC_PASSWORD = env.PASSWORD;
const OC_SERVER_URL = env.OC_SERVER_URL;

module.exports = defineConfig({
  chromeWebSecurity: false,
  numTestsKeptInMemory: 1,
  defaultCommandTimeout: 10000,
  pageLoadTimeout: 180000,
  videoCompression: false,
  watchForFileChanges: true,
  reporter: 'cypress-multi-reporters',
  reporterOptions: {
    reporterEnabled: 'mochawesome, mocha-junit-reporter',
    mochawesomeReporterOptions: {
      reportDir: 'test-output/cypress/json',
      reportFilename: 'mochawesome-report.json',
      overwrite: false,
      html: false,
      json: true,
    },
    mochaJunitReporterReporterOptions: {
      mochaFile: 'test-output/cypress/junit_cypress-[hash].xml',
    },
  },
  viewportHeight: 1050,
  viewportWidth: 1680,
  e2e: {
    baseUrl: 'your-grafana-dashboard-url',
    specPattern: 'cypress/**/*.cy.{js,jsx,ts,tsx}',
    excludeSpecPattern: '**/ignoredTestFiles/*.cy.js',
    supportFile: 'cypress/support/index.js',
    testIsolation: false,
    //Retrive the thanos API url
    setupNodeEvents(on, config) {
      try {
        // Login
        execSync(
          `oc login ${OC_SERVER_URL} --username=${OC_USERNAME} --password=${OC_PASSWORD} --insecure-skip-tls-verify=true`,
          { stdio: 'inherit' }
        );

        // Get Thanos host
        const thanosHost = execSync(
          "oc get route thanos-querier -n openshift-monitoring -o jsonpath='{.status.ingress[0].host}'",
          { encoding: 'utf-8' }
        ).trim();

        // Get bearer token
        const bearerToken = execSync('oc whoami -t', { encoding: 'utf-8' }).trim();

        config.env.THANOS_API = `https://${thanosHost}`;
        config.env.BEARER_TOKEN = bearerToken;

        // Fetch recommendationPercentage from configmap and convert to factor
        const rawConfig = execSync(
          'oc get configmap rs-namespace-config -n open-cluster-management-observability -o jsonpath="{.data.prometheusRuleConfig}"',
          { encoding: 'utf-8' }
        );

        const match = rawConfig.match(/recommendationPercentage:\s*(\d+)/);
        if (match) {
          const percentage = parseInt(match[1], 10);
          config.env.recommendationFactor = percentage / 100;
        } else {
          console.warn('recommendationPercentage not found in configmap');
        }
      } catch (err) {
        console.error('Failed to fetch dynamic values', err);
      }

      return config;
    },
  },
});
