#!/usr/bin/env node
import { runCli } from '../dist/cli.js';
const args = process.argv.slice(2);
try {
  if (args[0] === 'demo') {
    process.exitCode = await (await import('./demo.mjs')).runDemo(args.slice(1));
  } else {
    if (args.includes('--help') || args.includes('-h')) {
      console.log('Installed commands: pan-agent configure | pan-agent demo [--directory NEW_DIRECTORY]');
      console.log('Start: pan-agent (current directory; archives in ~/.pan-agent/archives)');
    }
    // Product launcher selects its sole supported kernel; library callers remain explicit.
    const subcommand = ['configure', 'retrieval', 'sandbox', 'loop', 'goal', 'execution'].includes(args[0]);
    process.exitCode = await runCli(subcommand || args.includes('--kernel') ? args : ['--kernel', 'native', ...args]);
  }
} catch (error) {
  console.error(`Pan failed: ${error.code ?? error.name ?? 'error'}${args[0] === 'demo' ? ' (demo requires a new writable directory)' : ''}`);
  process.exitCode = 1;
}
