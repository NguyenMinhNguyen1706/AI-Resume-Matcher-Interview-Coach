import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Custom SLA metrics per feature
const homepageDuration = new Trend('homepage_duration');
const threadCreationDuration = new Trend('thread_creation_duration');
const chatValidationDuration = new Trend('chat_validation_duration');
const ingestValidationDuration = new Trend('ingest_validation_duration');
const errorRate = new Rate('api_error_rate');

export const options = {
  stages: [
    { duration: '5s', target: 5 },   // Warm-up to 5 concurrent candidates
    { duration: '15s', target: 20 }, // Ramp-up to peak load (20 concurrent users)
    { duration: '15s', target: 20 }, // Maintain peak load for concurrency testing
    { duration: '5s', target: 0 },   // Cool down
  ],
  thresholds: {
    // Overall System SLAs
    http_req_failed: ['rate<0.01'],             // Total failed HTTP requests must be < 1%
    http_req_duration: ['p(95)<1000', 'p(99)<2000'], // 95% of requests within 1s, 99% within 2s
    
    // Feature-specific SLAs
    homepage_duration: ['p(95)<600'],           // Homepage SSR HTML render p95 < 600ms
    thread_creation_duration: ['p(95)<300'],    // LangGraph session allocation p95 < 300ms
    chat_validation_duration: ['p(95)<150'],    // Chat gateway validation p95 < 150ms
    ingest_validation_duration: ['p(95)<250'],  // Ingestion boundary validation p95 < 250ms
    api_error_rate: ['rate<0.01'],              // Business logic check failure rate < 1%
  },
};

const FRONTEND_URL = __ENV.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = __ENV.BACKEND_URL || 'http://localhost:2024';

// Accept both 200 (success) and 400 (expected input validation rejection) as valid responses
http.setResponseCallback(http.expectedStatuses(200, 400));

export default function () {
  // Scenario 1: Candidate visits Next.js Homepage
  group('01_Homepage_Access', () => {
    const res = http.get(`${FRONTEND_URL}/`);
    homepageDuration.add(res.timings.duration);
    
    const passed = check(res, {
      'homepage status is 200': (r) => r.status === 200,
      'homepage content has title': (r) => r.body && r.body.includes('AI Resume Matcher'),
    });
    errorRate.add(!passed);
  });

  sleep(0.2);

  // Scenario 2: Candidate initializes LangGraph Session Thread
  let threadId = null;
  group('02_LangGraph_Thread_Allocation', () => {
    const payload = JSON.stringify({});
    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const res = http.post(`${BACKEND_URL}/threads`, payload, params);
    threadCreationDuration.add(res.timings.duration);

    const passed = check(res, {
      'thread creation status is 200': (r) => r.status === 200,
      'thread response has thread_id': (r) => {
        try {
          const body = JSON.parse(r.body);
          if (body && body.thread_id) {
            threadId = body.thread_id;
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!passed);
  });

  sleep(0.2);

  // Scenario 3: Candidate sends Chat Query validation check (Empty message rejection)
  group('03_Chat_API_Boundary_Validation', () => {
    const payload = JSON.stringify({
      threadId: threadId || 'load-test-thread',
      message: '',
    });
    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const res = http.post(`${FRONTEND_URL}/api/chat`, payload, params);
    chatValidationDuration.add(res.timings.duration);

    const passed = check(res, {
      'chat validation rejects empty message with 400': (r) => r.status === 400,
      'chat validation returns expected error message': (r) =>
        r.body && r.body.includes('Message is required'),
    });
    errorRate.add(!passed);
  });

  sleep(0.2);

  // Scenario 4: Ingestion API Boundary Check (Empty form submission)
  group('04_Ingest_Boundary_Validation', () => {
    const res = http.post(`${FRONTEND_URL}/api/ingest`, { dummy: '1' });
    ingestValidationDuration.add(res.timings.duration);

    const passed = check(res, {
      'ingest validation rejects empty file submission with 400': (r) => r.status === 400,
      'ingest validation error message matches': (r) =>
        r.body && r.body.includes('No files provided'),
    });
    errorRate.add(!passed);
  });

  sleep(0.4);
}
