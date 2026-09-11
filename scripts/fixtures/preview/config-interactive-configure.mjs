/** #52 Human demo phase 1: configure through the real installed CLI; Keychain writes are pinned to the disposable test item. */
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,home,account]=process.argv.slice(2);
if(!product||!home||!account)throw new Error('usage: config-interactive-configure.mjs INSTALLED_PACKAGE SETTINGS_HOME TEST_ACCOUNT');
const {runCli}=await import(pathToFileURL(join(product,'dist/index.js')));
const code=await runCli(['configure'],{keychainReference:{service:'com.pym96.pan-agent.workorder-52-test',account},home});
process.exit(code);
