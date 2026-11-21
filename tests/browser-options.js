import { existsSync } from 'node:fs';

// An explicit override wins; otherwise support both local Chrome and Playwright's browser.
export const browserLaunchOptions = {
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    (!process.env.CI && existsSync('/usr/bin/google-chrome')
      ? '/usr/bin/google-chrome'
      : undefined),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
};
