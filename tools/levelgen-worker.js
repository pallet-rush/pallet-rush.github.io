// Web Worker für tools/levelgen.js: erzeugt ein einzelnes Level (parallel auf mehreren Kernen).
import { LEVEL_PLAN } from '../js/data/levelplan.js';
import { findLevel } from '../js/core/generator.js';

onmessage = (e) => {
  const { i, maxTries } = e.data;
  const t0 = performance.now();
  const res = findLevel(LEVEL_PLAN[i], (i + 1) * 1000, maxTries ? { maxTries } : undefined);
  postMessage({ i, res, ms: Math.round(performance.now() - t0) });
};
