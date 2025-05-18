const { defineConfig } = require('cypress');
const { execSync } = require('child_process');
const fs = require('fs');
const env = JSON.parse(fs.readFileSync('cypress.env.json', 'utf8'));
const OC_USERNAME = env.USERNAME;
const OC_PASSWORD= env.PASSWORD;
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
    baseUrl: 'https://grafana-open-cluster-management-observability.apps.ci-vb-tr27-end.gcp.dev09.red-chesterfield.com/',
    specPattern: 'cypress/**/*.cy.{js,jsx,ts,tsx}',
    excludeSpecPattern: '**/ignoredTestFiles/*.cy.js',
    supportFile: 'cypress/support/index.js',
    testIsolation: false,
    //Retrive the thanos API url
    setupNodeEvents(on, config) {
      try {
        // Dynamically get thanos querier api route
        execSync(
          `oc login ${OC_SERVER_URL} --username=${OC_USERNAME} --password=${OC_PASSWORD} --insecure-skip-tls-verify=true`,
          { stdio: 'inherit' }
        );
        const thanosHost = execSync(
          "oc get route thanos-querier -n openshift-monitoring -o jsonpath='{.status.ingress[0].host}'",
          { encoding: 'utf-8' }
        ).trim();

        // Dynamically get current user's token
        const bearerToken = execSync(
          'oc whoami -t',
          { encoding: 'utf-8' }
        ).trim(); 

        config.env.THANOS_API = `https://${thanosHost}`;
        config.env.BEARER_TOKEN = bearerToken;

        console.log('THANOS_API----------->:', config.env.THANOS_API);
        console.log('BEARER_TOKEN----------->:', config.env.BEARER_TOKEN);
      } catch (err) {
        console.error("Failed to fetch dynamic values", err);
      }

      return config;
    },
  },
});
