/* eslint-disable import/no-unresolved, no-undef */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    gateway_smoke: {
      executor: 'constant-vus',
      vus: Number(__ENV.K6_VUS || 5),
      duration: __ENV.K6_DURATION || '45s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1200'],
  },
};

const BASE_URL = (__ENV.GATEWAY_URL || 'http://127.0.0.1:8020').replace(/\/$/, '');
const ADMIN_TOKEN = __ENV.ADMIN_DASHBOARD_TOKEN || 'local-dev-admin';

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health ok': (response) => response.status === 200,
  });

  const audit = http.get(`${BASE_URL}/admin/audit-summary`, {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  });
  check(audit, {
    'audit authorized or configured': (response) => [200, 401].includes(response.status),
  });

  sleep(1);
}
