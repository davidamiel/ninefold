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
  webServer: {command: 'python3 -m http.server 8768 --bind 127.0.0.1 --directory out', url: 'http://127.0.0.1:8768', reuseExistingServer: !process.env.CI},
});
