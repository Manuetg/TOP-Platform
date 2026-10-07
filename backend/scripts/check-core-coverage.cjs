'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const coverage = JSON.parse(fs.readFileSync(path.join(root, 'coverage', 'coverage-final.json'), 'utf8'));
const groups = { global: [], core: [], finance: [] };
for (const [filename, entry] of Object.entries(coverage)) {
  const relative = path.relative(root, filename).replaceAll('\\', '/');
  groups.global.push(entry);
  const match = /^src\/modules\/([^/]+)\/(domain|application)\//.exec(relative);
  if (match) groups.core.push(entry);
  if (match && match[1] === 'finance') groups.finance.push(entry);
}
function metric(entries, key) {
  const counters = entries.flatMap(entry => Object.values(entry[key]).flat());
  return { covered: counters.filter(value => value > 0).length, total: counters.length };
}
function lineMetric(entries) {
  const counters = entries.flatMap(entry => {
    const lines = new Map();
    for (const [id, hit] of Object.entries(entry.s)) {
      const line = entry.statementMap[id].start.line;
      lines.set(line, Math.max(lines.get(line) || 0, hit));
    }
    return [...lines.values()];
  });
  return { covered: counters.filter(value => value > 0).length, total: counters.length };
}
const report = {};
let failed = false;
for (const [name, entries] of Object.entries(groups)) {
  if (!entries.length) throw new Error(`No hay cobertura para ${name}; no se acepta un gate vacío.`);
  report[name] = {};
  for (const [label, key] of [['statements', 's'], ['functions', 'f'], ['branches', 'b'], ['lines', null]]) {
    const result = key ? metric(entries, key) : lineMetric(entries);
    const threshold = name === 'global' ? (label === 'branches' ? 80 : 85) : 90;
    const percentage = result.total ? result.covered * 100 / result.total : 100;
    const pass = result.covered * 100 >= threshold * result.total;
    failed ||= !pass;
    report[name][label] = { ...result, percentage, threshold, pass };
  }
}
fs.writeFileSync(path.join(root, 'coverage', 'core-quality.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failed) process.exitCode = 1;
