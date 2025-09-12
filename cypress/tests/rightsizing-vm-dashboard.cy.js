import {
  fetchCpuOverestimationQuery,
  fetchCpuUnderestimationQuery,
  fetchMemoryUnderestimationQuery,
  fetchMemoryOverestimationQuery,
  totalVmResourceEstimationQuery,
} from '../support/queries/prometheusQueries';

describe('Virtualization Rightsizing - Validate CPU and Memory metrics', () => {
  const cluster = Cypress.env('VM_CLUSTER');
  const aggregation = Cypress.env('AGGREGATION');
  const memoryConversion = {
    MiB: 1048576,
    GiB: 1073741824,
    B: 1,
  };

  before(() => {
    cy.vmLogin(Cypress.env('USERNAME'), Cypress.env('PASSWORD'));
    cy.selectTemplateVariable('Cluster', cluster);
    cy.selectTemplateVariable('Aggregation', aggregation);
  });

  it('Check total resource estimation metrics and validate with backend', () => {
    const types = ['cpu', 'memory'];
    const estimationTypes = ['Overestimation', 'Underestimation'];

    const checkEstimation = (type, estimationType) => {
      const query = totalVmResourceEstimationQuery(type, estimationType);

      cy.queryThanos(query).then((results) => {
        const resource = type === 'cpu' ? 'CPU' : 'Memory';
        const panelTitle = `Total ${resource} ${estimationType}`;

        if (!results || results.length === 0) {
          cy.log(`No datapoints found for ${estimationType} query: ${query}`);
          // Assert that the UI shows "No data"  message
          assertNoDataDisplayed(panelTitle);
          return;
        }

        const backendValue = parseFloat(results[0].value[1]);
        assertTotalEstimationValue(backendValue, panelTitle);
      });
    };

    types.forEach((type) => {
      estimationTypes.forEach((estimationType) => {
        checkEstimation(type, estimationType);
      });
    });
  });

  it('Validate VM-CPU overestimation metrics', () => {
    getEstimationMetrics({
      resourceType: 'cpu',
      estimationType: 'overestimation',
      fetchQuery: fetchCpuOverestimationQuery,
      validateFn: validateEstimation,
      panelTitle: 'CPU Overestimation',
    });
  });

  it('Validate VM-Memory overestimation metrics', () => {
    getEstimationMetrics({
      resourceType: 'memory',
      estimationType: 'overestimation',
      fetchQuery: fetchMemoryOverestimationQuery,
      validateFn: validateEstimation,
      panelTitle: 'Memory Overestimation',
    });
  });

  it('Validate VM-CPU underestimation metrics', () => {
    getEstimationMetrics({
      resourceType: 'cpu',
      estimationType: 'underestimation',
      fetchQuery: fetchCpuUnderestimationQuery,
      validateFn: validateEstimation,
      panelTitle: 'CPU Underestimation',
    });
  });

  it('Validate VM-Memory underestimation metrics', () => {
    getEstimationMetrics({
      resourceType: 'memory',
      estimationType: 'underestimation',
      fetchQuery: fetchMemoryUnderestimationQuery,
      validateFn: validateEstimation,
      panelTitle: 'Memory Underestimation',
    });
  });

  function getEstimationMetrics({ resourceType, estimationType, fetchQuery, validateFn, panelTitle }) {
    const estimationKey = estimationType === 'overestimation' ? 'overEstimation' : 'underEstimation';

    getEstimationPanelData(fetchQuery, panelTitle).then((vms) => {
      vms.forEach(({ name: vmName, namespace }) => {
        const usageMetric = `${resourceType}_usage`;
        const requestMetric = `${resourceType}_request`;
        const recommendationMetric = `${resourceType}_recommendation`;

        cy.getVmMetrics({ metric: usageMetric, namespace, vmName }).then((usage) => {
          cy.getVmMetrics({ metric: requestMetric, namespace, vmName }).then((request) => {
            cy.getVmMetrics({ metric: recommendationMetric, namespace, vmName }).then((recommendation) => {
              cy.getVmMetrics({
                metric: resourceType,
                namespace,
                vmName,
                type: estimationType,
              }).then((estimationValue) => {
                validateFn({
                  type: resourceType,
                  namespace,
                  vmName,
                  usage,
                  request,
                  recommendation,
                  estimationValue,
                  estimationKey,
                  panelTitle,
                });
              });
            });
          });
        });
      });
    });
  }

  function validateEstimation({
    type,
    namespace,
    vmName,
    usage,
    request,
    recommendation,
    estimationValue,
    estimationKey,
    panelTitle,
  }) {
    cy.get(`[data-testid="data-testid Panel header ${panelTitle}"]`)
      .find('div[data-testid="data-testid table body"]')
      .find('div[role="row"]')
      .each(($row) => {
        cy.wrap($row)
          .find('div[role="cell"]')
          .then(($cells) => {
            const cellTexts = [...$cells].map((cell) => cell.innerText.trim());

            processEstimationTableRow(
              cellTexts,
              vmName,
              type,
              namespace,
              usage,
              request,
              recommendation,
              estimationValue,
              estimationKey
            );
          });
      });
  }

  function processEstimationTableRow(
    cellTexts,
    vmName,
    type,
    namespace,
    usage,
    request,
    recommendation,
    estimationValue,
    estimationType
  ) {
    if (cellTexts[0] !== vmName) return;

    const [, , utilizationText, usageText, requestText, recommendationText, estimationText] = cellTexts;
    const utilizationPercent = usage && request ? (usage / request) * 100 : 'N/A';

    if (type === 'memory') {
      validateUtilization(utilizationText, utilizationPercent, namespace, vmName, type);
      validateMemoryEstimation(`${type} usage`, usageText, usage, namespace, vmName);
      validateMemoryEstimation(`${type} request`, requestText, request, namespace, vmName);
      validateMemoryEstimation(`${type} recommendation`, recommendationText, recommendation, namespace, vmName);
      validateMemoryEstimation(`${type} ${estimationType}`, estimationText, estimationValue, namespace, vmName);
    } else if (type === 'cpu') {
      validateUtilization(utilizationText, utilizationPercent, namespace, vmName, type);
      validateCPUEstimation('usage', usageText, usage, namespace, vmName, type);
      validateCPUEstimation('request', requestText, request, namespace, vmName, type);
      validateCPUEstimation('recommendation', recommendationText, recommendation, namespace, vmName, type);
      validateCPUEstimation(estimationType.toLowerCase(), estimationText, estimationValue, namespace, vmName, type);
    }
  }

  function validateCPUEstimation(metricType, uiValue, expectedValue, namespace, vmName, type) {
    const isNullValue = expectedValue === null || expectedValue === undefined || isNaN(expectedValue);

    if (isNullValue) {
      expect(uiValue.trim()).to.equal('N/A');
      return;
    }

    let processedExpectedValue = expectedValue;

    if (type === 'cpu') {
      if (metricType === 'usage') {
        processedExpectedValue = expectedValue === 0 ? 0 : expectedValue < 0.01 ? 0.01 : expectedValue;
      } else if (metricType === 'recommendation') {
        processedExpectedValue = Math.ceil(expectedValue);
      }
    } else if (type === 'memory' && metricType === 'recommendation') {
      processedExpectedValue = Math.ceil(expectedValue);
    }

    const expectedFormatted = Number(processedExpectedValue.toFixed(2));
    const actualFormatted = parseFloat(uiValue);

    expect(actualFormatted).to.equal(
      expectedFormatted,
      `Expected ${type.toUpperCase()} ${metricType} of namespace '${namespace}' and VM '${vmName}' to equal: ${expectedFormatted}, actual value in UI is: ${actualFormatted}`
    );
  }

  function validateUtilization(uiUtilizationText, expectedUtilization, namespace, vmName, type) {
    if (expectedUtilization === 'N/A') {
      expect(uiUtilizationText.trim()).to.equal('N/A');
      return;
    }

    const uiUtilization = parseFloat(uiUtilizationText.replace('%', ''));
    const expectedFormatted = Number(expectedUtilization.toFixed(2));
    const actualFormatted = Number(uiUtilization.toFixed(2));

    expect(actualFormatted).to.equal(
      expectedFormatted,
      `Expected ${type.toUpperCase()} utilization of namespace '${namespace}' and VM '${vmName}' to equal: ${expectedFormatted}, actual value in UI is: ${actualFormatted}`
    );
  }

  function assertTotalEstimationValue(expectedValue, panelTitle) {
    const panelSelector = `section[data-testid="data-testid Panel header ${panelTitle}"]`;

    getUiNumericValue(panelSelector).then((uiValue) => {
      const expectedNumberValue = parseFloat(expectedValue);
      expect(
        uiValue,
        `Expected ${panelTitle} to be exactly equal to: ${expectedNumberValue}, actual value in UI is: ${uiValue}`
      ).to.equal(expectedNumberValue);
    });
  }

function assertNoDataDisplayed(panelTitle) {
  const panelSelector = `section[data-testid="data-testid Panel header ${panelTitle}"]`;

  cy.get(panelSelector).within(() => {
    cy.contains('div', 'No data')
      .should('be.visible')
      .and(($el) => {
        expect($el.text().trim(), `Expect "${panelTitle}" panel to display "No data"`).to.eq('No data');
      });
  });
}

  function validateMemoryEstimation(label, uiValue, expectedValue, namespace, vmName) {
    const unit = uiValue.includes('GiB')
      ? 'GiB'
      : uiValue.includes('MiB')
        ? 'MiB'
        : uiValue.includes('B')
          ? 'B'
          : 'unknown';

    let converted;

    if (label.toLowerCase().includes('overestimation') || label.toLowerCase().includes('underestimation')) {
      converted = expectedValue;
    } else {
      converted = convertBytes(expectedValue, unit);
    }

    if (label.toLowerCase().includes('recommendation')) {
      converted = Math.ceil(converted);
    }

    const parsedUIValue = parseFloat(uiValue);

    expect(parsedUIValue).to.equal(
      Number(converted.toFixed(2)),
      `Expected ${label} of namespace '${namespace}' and vm '${vmName}' to equal: ${Number(
        converted.toFixed(2)
      )}, actual ${label} in UI is: ${parsedUIValue}`
    );
  }

  function getEstimationPanelData(query, panelTitle) {
    cy.log(`query for getting Vm details:${query}`);
    return cy.queryThanos(query).then((results) => {
      if (results.length === 0) {
        cy.log(`No data found for this estimation panel. The panel may not be rendering any values at the moment.`);
        assertNoDataDisplayed(panelTitle);
      } else {
        cy.log(`Found ${results.length} overestimated VMs:`);
      }

      const vms = results.map((r) => {
        const vmName = r.metric.name;
        const namespace = r.metric.namespace;
        cy.log(` ${vmName} [${namespace}]`);
        return { name: vmName, namespace };
      });

      return cy.wrap(vms);
    });
  }

  function convertBytes(bytes, unit) {
    return bytes / memoryConversion[unit];
  }

  function getUiNumericValue(panelSelector) {
    return cy
      .get(panelSelector)
      .find('span')
      .contains(/^\d+(\.\d+)?$/)
      .then(($span) => {
        const value = $span.text();
        return parseFloat(value.replace(/[^\d.]/g, ''));
      });
  }
});
