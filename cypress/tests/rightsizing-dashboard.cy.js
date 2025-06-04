describe('Rightsizing - Validate CPU and Memory metrics', () => {
  const thanosApi = Cypress.env('THANOS_API');
  const bearerToken = Cypress.env('BEARER_TOKEN');
  const recommendationFactor = Cypress.env('recommendationFactor');
  const aggregation = '5d';
  const memoryConversion = {
    MiB: 1048576,
    GiB: 1073741824,
    B: 1,
  };
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

  it('validates CPU metrics for top namespaces', () => {
    fetchTopNamespaces('acm_rs:namespace:cpu_usage', 'acm_rs:namespace:cpu_request', 'CPU').then((namespaces) => {
      cy.wrap(namespaces).as('topNamespaces');
    });
    let utilizationPercent = 0;
    cy.get('@topNamespaces').then((topNamespaces) => {
      topNamespaces.forEach((namespace) => {
        fetchMetric({ metric: 'cpu_usage', namespace: namespace}).then((cpuUsage) => {
          maxCpuUsage = cpuUsage;

          fetchMetric({ metric: 'cpu_request', namespace: namespace}).then((cpuRequest) => {
            maxCpuRequest = cpuRequest;

            if (maxCpuUsage && maxCpuRequest) {
              utilizationPercent = (maxCpuUsage / maxCpuRequest) * 100;
            } else {
              cy.log(`Namespace: ${namespace} - Missing data for usage or request.`);
            }
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
                          expect(parseFloat(requestText)).to.be.closeTo(
                            maxCpuRequest,
                            0.01, // allow ±0.01 tolerance
                            `Expected CPU request of namespace '${namespace}' to be close to: ${maxCpuRequest}, actual value in UI is: ${requestText}`
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
    });
  });

  it('validates memory metrics for top namespaces', () => {
    fetchTopNamespaces('acm_rs:namespace:memory_usage', 'acm_rs:namespace:memory_request', 'memory').then(
      (namespaces) => {
        cy.wrap(namespaces).as('topNamespaces');
      }
    );
    let utilizationPercent = 0;
    cy.get('@topNamespaces').then((topNamespaces) => {
      topNamespaces.forEach((namespace) => {
        fetchMetric({ metric: 'memory_usage', namespace: namespace}).then((memoryUsage) => {
          memoryUsageBytes = memoryUsage;

          fetchMetric({ metric: 'memory_request', namespace: namespace}).then((memoryRequest) => {
            memoryRequestBytes = memoryRequest;

            if (memoryUsageBytes && memoryRequestBytes) {
              utilizationPercent = (memoryUsageBytes / memoryRequestBytes) * 100;
            } else {
              cy.log(`Namespace: ${namespace} - Missing data for usage or request.`);
            }
            // cy.scrollTo('bottom');
            cy.get('#page-scrollbar').should('exist').scrollTo('bottom', { ensureScrollable: false });
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

                        assertNamespaceMemoryValue('MemoryUsage', usageText, memoryUsageBytes, namespace);
                        assertNamespaceMemoryValue('MemoryRequest', requestText, memoryRequestBytes, namespace);

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
    });
  });

  it(`validates cpu metrics at cluster level with given aggregation`, () => {
    // Fetch CPU Usage
    fetchMetric({ query: `max_over_time(acm_rs:cluster:cpu_usage:5m[${aggregation}])` }).then((usage) => {
      if (usage === null) return;
      maxCpuUsage = usage;

      // Fetch CPU Request
      fetchMetric({ query: `max_over_time(acm_rs:cluster:cpu_request:5m[${aggregation}])` }).then((request) => {
        if (request === null) return;
        maxCpuRequest = request;

        // Fetch Recommendation
        fetchMetric({
          query: `max_over_time(acm_rs:cluster:cpu_usage{profile="Max OverAll"}[${aggregation}]) * ${recommendationFactor}`,
        }).then((recommendation) => {
          if (recommendation === null) return;
          const utilizationPercent = (maxCpuUsage / maxCpuRequest) * 100;
          assertClusterCPUValue(recommendation, 'CPU Recommendation');
          assertClusterCPUValue(maxCpuUsage, 'CPU Usage');
          assertClusterCPUValue(maxCpuRequest, 'CPU Request');
          assertClusterCPUValue(utilizationPercent, 'CPU Utilization');
        });
      });
    });
  });

  it(`validates memory metrics at cluster level with given aggregation`, () => {
    // Fetch Memory Usage
    fetchMetric({ query: `max_over_time(acm_rs:cluster:memory_usage:5m[${aggregation}])` }).then((usage) => {
      if (usage === null) return;
      memoryUsageBytes = usage;

      // Fetch Memory Request
      fetchMetric({ query: `max_over_time(acm_rs:cluster:memory_request:5m[${aggregation}])` }).then((request) => {
        if (request === null) return;
        memoryRequestBytes = request;

        // Fetch Recommendation (Usage * 1.1)
        fetchMetric({
          query: `max_over_time(acm_rs:cluster:memory_usage{profile="Max OverAll"}[${aggregation}]) * ${recommendationFactor}`,
        }).then((recommendation) => {
          if (recommendation === null) return;
          const recommendationBytes = recommendation;
          const utilizationPercent = (memoryUsageBytes / memoryRequestBytes) * 100;

          // Assertions
          assertClusterMemoryValue(recommendationBytes, 'Memory Recommendation');
          assertClusterMemoryValue(memoryUsageBytes, 'Memory Usage');
          assertClusterMemoryValue(memoryRequestBytes, 'Memory Request');
          assertClusterMemoryValue(utilizationPercent, 'Memory Utilization');
        });
      });
    });
  });

  it("should create a workload in a custom namespace and verify the metrics", () => {
    const namespace = 'custom-namespace';
    cy.exec('oc get namespace ${namespace} || oc create namespace ${namespace}').then(() => {
      cy.exec('oc apply -f cypress/resources/customresource.yaml').then((result) => {
        expect(result.code).to.eq(0);
        cy.log('Workload created successfully');
        waitForNamespaceMetrics( namespace);
        });
    });
  });

  function fetchTopNamespaces(usageMetric, requestMetric, label) {
    const query = `topk(9, max_over_time(sum by (namespace) (${usageMetric})[${aggregation}:]) / max_over_time(sum by (namespace) (${requestMetric})[${aggregation}:]) * 100)`;
    return queryThanos(query).then((results) => {
      if (results.length === 0) {
        cy.log(`No datapoints found for top ${label} utilization namespaces`);
      }
        const namespaces = results.map((r) => r.metric.namespace);
        namespaces.forEach((ns, index) => {
          const utilization = parseFloat(results[index].value[1]).toFixed(2);
          cy.log(`${index + 1}. ${ns} - ${label} Utilization: ${utilization}%`);
        });
        return cy.wrap(namespaces);
      });
  }

  function fetchMetric({ metric = null, namespace = null, query = null}) {
    const finalQuery = query || `max_over_time(acm_rs:namespace:${metric}{namespace="${namespace}"}[${aggregation}])`;
    return queryThanos(finalQuery).then((results) => {
        if (!results || results.length === 0) {
          cy.log(
            `No datapoints found for ${query ? `query: ${query}` : `metric: ${metric} in namespace: ${namespace}`}`
          );
          return null;
        }
        return parseFloat(results[0].value[1]);
      });
  }

  function queryThanos(query) {
    return cy
      .request({
        method: 'GET',
        url: `${thanosApi}/api/v1/query`,
        headers: { Authorization: `Bearer ${bearerToken}` },
        qs: { query },
      })
      .then((response) => response.body.data?.result || []);
  }

  function assertNamespaceMemoryValue(label, uiValue, expectedValueBytes, namespace) {
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
      `Expected ${label} of namespace '${namespace}' to be: ${Number(
        converted.toFixed(2)
      )}, actual ${label} in UI is: ${parsedUIValue}`
    );
  }

  function assertClusterMemoryValue(expectedMemoryValue, panelTitle) {
    // cy.scrollTo('bottom');
    cy.get('#page-scrollbar').should('exist').scrollTo('bottom', { ensureScrollable: false });
    cy.get(`section[data-testid="data-testid Panel header ${panelTitle}"]`)
      .contains(/^\d+(\.\d+)?/)
      .then(($numberSpan) => {
        const NumericUIValue = parseFloat($numberSpan.text());
        if (panelTitle === 'Memory Utilization') {
          const expectedValue = parseFloat(expectedMemoryValue);

          expect(NumericUIValue).to.be.closeTo(
            Number(expectedValue.toFixed(2)),
            0.1,
            `Expected ${panelTitle} to be close to: ${Number(
              expectedValue.toFixed(2)
            )}, actual ${panelTitle} in UI is: ${NumericUIValue}`
          );
        } else {
          const unit = $numberSpan.parent().find('span').eq(1).text().trim();

          const memoryUnit = unit.includes('GiB')
            ? 'GiB'
            : unit.includes('MiB')
            ? 'MiB'
            : unit.includes('B')
            ? 'B'
            : 'unknown';
          const expectedValue = convertBytes(expectedMemoryValue, memoryUnit);
          const parsedUIValue = parseFloat(NumericUIValue);

          expect(parsedUIValue).to.be.closeTo(
            Number(expectedValue.toFixed(2)),
            0.1,
            `Expected ${panelTitle} to be close to: ${Number(
              expectedValue.toFixed(2)
            )}, actual ${panelTitle} in UI is: ${parsedUIValue}`
          );
        }
      });
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

  function assertClusterCPUValue(expectedValue, panelTitle) {
    cy.get(`section[data-testid="data-testid Panel header ${panelTitle}"]`)
      .find('span')
      .contains(/^\d+(\.\d+)?$/)
      .then(($span) => {
        const value = $span.text();
        const uiValue = parseFloat(value.replace(/[^\d.]/g, ''));

        expect(uiValue).to.be.closeTo(
          Number(expectedValue.toFixed(2)),
          .1,
          `Expected ${panelTitle} to be close to: ${Number(
            expectedValue.toFixed(2)
          )}, actual ${panelTitle} in UI is: ${uiValue}`
        );
      });
  }

  function waitForNamespaceMetrics(namespace, retries = 7, retryInterval = 150000) {
    // Automatic retry logic while waiting for metrics to show up
    const query = `max_over_time(acm_rs:namespace:cpu_usage{namespace="${namespace}"}[5m])`;

    function poll(attempt = 1) {
      return queryThanos(query).then((results) => {
        const currentTime = new Date().toLocaleTimeString();
        if (results.length > 0) {
          cy.log(`[${currentTime}] Metrics found for query: ${query}`);
          return;
        }

        if (attempt < retries) {
          cy.log(`[${currentTime}] Attempt ${attempt}: No metrics yet, retrying in ${retryInterval / 1000}s...`);
          return cy.wait(retryInterval).then(() => poll(attempt + 1));
        }

        throw new Error(`Metrics not found for query: ${query} after ${retries} retries`);
      });
    }
    return poll();
  }
});
