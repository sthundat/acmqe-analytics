describe('Rightsizing - Validate CPU and Memory metrics', () => {
  const memorynamespaces = ['open-cluster-management-agent', 'aap', 'multicluster-engine', 'api-helm-multi-ns'];
  const cpunamespaces = [
    'acmqe-gogs',
    'api-git-active-ns',
    'auto-policy-test-2',
    'dest-db',
    'default',
    'open-cluster-management-agent-addon',
    'source-db',
  ];
  const thanosApi = Cypress.env('THANOS_API');
  const bearerToken = Cypress.env('BEARER_TOKEN');
  const aggregation = '5d';
  const memoryConversion = {
    MiB: 1048576,
    GiB: 1073741824,
    B: 1,
  };
  const recommendationFactor = 1.1;
  let maxCpuUsage = 0;
  let maxCpuRequest = 0;
  let memoryUsageBytes = 0;
  let memoryRequestBytes = 0;

  before(() => {
    cy.login(Cypress.env('USERNAME'), Cypress.env('PASSWORD'));
    cy.contains('h2', 'CPU Utilization of Top Namespaces').should('exist');
    //    cy.get("#var-cluster").click();
    //    cy.contains("local-cluster").click();
    //    cy.get("#var-days").click();
  });

  cpunamespaces.forEach((namespace) => {
    it(`validates cpu metrics for namespace: ${namespace} with given aggregation`, () => {
      cy.wrap(null)
        .then(() => fetchMetric('cpu_usage', namespace))
        .then((usage) => {
          maxCpuUsage = usage;
          cy.log();
          return fetchMetric('cpu_request', namespace);
        })
        .then((request) => {
          maxCpuRequest = request;

          // Calculate CPU Utilization Percentage if maxCpuUsage /maxCpuRequest returns no datapoints found
          let utilizationPercent = 0;

          if (
            typeof maxCpuUsage === 'number' &&
            typeof maxCpuRequest === 'number' &&
            maxCpuRequest !== 0 &&
            !isNaN(maxCpuUsage) &&
            !isNaN(maxCpuRequest)
          ) {
            utilizationPercent = (maxCpuUsage / maxCpuRequest) * 100;
          } else {
            console.warn('Invalid CPU usage/request values. Skipping utilization calculation.');
            utilizationPercent = 'N/A';
          }
          cy.wait(2000); //waiting 2 seconds
          cy.get('[data-testid="data-testid Panel header CPU Quota"]').within(() => {
            cy.get('div[data-testid="data-testid table body"]').within(() => {
              cy.get('div[role="row"]').each(($row) => {
                cy.wrap($row).within(() => {
                  cy.get('div[role="cell"]').then(($cells) => {
                    const cellTexts = [...$cells].map((cell) => cell.innerText.trim());
                    if (cellTexts[0] === namespace) {
                      const [, utilizationText, usageText, requestText, recommendationText] = cellTexts;
                      //compare cpu utilization
                      if (utilizationPercent === 'N/A') {
                        expect(utilizationText.trim()).to.equal(
                          'N/A',
                          `Expected CPU utilization of namespace '${namespace}' to be 'N/A', actual value in UI is: '${utilizationText.trim()}'`
                        );
                      } else {
                        const tableCpuUtilization = parseFloat(utilizationText.replace('%', ''));
                        expect(tableCpuUtilization.toFixed(2)).to.equal(
                          utilizationPercent.toFixed(2),
                          `Expected CPU utilization of namespace '${namespace}' to be: ${utilizationPercent.toFixed(
                            2
                          )}, actual value in UI is: ${tableCpuUtilization}`
                        );
                      }
                      // compare cpu usage
                      if (isNaN(maxCpuUsage) || maxCpuUsage === null || maxCpuUsage === undefined) {
                        expect(usageText.trim()).to.equal(
                          'N/A',
                          `Expected CPU usage of namespace '${namespace}' to be 'N/A', actual value in UI is: '${usageText.trim()}'`
                        );
                      } else {
                        let expectedUsage;

                        if (maxCpuUsage === 0) {
                          expectedUsage = 0;
                        } else if (maxCpuUsage > 0 && maxCpuUsage < 0.01) {
                          expectedUsage = 0.01;
                        } else {
                          expectedUsage = maxCpuUsage;
                        }

                        expect(usageText).to.equal(
                          expectedUsage.toFixed(2),
                          `Expected CPU usage of namespace '${namespace}' to be: ${expectedUsage.toFixed(
                            2
                          )}, actual value in UI is: ${usageText}`
                        );
                      }
                      // compare cpu request
                      const isInvalidRequest =
                        maxCpuRequest === undefined || maxCpuRequest === null || isNaN(maxCpuRequest);

                      if (isInvalidRequest) {
                        expect(requestText.trim()).to.equal(
                          'N/A',
                          `Expected CPU request of namespace '${namespace}' to be 'N/A', actual value in UI is: '${requestText.trim()}'`
                        );
                      } else {
                        expect(requestText).to.equal(
                          maxCpuRequest.toFixed(2),
                          `Expected CPU request of namespace '${namespace}' to be: ${maxCpuRequest.toFixed(
                            2
                          )}, actual value in UI is: ${requestText}`
                        );
                      }
                      // compare cpu recomendation
                      const rawRecommendation = maxCpuUsage * recommendationFactor;

                      let expectedRecommendation;
                      if (rawRecommendation === 0) {
                        expectedRecommendation = 0;
                      } else if (rawRecommendation > 0 && rawRecommendation < 0.01) {
                        expectedRecommendation = 0.01;
                      } else {
                        expectedRecommendation = rawRecommendation;
                      }

                      expect(recommendationText).to.equal(
                        expectedRecommendation.toFixed(2),
                        `Expected CPU recommendation of namespace '${namespace}' to be: ${expectedRecommendation.toFixed(
                          2
                        )}, actual value in UI is: ${recommendationText}`
                      );
                    }
                  });
                });
              });
            });
          });
        });
    });
  });

  memorynamespaces.forEach((namespace) => {
    it(`validates memory metrics for namespace: ${namespace} with given aggregation`, () => {
      cy.wrap(null)
        .then(() => fetchMetric('memory_usage', namespace))
        .then((usage) => {
          memoryUsageBytes = usage;
          return fetchMetric('memory_request', namespace);
        })
        .then((request) => {
          memoryRequestBytes = request;

          const utilizationPercent = (memoryUsageBytes / memoryRequestBytes) * 100;

          cy.scrollTo('bottom');
          cy.wait(2000);

          cy.get('[data-testid="data-testid Panel header Memory Quota"]').within(() => {
            cy.get('[data-testid="data-testid table body"]')
              .find('[role="row"]')
              .should('exist')
              .each(($row) => {
                cy.wrap($row).within(() => {
                  cy.get('[role="cell"]').then(($cells) => {
                    const cellTexts = [...$cells].map((cell) => cell.innerText.trim());

                    if (cellTexts[0] === namespace) {
                      const [, utilizationText, usageText, requestText, recommendationText] = cellTexts;

                      const tableMemoryUtilization = parseFloat(utilizationText.replace('%', ''));

                      expect(tableMemoryUtilization.toFixed(2)).to.equal(
                        utilizationPercent.toFixed(2),
                        `Expected memory utilization of namespace '${namespace}' to be: ${utilizationPercent.toFixed(
                          2
                        )}, actual value in UI is: ${tableMemoryUtilization.toFixed(2)}`
                      );

                      assertMemoryValue('MemoryUsage', usageText, memoryUsageBytes, namespace);
                      assertMemoryValue('MemoryRequest', requestText, memoryRequestBytes, namespace);

                      const expectedRecommendation = calculateExpectedRecommendation(usageText, memoryUsageBytes);
                      expect(parseFloat(recommendationText)).to.be.closeTo(
                        expectedRecommendation,
                        0.01,
                        `Expected recommendation value is ${expectedRecommendation}, actual value in UI is: ${parseFloat(
                          recommendationText
                        )}`
                      );
                    }
                  });
                });
              });
          });
        });
    });
  });
  function fetchMetric(metric, namespace) {
    const query = `max_over_time(acm_rs:namespace:${metric}{namespace="${namespace}"}[${aggregation}])`;
    return cy
      .request({
        method: 'GET',
        url: `${thanosApi}/api/v1/query`,
        headers: { Authorization: `Bearer ${bearerToken}` },
        qs: { query },
      })
      .then((response) => {
        const results = response.body.data.result;
        if (!results || results.length === 0) {
          cy.log(`No datapoints found for metric: ${metric} in namespace: ${namespace}`);
          return null;
        }
        return parseFloat(results[0].value[1]);
      });
  }

  function assertMemoryValue(label, uiValue, expectedValueBytes, namespace) {
    const unit = uiValue.includes('GiB')
      ? 'GiB'
      : uiValue.includes('MiB')
        ? 'MiB'
        : uiValue.includes('B')
          ? 'B'
          : 'unknown';
    const converted = convertBytes(expectedValueBytes, unit);
    const parsedUIValue = parseFloat(uiValue);
    expect(parsedUIValue).to.equal(
      Number(converted.toFixed(2)),
      `Expected ${label} of namespace '${namespace}' to be: ${Number(converted.toFixed(2))}, actual ${label} in UI is: ${parsedUIValue}`
    );
  }

  function calculateExpectedRecommendation(uiValue, actualBytes) {
    const unit = uiValue.includes('GiB')
      ? 'GiB'
      : uiValue.includes('MiB')
        ? 'MiB'
        : uiValue.includes('B')
          ? 'B'
          : 'unknown';
    const converted = convertBytes(actualBytes, unit);
    return Number((converted * recommendationFactor).toFixed(2));
  }

  function convertBytes(bytes, unit) {
    return bytes / memoryConversion[unit];
  }
});
