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
    setupNodeEvents(on, config) {
      try {
        // Login
        execSync(
          `oc login ${OC_SERVER_URL} --username=${OC_USERNAME} --password=${OC_PASSWORD} --insecure-skip-tls-verify=true`,
          { stdio: 'inherit' }
        );

        // Get bearer token
        const bearerToken = execSync('oc whoami -t', { encoding: 'utf-8' }).trim();
        config.env.BEARER_TOKEN = bearerToken;
        // Create the route for Thanos Query Frontend Route(if not already present)
        try {
          execSync(
            `
                    echo "
                  apiVersion: route.openshift.io/v1
                  kind: Route
                  metadata:
                    name: query-frontend
                  spec:
                    port:
                      targetPort: http
                    wildcardPolicy: None
                    to:
                      kind: Service
                      name: observability-thanos-query-frontend
                  " | oc -n open-cluster-management-observability apply -f -
                  `,
            { stdio: 'inherit', shell: '/bin/bash' }
          );
        } catch (e) {
          console.warn('Route creation/expose may have failed (may already exist):', e.message);
        }
        //  Get the Route URL
        const frontendHost = execSync(
          "oc get route query-frontend -n open-cluster-management-observability -o jsonpath='{.spec.host}'",
          { encoding: 'utf-8' }
        )
          .replace(/'/g, '')
          .trim();

        config.env.THANOS_FRONTEND_URL = `http://${frontendHost}`;
        console.log(`THANOS_FRONTEND_URL: ${config.env.THANOS_FRONTEND_URL}`);
      } catch (err) {
        console.error('Failed to fetch dynamic values', err);
      }

      return config;
    },
  },
});
