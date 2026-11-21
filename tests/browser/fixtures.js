import { test as base, expect } from '@playwright/test';

async function configureContext(context, baseURL, realScrambler) {
  const origin = new URL(baseURL).origin;
  const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Local assets bypass interception; all external services require explicit page mocks.
  await context.route(new RegExp(`^(?!${escapedOrigin}(?:/|$))https?://`), (route) =>
    route.abort('blockedbyclient'),
  );
  if (!realScrambler) {
    // Vite appends ?worker_file&type=module in development.
    await context.route('**/src/worker.js*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `let i=0; self.onmessage=()=>self.postMessage({scramble:['U F','R BL','D L'][i++%3]});`,
      }),
    );
  }
}

export const test = base.extend({
  realScrambler: [false, { option: true }],
  offlineBackend: [
    async ({ context, baseURL, realScrambler }, use) => {
      await configureContext(context, baseURL, realScrambler);
      await use();
    },
    { auto: true },
  ],
  createContext: async ({ browser, baseURL, realScrambler }, use) => {
    const contexts = [];
    try {
      await use(async (options = {}) => {
        const context = await browser.newContext({ baseURL, ...options });
        contexts.push(context);
        await configureContext(context, options.baseURL ?? baseURL, realScrambler);
        return context;
      });
    } finally {
      // Cleanup must also run when a restore/assertion fails halfway through.
      await Promise.allSettled(contexts.map((context) => context.close()));
    }
  },
});
export { expect };
