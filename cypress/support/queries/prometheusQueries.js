// Extract environment variables once
const CLUSTER = Cypress.env('VM_CLUSTER');
const PROFILE = Cypress.env('PROFILE');
const AGGREGATION = Cypress.env('AGGREGATION');

// Metric name generators for request and recommendation metrics
const metricNames = {
  request: (resource) => `acm_rs_vm:namespace:${resource}_request`,
  recommendation: (resource) => `acm_rs_vm:namespace:${resource}_recommendation`,
};

/**
 * Query to get VM last running timestamp, reused in multiple queries.
 */
const vmLastRunningTimestampQuery = () => `
label_join(
  label_replace(
    max by (name, namespace) (
      max_over_time(
        ((kubevirt_vm_running_status_last_transition_timestamp_seconds{cluster="${CLUSTER}"} > 0) * 1000)[${AGGREGATION}:]
      )
    ),
    "vm_last_running_timestamp", "$1", "value", "(.*)"
  ),
  "name_namespace", "-", "name", "namespace"
) * 0
`;

/**
 * Builds PromQL query string for getting resource details of over/under estimation.
 */
const buildEstimationQuery = ({ resource, isUnderestimation }) => {
  const sign = isUnderestimation ? ' * (-1)' : '';
  const resourceRequest = metricNames.request(resource);
  const resourceRecommendation = metricNames.recommendation(resource);

  const usageDiffQuery = `
    floor(
      max_over_time(
        sum by (name, namespace) (
          ${resourceRequest}{cluster="${CLUSTER}", profile="${PROFILE}"}
        )[${AGGREGATION}:]
      )
      -
      max_over_time(
        sum by (name, namespace) (
          ${resourceRecommendation}{cluster="${CLUSTER}", profile="${PROFILE}"}
        )[${AGGREGATION}:]
      )
    )${sign}
  `;

  return `
(
  label_join(
    (${usageDiffQuery}),
    "name_namespace", "-", "name", "namespace"
  ) > 0
)
+ on(name_namespace) group_left(vm_last_running_timestamp)
(${vmLastRunningTimestampQuery()})
`;
};

// Pre-built queries for CPU/Memory over/under estimations
export const fetchCpuOverestimationQuery = buildEstimationQuery({ resource: 'cpu', isUnderestimation: false });
export const fetchCpuUnderestimationQuery = buildEstimationQuery({ resource: 'cpu', isUnderestimation: true });
export const fetchMemoryOverestimationQuery = buildEstimationQuery({ resource: 'memory', isUnderestimation: false });
export const fetchMemoryUnderestimationQuery = buildEstimationQuery({ resource: 'memory', isUnderestimation: true });

/**
 * Generates a PromQL query string for total VM resource (CPU/Memory) estimation.
 */
export const totalVmResourceEstimationQuery = (type, estimationType) => {
  const requestMetric = metricNames.request(type) + `{cluster="${CLUSTER}"}`;
  const recommendationMetric = metricNames.recommendation(type) + `{cluster="${CLUSTER}"}`;

  const vmFilter = `max by (cluster, namespace, name) (
    kubevirt_vm_running_status_last_transition_timestamp_seconds{cluster="${CLUSTER}"} > 0
  )`;

  const divisor = type === 'memory' ? ' / 1073741824' : '';

  const requestExpr = `
    max_over_time(
      sum by (name, namespace) (
        ${requestMetric}
        + on(cluster, namespace, name) group_left(_blah) (0 * ${vmFilter})
      )[${AGGREGATION}:]
    )${divisor}
  `;

  const recommendationExpr = `
    max_over_time(
      sum by (name, namespace) (
        ${recommendationMetric}
        + on(cluster, namespace, name) group_left(_blah) (0 * ${vmFilter})
      )[${AGGREGATION}:]
    )${divisor}
  `;

  const estimationExpr = `(${requestExpr} - ${recommendationExpr})`;

  if (estimationType === 'Overestimation') {
    return `sum(floor(${estimationExpr}) > 0)`;
  } else if (estimationType === 'Underestimation') {
    return `sum(floor(${estimationExpr} < 0) * -1)`;
  }

  return null;
};

/**
 * Builds a PromQL query string for fetching a VM's metric value or estimation.
 */
export const buildVmMetricsQuery = ({ metric, namespace, vmName, type = 'value' }) => {
  const requestMetric = metricNames.request(metric);
  const recommendationMetric = metricNames.recommendation(metric);
  const divisor = metric === 'memory' ? '/1073741824' : '';

  const commonSelector = `cluster="${CLUSTER}", profile="${PROFILE}", namespace="${namespace}", name="${vmName}"`;

  let query;

  switch (type.toLowerCase()) {
    case 'overestimation':
      query = `floor(
        max_over_time(${requestMetric}{${commonSelector}}[${AGGREGATION}:])${divisor}
        -
        max_over_time(${recommendationMetric}{${commonSelector}}[${AGGREGATION}:])${divisor}
      )`;
      break;

    case 'underestimation':
      query = `
        label_join(
          (
            floor(
              (
                max_over_time(
                  sum by (name, namespace) (
                    ${requestMetric}{${commonSelector}}
                  )[${AGGREGATION}:]
                )${divisor}
                -
                max_over_time(
                  sum by (name, namespace) (
                    ${recommendationMetric}{${commonSelector}}
                  )[${AGGREGATION}:]
                )${divisor}
              )
            ) * (-1)
          ),
          "name_namespace", "-", "name", "namespace"
        )`;
      break;

    default:
      query = `max_over_time(
        acm_rs_vm:namespace:${metric}{
          ${commonSelector}
        }[${AGGREGATION}:]
      )`;
  }

  return query;
};
