#!/usr/bin/env node
import { runCli } from '../dist/cli.js';
const args = process.argv.slice(2);
try {
  if (args[0] === 'demo') {
    process.exitCode = await (await import('./demo.mjs')).runDemo(args.slice(1));
  } else {
    if (args.includes('--help') || args.includes('-h')) {
      console.log('Installed commands: pan-agent configure | pan-agent demo [--directory NEW_DIRECTORY]');
      console.log('Start: pan-agent --kernel native --workspace PATH --memory-root PATH');
    }
    process.exitCode = await runCli(args);
  }
} catch (error) {
  console.error(`Pan failed: ${error.code ?? error.name ?? 'error'}${args[0] === 'demo' ? ' (demo requires a new writable directory)' : ''}`);
  process.exitCode = 1;
}
