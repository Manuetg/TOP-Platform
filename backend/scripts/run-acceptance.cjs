const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

// Aislar aceptación del entorno de la shell antes de importar AppModule.
const result = spawnSync(process.execPath, [
  resolve(__dirname, '../node_modules/@cucumber/cucumber/bin/cucumber.js'),
  '--config', 'test/acceptance/cucumber.json', ...process.argv.slice(2),
], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
