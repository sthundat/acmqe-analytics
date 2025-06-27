describe('Rightsizing - Validate CPU and Memory metrics', () => {
  const thanosFrontendUrl = Cypress.env('THANOS_FRONTEND_URL');
  const bearerToken = Cypress.env('BEARER_TOKEN');
  const cluster = 'local-cluster';
  const aggregation = '5d';
  const memoryConversion = {
    MiB: 1048576,
    GiB: 1073741824,
    B: 1,
  };
  let memoryUsageBytes = 0;
  let memoryRequestBytes = 0;
  let memoryRecommendationBytes = 0;

  before(() => {
    cy.login(Cypress.env('USERNAME'), Cypress.env('PASSWORD'));
    cy.contains('h2', 'CPU Utilization of Top Namespaces').should('exist');
  });
  it('validates CPU metrics for top namespaces', () => {
    fetchTopNamespaces('acm_rs:namespace:cpu_usage', 'acm_rs:namespace:cpu_request', 'CPU').then((namespaces) => {
      cy.wrap(namespaces).as('topNamespaces');
    });

    cy.get('@topNamespaces').then((topNamespaces) => {
      topNamespaces.forEach((namespace) => {
        fetchMetric({ metric: 'cpu_usage', namespace }).then((cpuUsage) => {
          fetchMetric({ metric: 'cpu_request', namespace }).then((cpuRequest) => {
            fetchMetric({ metric: 'cpu_recommendation', namespace }).then((cpuRecommendation) => {
              validateNamespaceCpuMetrics(namespace, cpuUsage, cpuRequest, cpuRecommendation);
            });
          });
        });
      });
    });
  });

  function validateNamespaceCpuMetrics(namespace, cpuUsage, cpuRequest, cpuRecommendation) {
    const utilizationPercent = cpuUsage && cpuRequest ? (cpuUsage / cpuRequest) * 100 : 'N/A';

    cy.get('[data-testid="data-testid Panel header CPU Quota"]').within(() => {
      cy.get('div[data-testid="data-testid table body"]').within(() => {
        cy.get('div[role="row"]').each(($row) => {
          cy.wrap($row).within(() => {
            cy.get('div[role="cell"]').then(($cells) => {
              const cellTexts = [...$cells].map((cell) => cell.innerText.trim());
              if (cellTexts[0] === namespace) {
                const [, utilizationText, usageText, requestText, recommendationText] = cellTexts;

                // CPU Usage
                if (cpuUsage === null || cpuUsage === undefined || isNaN(cpuUsage)) {
                  expect(usageText.trim()).to.equal('N/A');
                } else {
                  let expectedUsage = cpuUsage === 0 ? 0 : cpuUsage < 0.01 ? 0.01 : cpuUsage;
                  expect(usageText).to.equal(
                    expectedUsage.toFixed(2),
                    `Expected CPU usage of namespace '${namespace}' to be: ${expectedUsage.toFixed(
                      2
                    )}, actual value in UI is: ${usageText}`
                  );
                }

                // CPU Request
                if (cpuRequest === null || cpuRequest === undefined || isNaN(cpuRequest)) {
                  expect(requestText.trim()).to.equal('N/A');
                } else {
                  expect(parseFloat(requestText)).to.be.closeTo(
                    Number(cpuRequest.toFixed(2)),
                    0.1,
                    `Expected CPU request of namespace '${namespace}' to be close to: ${cpuRequest.toFixed(
                      2
                    )}, actual value in UI is: ${requestText}`
                  );
                }

                // CPU Utilization
                if (utilizationPercent === 'N/A') {
                  expect(utilizationText.trim()).to.equal('N/A');
                } else {
                  const uiUtilization = parseFloat(utilizationText.replace('%', ''));
                  expect(uiUtilization).to.be.closeTo(
                    Number(utilizationPercent.toFixed(2)),
                    0.1,
                    `Expected CPU utilization of namespace '${namespace}' to be close to: ${utilizationPercent.toFixed(
                      2
                    )}, actual value in UI is: ${uiUtilization.toFixed(2)}`
                  );
                }

                // CPU Recommendation
                let expectedRecommendation =
                  cpuRecommendation === 0 ? 0 : cpuRecommendation < 0.01 ? 0.01 : cpuRecommendation;

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
  }

  it('validates memory metrics for top namespaces', () => {
    fetchTopNamespaces('acm_rs:namespace:memory_usage', 'acm_rs:namespace:memory_request', 'memory').then(
      (namespaces) => {
        cy.wrap(namespaces).as('topNamespaces');
      }
    );
    let utilizationPercent = 0;
    cy.get('@topNamespaces').then((topNamespaces) => {
      topNamespaces.forEach((namespace) => {
        fetchMetric({ metric: 'memory_usage', namespace: namespace }).then((memoryUsage) => {
          memoryUsageBytes = memoryUsage;

          fetchMetric({ metric: 'memory_request', namespace: namespace }).then((memoryRequest) => {
            memoryRequestBytes = memoryRequest;

            fetchMetric({ metric: 'memory_recommendation', namespace: namespace }).then((memoryRecommendation) => {
              memoryRecommendationBytes = memoryRecommendation;

              if (memoryUsageBytes && memoryRequestBytes) {
                utilizationPercent = (memoryUsageBytes / memoryRequestBytes) * 100;
              } else {
                cy.log(`Namespace: ${namespace} - Missing data for usage or request.`);
              }
              cy.scrollTo('bottom');
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

                          assertNamespaceMemoryValue('MemoryUsage', usageText, memoryUsageBytes, namespace);
                          assertNamespaceMemoryValue('MemoryRequest', requestText, memoryRequestBytes, namespace);
                          assertNamespaceMemoryValue(
                            'MemoryRecommendation',
                            recommendationText,
                            memoryRecommendationBytes,
                            namespace
                          );

                          const tableMemoryUtilization = parseFloat(utilizationText.replace('%', ''));
                          expect(tableMemoryUtilization).to.be.closeTo(
                            Number(utilizationPercent.toFixed(2)),
                            0.1,
                            `Expected memory utilization of namespace '${namespace}' to be close to: ${utilizationPercent.toFixed(
                              2
                            )}, actual value in UI is: ${tableMemoryUtilization.toFixed(2)}`
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

  const buildClusterMetricQuery = (metricName) =>
    `max_over_time(sum by (cluster) (acm_rs:cluster:${metricName}{cluster="${cluster}", profile="Max OverAll"})[${aggregation}:])`;

  it(`validates cpu metrics at cluster level with given aggregation`, () => {
    const cpuUsageQuery = buildClusterMetricQuery('cpu_usage');
    const cpuRequestQuery = buildClusterMetricQuery('cpu_request');
    const cpuRecommendationQuery = buildClusterMetricQuery('cpu_recommendation');

    fetchMetric({ query: cpuUsageQuery }).then((usage) => {
      if (usage === null) return;
      const maxCpuUsage = usage;

      fetchMetric({ query: cpuRequestQuery }).then((request) => {
        if (request === null) return;
        const maxCpuRequest = request;

        fetchMetric({ query: cpuRecommendationQuery }).then((recommendation) => {
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
    const memoryUsageQuery = buildClusterMetricQuery('memory_usage');
    const memoryRequestQuery = buildClusterMetricQuery('memory_request');
    const memoryRecommendationQuery = buildClusterMetricQuery('memory_recommendation');

    fetchMetric({ query: memoryUsageQuery }).then((usage) => {
      if (usage === null) return;
      const memoryUsageBytes = usage;

      fetchMetric({ query: memoryRequestQuery }).then((request) => {
        if (request === null) return;
        const memoryRequestBytes = request;

        fetchMetric({ query: memoryRecommendationQuery }).then((recommendation) => {
          if (recommendation === null) return;
          const recommendationBytes = recommendation;

          const utilizationPercent = (memoryUsageBytes / memoryRequestBytes) * 100;

          assertClusterMemoryValue(recommendationBytes, 'Memory Recommendation');
          assertClusterMemoryValue(memoryUsageBytes, 'Memory Usage');
          assertClusterMemoryValue(memoryRequestBytes, 'Memory Request');
          assertClusterMemoryValue(utilizationPercent, 'Memory Utilization');
        });
      });
    });
  });

  it('should display top utilized namespaces in descending order in the CPU quota table', () => {
    fetchTopNamespaces('acm_rs:namespace:cpu_usage', 'acm_rs:namespace:cpu_request', 'CPU').then((namespaces) => {
      cy.wrap(namespaces).as('topNamespaces');
    });
    cy.get('@topNamespaces').then((topNamespaces) => {
      getNamespacesFromUIQuotaTable('[data-testid="data-testid Panel header CPU Quota"]').then((uiNamespaces) => {
        expect(uiNamespaces).to.deep.equal(
          topNamespaces,
          `Expected top CPU utilized namespaces order.\nExpected: ${topNamespaces.join(', ')}\nActual: ${uiNamespaces.join(', ')}`
        );
      });
    });
  });

  it('should display top utilized namespaces in descending order in the memory quota table', () => {
    fetchTopNamespaces('acm_rs:namespace:memory_usage', 'acm_rs:namespace:memory_request', 'memory').then(
      (namespaces) => {
        cy.wrap(namespaces).as('topNamespaces');
      }
    );
    cy.scrollTo('bottom');
    cy.get('@topNamespaces').then((topNamespaces) => {
      getNamespacesFromUIQuotaTable('[data-testid="data-testid Panel header Memory Quota"]').then((uiNamespaces) => {
        expect(uiNamespaces).to.deep.equal(
          topNamespaces,
          `Expected top memory utilized namespaces order.\nExpected: ${topNamespaces.join(', ')}\nActual: ${uiNamespaces.join(', ')}`
        );
      });
    });
  });

  it('should create a workload in a custom namespace and verify the metrics', () => {
    cy.exec('oc get namespace custom-namespace || oc create namespace custom-namespace').then(() => {
      cy.exec('oc apply -f cypress/resources/customresource.yaml').then((result) => {
        expect(result.code).to.eq(0);
        cy.log('Workload created successfully');
        waitForNamespaceMetrics('custom-namespace', 'cpu_usage');
      });
    });
  });

  function fetchTopNamespaces(usageMetric, requestMetric, label) {
    const query = `topk(9,
  max_over_time(
	sum by (namespace) (
  	${usageMetric}{cluster="${cluster}"}
	)[${aggregation}:]
  )
  /
  max_over_time(
	sum by (namespace) (
  	${requestMetric}{cluster="${cluster}"}
	)[${aggregation}:]
  ) * 100
)
`;
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

  function fetchMetric({ metric = null, namespace = null, query = null }) {
    const finalQuery =
      query ||
      `max_over_time(
          sum by (namespace) (
            acm_rs:namespace:${metric}{
              cluster="${cluster}",
              profile="Max OverAll",
              namespace="${namespace}"
            }
          )[${aggregation}:]
        )`;
    return queryThanos(finalQuery).then((results) => {
      if (!results || results.length === 0) {
        cy.log(`No datapoints found for ${query ? `query: ${query}` : `metric: ${metric} in namespace: ${namespace}`}`);
        return null;
      }
      return parseFloat(results[0].value[1]);
    });
  }

  function queryThanos(query) {
    return cy
      .request({
        method: 'GET',
        url: `${thanosFrontendUrl}/api/v1/query`,
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
    expect(parsedUIValue).to.be.closeTo(
      Number(converted.toFixed(2)),
      0.1,
      `Expected ${label} of namespace '${namespace}' to be close to: ${Number(
        converted.toFixed(2)
      )}, actual ${label} in UI is: ${parsedUIValue}`
    );
  }

  function assertClusterMemoryValue(expectedMemoryValue, panelTitle) {
    cy.scrollTo('bottom');
    // cy.get('#page-scrollbar').should('exist').scrollTo('bottom', { ensureScrollable: false });
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
          0.1,
          `Expected ${panelTitle} to be close to: ${Number(
            expectedValue.toFixed(2)
          )}, actual ${panelTitle} in UI is: ${uiValue}`
        );
      });
  }

  function waitForNamespaceMetrics(namespace, metric, retries = 7, retryInterval = 150000) {
    // Automatic retry logic while waiting for metrics to show up
    const query = ` max_over_time(
      sum by (namespace) (
        acm_rs:namespace:${metric}{
          cluster="${cluster}",
          profile="Max OverAll",
          namespace="${namespace}"
        }
      )[${aggregation}:]
    )`;

    function poll(attempt = 1) {
      return queryThanos(query).then((results) => {
        const currentTime = new Date().toLocaleTimeString();
        if (results.length > 0) {
          cy.log(`[${currentTime}] Metrics found for query: ${query}`);
          return;
        }

        if (attempt < retries) {
          cy.log(`[${currentTime}] Attempt ${attempt}: No metrics yet, retrying in ${retryInterval / 1000}s...`);
          // eslint-disable-next-line cypress/no-unnecessary-waiting
          return cy.wait(retryInterval).then(() => poll(attempt + 1));
        }

        throw new Error(`Metrics not found for query: ${query} after ${retries} retries`);
      });
    }
    return poll();
  }

  function getNamespacesFromUIQuotaTable(panelSelector) {
    const uiNamespaces = [];

    cy.get(panelSelector).within(() => {
      cy.get('div[data-testid="data-testid table body"]').within(() => {
        cy.get('div[role="row"]').each(($row) => {
          cy.wrap($row).within(() => {
            cy.get('div[role="cell"]')
              .first()
              .invoke('text')
              .then((text) => {
                uiNamespaces.push(text.trim());
              });
          });
        });
      });
    });

    return cy.wrap(null).then(() => uiNamespaces);
  }
});
