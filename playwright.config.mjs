import {defineConfig, devices} from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  workers: 1,
  use: {baseURL: 'http://127.0.0.1:8768', serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome']}},
    {name: 'mobile-webkit', use: {...devices['iPhone 13']}},
  ],
  webServer: {command: 'python3 scripts/serve_browser_tests.py', url: 'http://127.0.0.1:8768', reuseExistingServer: !process.env.CI, stdout: 'ignore', stderr: 'ignore'},
});
