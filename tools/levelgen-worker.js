// Web Worker für tools/levelgen.js: erzeugt ein einzelnes Level (parallel auf mehreren Kernen).
import { LEVEL_PLAN, relaxPlan } from '../js/data/levelplan.js';
import { findLevel } from '../js/core/generator.js';

onmessage = (e) => {
  const { i, maxTries } = e.data; // maxStage: wie weit relaxPlan gehen darf (Standard 2)
  const t0 = performance.now();
  const opt = maxTries ? { maxTries } : undefined;
  let res = findLevel(LEVEL_PLAN[i], (i + 1) * 1000, opt);
  // Ab Level 301: klappt es nicht, automatisch etwas leichter versuchen (keine Lücken)
  for (let st = 1; !res && i >= 300 && st <= (e.data.maxStage || 2); st++) {
    res = findLevel(relaxPlan(LEVEL_PLAN[i], st), (i + 1) * 1000 + st * 100000, opt);
    if (res) res.stats.relax = st;
  }
  postMessage({ i, res, ms: Math.round(performance.now() - t0) });
};
