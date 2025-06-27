Cypress.Commands.add('login', (username, password) => {
  cy.visit('/', { failOnStatusCode: false });

  // Check if the "Log in with OpenShift" button is present
  cy.get('body').then(($body) => {
    if ($body.find('button:contains("Log in with OpenShift")').length) {
      cy.contains('button', 'Log in with OpenShift').click();
      cy.get('a[title="Log in with kube:admin"]').click();
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
  cy.get('a[href="/dashboards"][data-testid="data-testid Dashboards breadcrumb"]').should('be.visible').click();
  cy.contains('a', 'RightSizing Recommendation').click();
  cy.contains('a', 'ACM Right-Sizing Namespace').click();
});
