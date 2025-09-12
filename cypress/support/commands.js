import { buildVmMetricsQuery } from '../support/queries/prometheusQueries';

Cypress.Commands.add('performLogin', (username, password, isVMLogin = false) => {
  cy.visit('/', { failOnStatusCode: false });

  // Check if the "Log in with OpenShift" button is present
  cy.get('body').then(($body) => {
    if ($body.find('button:contains("Log in with OpenShift")').length) {
      cy.contains('button', 'Log in with OpenShift').click();
      cy.get('#inputUsername').type(username);
      cy.get('#inputPassword').type(password);
      cy.contains('button', 'Log in').click();
    }
  });

  cy.intercept('GET', '**/api/user/orgs').as('getOrgs');
  cy.wait('@getOrgs', { timeout: 10000 }).then((interception) => {
    if (!interception.response || interception.response.statusCode >= 400) {
      cy.log('Request failed or was aborted — continuing test');
    } else {
      cy.log('GET /api/user/orgs completed');
    }
  });

  // Navigate to the dashboard
  cy.get('a[href="/dashboards"][data-testid="data-testid Dashboards breadcrumb"]')
    .should('be.visible')
    .click();

  cy.contains('a', 'RightSizing Recommendation').click();

  if (isVMLogin) {
    cy.contains('a', 'ACM Right-Sizing OpenShift Virtualization').click();
  } else {
    cy.contains('a', 'ACM Right-Sizing Namespace').click();
  }
});

Cypress.Commands.add('login', (username, password) => {
  cy.performLogin(username, password, false);
});

Cypress.Commands.add('vmLogin', (username, password) => {
  cy.performLogin(username, password, true);
});

Cypress.Commands.add('queryThanos', (query) => {
  const thanosFrontendUrl = Cypress.env('THANOS_FRONTEND_URL');
  const bearerToken = Cypress.env('BEARER_TOKEN');

  return cy
    .request({
      method: 'GET',
      url: `${thanosFrontendUrl}/api/v1/query`,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
      qs: { query },
    })
    .then((response) => {
      return response.body.data?.result || [];
    });
});

Cypress.Commands.add('selectTemplateVariable', (label, valueToSelect) => {
  cy.contains('label', label)
    .closest('[data-testid="data-testid template variable"]')
    .within(() => {
      cy.get('[data-testid^="data-testid Dashboard template variables Variable Value DropDown"]').first().click();
    });

  cy.contains('div', valueToSelect).should('be.visible').click();
});

Cypress.Commands.add('getVmMetrics', ({ metric, namespace, vmName, type = 'value' }) => {
  const query = buildVmMetricsQuery({ metric, namespace, vmName, type });

  cy.log(`Final ${metric} (${type}) query to backend: ${query}`);

  return cy.queryThanos(query).then((results) => {
    if (!results || results.length === 0) {
      cy.log(`No datapoints found for metric: ${metric} (${type}) in namespace: ${namespace}, VM: ${vmName}`);
      return null;
    }
    return parseFloat(results[0].value[1]);
  });
});
