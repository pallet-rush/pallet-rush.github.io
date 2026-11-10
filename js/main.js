// Einstieg: verbindet Spielstand, Menüs, Spiellogik und Darstellung.

import { VERSION } from './version.js';
import { LEVELS } from './data/levels.js';
import { Game } from './core/model.js';
import { GameView } from './render/view.js';
import { loadSave, writeSave } from './save.js';
import { t, setLang, detectLang, applyTexts, getLang } from './i18n.js';
import { sfx, vibrate, unlockAudio, configureAudio, suspendAudio } from './audio.js';
import { LiveLink, newCode, validCode } from './net/live.js';

// Bonus-Items: Freischalt-Level und Münzpreis (siehe DESIGN.md).
export const BOOSTERS = [
  { key: 'ramp', unlock: 10, price: 250 },
  { key: 'shuffle', unlock: 20, price: 200 },
  { key: 'crane', unlock: 30, price: 300 },
  { key: 'forklift', unlock: 40, price: 400 },
];
// Erstes Level jeder neuen Mechanik
const MECH_INTRO = { 11: 'hidden', 21: 'gate', 31: 'barrier', 41: 'rush', 51: 'trailer', 61: 'chain', 71: 'covered', 81: 'turntable', 91: 'master' };
const REWARD = { win: 50, firstTry: 25, replay: 10 };
// Schwierigkeit: folgt dem Levelplan (js/data/levelplan.js): Das 10. Level jeder Welt
// ist ein Boss-Level (am wenigsten Spielraum), das 6. ist knackig. Schwere Level geben mehr Münzen.
const DIFF_MULT = { normal: 1, hard: 1.5, vhard: 2 };
export function difficulty(n) {
  if (n >= 20 && n % 10 === 0) return 'vhard';
  if (n === 10 || (n > 10 && n % 10 === 6)) return 'hard';
  return 'normal';
}
const diffBadge = (d) => (d === 'normal' ? '' : `<span class="diff-badge ${d}">${t(d)}</span>`);
const DEV = new URLSearchParams(location.search).has('dev');

const $ = (s) => document.querySelector(s);

// iOS-Homescreen-App: Dort ist der Bereich für feste Elemente (position: fixed,
// 100dvh) teils um die Statusleiste kürzer als der Bildschirm; unten bleibt dann
// ein Streifen. Wir messen die echte Höhe eines festen Elements, vergleichen sie
// mit Fenster- und Bildschirmhöhe und gleichen die Lücke per CSS-Variablen aus.
let vgap = 0;
let appH = window.innerHeight;
const vpProbe = document.createElement('div');
vpProbe.style.cssText = 'position:fixed;left:0;top:0;bottom:0;width:1px;visibility:hidden;pointer-events:none';
document.documentElement.appendChild(vpProbe);
const vpDiag = {};
function fixViewportGap() {
  // Homescreen-App: je nach iOS-Version „standalone“ oder „fullscreen“ (Manifest)
  const mode = ['fullscreen', 'standalone', 'minimal-ui'].find((m) => window.matchMedia?.(`(display-mode: ${m})`).matches) || 'browser';
  const standalone = navigator.standalone === true || mode !== 'browser';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const portrait = window.innerHeight >= window.innerWidth;
  const fixedH = vpProbe.getBoundingClientRect().height || window.innerHeight;
  let full = Math.max(fixedH, window.innerHeight);
  if (standalone && ios && portrait) full = Math.max(full, Math.max(screen.height, screen.width));
  const gap = full - fixedH;
  vgap = gap > 0 && gap < 120 ? Math.round(gap) : 0;
  appH = fixedH + vgap;
  Object.assign(vpDiag, {
    mode, ns: navigator.standalone, ios, w: window.innerWidth, ih: window.innerHeight, fix: Math.round(fixedH),
    vv: Math.round(window.visualViewport?.height || 0), ch: document.documentElement.clientHeight,
    sh: screen.height, gap: vgap,
  });
  const st = document.documentElement.style;
  st.setProperty('--vgap', vgap + 'px');
  st.setProperty('--app-h', appH + 'px');
}
fixViewportGap();
window.addEventListener('resize', fixViewportGap);

// Hoch- oder Querformat: der Spieler dreht einfach das Gerät.
// Im Querformat liegt der Hof rechts neben der Fabrik, die Boni stehen am rechten Rand.
const isLand = () => window.innerWidth > window.innerHeight * 1.15;
function applyOrient() {
  document.body.classList.toggle('land', isLand());
}
applyOrient();
window.addEventListener('resize', applyOrient);
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
  + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
document.documentElement.appendChild(safeProbe);
function safeArea() {
  const cs = getComputedStyle(safeProbe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
const refit = () => { const old = vgap; fixViewportGap(); if (old !== vgap) { window.__prView?.resize(); if (typeof game !== 'undefined' && game) measureInsets(); } };
window.addEventListener('orientationchange', () => setTimeout(refit, 300));
window.addEventListener('pageshow', () => setTimeout(refit, 50));
setTimeout(refit, 600);
setTimeout(refit, 2000);

let save = loadSave();
setLang(save.settings.lang || detectLang());
configureAudio(save.settings);

const view = new GameView($('#game'), {
  onTap: handleTap,
  onDockTap: handleDockTap,
  onWon: handleWon,
  onLost: handleLost,
  onRampsChanged: updateWarn,
  onDepart: () => { updateProgress(); updateGuide(); },
});
window.__prView = view;

let game = null;
let levelNo = 1;
let hintShown = false;
let warnOn = false;
let pending = false; // Bonus wartet auf Ende der Animationen
let selecting = null; // 'crane' | 'forklift'
let attempt = 1;      // Versuch im aktuellen Level (für Sterne)
let usedBoosters = 0; // eingesetzte Boni im aktuellen Versuch (für Sterne)
// Duell: { level, opp: { n, t, m, code } | null, t0, time, timer }
let duel = null;
// Live-Duell: { link, code, host, opp: { n, max }, round, ready, myTime, oppTime, oppProg, over, countdown }
let live = null;

// ---------- Menü ----------
function showMenu() {
  if (game) fadeScreen();
  game = null;
  endDuel();
  hideBanner();
  view.setInsets(0, 0);
  view.setGame(null);
  $('#menu').classList.remove('hidden');
  $('#hud').classList.add('hidden');
  $('#boosters').classList.add('hidden');
  $('#warn').classList.add('hidden');
  hideToast();
  hideModal();
  refreshMenu();
}

function refreshMenu() {
  applyTexts();
  $('#menu-coins').textContent = save.coins;
  $('#play-level').textContent = `${t('level')} ${Math.min(save.level, LEVELS.length)}`;
  $('#version').textContent = 'v' + VERSION;
}

// ---------- Level ----------
function startLevel(n) {
  hideModal();
  hideToast();
  if (n > LEVELS.length) {
    showDialog({ title: '🎉', text: t('allDone'), actions: [{ label: t('menu'), cls: 'primary', fn: showMenu }] });
    return;
  }
  if (!game) fadeScreen();
  attempt = n === levelNo && game && game.status !== 'won' ? attempt + 1 : 1;
  usedBoosters = 0;
  levelNo = n;
  game = new Game(LEVELS[n - 1]);
  pending = false;
  setSelecting(null);
  $('#menu').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#boosters').classList.remove('hidden');
  document.body.classList.toggle('duel-mode', !!duel);
  $('#hud-duel').classList.toggle('hidden', !duel);
  if (duel && !(duel.live && duel.t0)) resetDuelClock();
  setHudLevel();
  updateCoins();
  refreshBoosters();
  measureInsets();
  view.setGame(game, { symbols: save.settings.symbols });
  updateGuide();
  warnOn = false;
  $('#warn').classList.add('hidden');
  save.stats.played++;
  writeSave(save);
  hintShown = false;
  updateProgress();
  if (duel?.live) return;
  showIntros(n);
}

function setHudLevel() {
  const d = difficulty(levelNo);
  const el = $('#hud-level');
  el.className = 'hud-level ' + d;
  el.innerHTML = duel
    ? `<span class="duel-tag">${t('duelHud')}</span>${t('level')} ${levelNo}`
    : `${d === 'normal' ? '' : `<span class="lv-diff ${d}"></span>`}${t('level')} ${levelNo}`;
  el.title = d === 'normal' ? '' : t(d);
}

// Fortschritt: abgefahrene LKWs / alle LKWs (nur lesend aus Spiel und Ansicht)
let progShown = -1;
function updateProgress() {
  if (!game) return;
  const total = game.trucks.length || 1;
  const done = Math.min(total, view.departedShown());
  const pct = Math.round((done / total) * 100);
  const bar = $('#hud-progress');
  bar.setAttribute('aria-valuenow', pct);
  bar.firstElementChild.style.width = pct + '%';
  bar.classList.toggle('full', done >= total);
  if (done > progShown && progShown >= 0) {
    bar.classList.remove('tick');
    void bar.offsetWidth;
    bar.classList.add('tick');
  }
  progShown = done;
  if (duel?.live && live?.link) live.link.send({ type: 'prog', done, total, st: game.status });
}

// Animiertes „Level N“-Banner beim Start
let bannerTimer = null;
function showBanner(n) {
  const d = difficulty(n);
  const el = $('#level-banner');
  el.className = 'level-banner ' + d;
  el.innerHTML = `<div class="lb-inner"><b>${t('level')} ${n}</b>${d === 'normal' ? '' : `<span class="lb-diff">${t(d)}</span><small>${t('hardBonus')} <span class="coin small"></span>×${DIFF_MULT[d]}</small>`}</div>`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, d === 'normal' ? 1500 : 2200);
  if (d !== 'normal') sfx.warn();
}
function hideBanner() {
  clearTimeout(bannerTimer);
  const el = $('#level-banner');
  if (el.classList.contains('hidden') || el.classList.contains('out')) return;
  el.classList.add('out');
  bannerTimer = setTimeout(() => el.classList.add('hidden'), 260);
}

// Kurze Überblendung beim Wechsel Menü <-> Spiel
function fadeScreen() {
  const f = $('#fader');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

// Erklärfenster: neue Mechanik, neuer Bonus (jeweils nur einmal).
function showIntros(n) {
  const queue = [];
  const mech = MECH_INTRO[n];
  if (mech && !save.seenTips['m_' + mech]) queue.push({ key: 'm_' + mech, title: t('newMech'), text: t('mech_' + mech) });
  for (const b of BOOSTERS) {
    if (b.unlock === n && !save.seenTips['b_' + b.key]) {
      queue.push({ key: 'b_' + b.key, title: t('boosterNew'), text: `${t('bdesc_' + b.key)}`, extra: `<img class="reward-ico" src="assets/boosters/${b.key}.png" alt=""><div class="reward">${t('booster_' + b.key)} <small>${t('boosterFree')}</small></div>` });
    }
  }
  const next = () => {
    const tip = queue.shift();
    if (!tip) {
      hideModal();
      if (levelNo !== n || !game) return;
      showBanner(n);
      if (n === 1) setTimeout(() => { if (game && levelNo === 1 && game.moves === 0) { hintShown = true; toast(t('tutorial1'), 4000); } }, 1300);
      return;
    }
    save.seenTips[tip.key] = true;
    writeSave(save);
    showDialog({ title: tip.title, text: tip.text, html: tip.extra || '', actions: [{ label: t('gotIt'), cls: 'primary', fn: next }] });
  };
  next();
}

function measureInsets() {
  applyOrient();
  const hud = $('#hud').getBoundingClientRect();
  const b = $('#boosters').getBoundingClientRect();
  if (isLand()) {
    const sa = safeArea();
    const right = duel ? sa.r + 6 : Math.max(0, window.innerWidth - b.left);
    view.setInsets(hud.bottom, sa.b + 4, sa.l + 4, right);
  } else {
    view.setInsets(hud.bottom, appH - b.top);
  }
}

function updateCoins() {
  $('#hud-coins').textContent = save.coins;
  $('#menu-coins').textContent = save.coins;
}

function canAct() {
  if (duel?.live && (!live || live.countdown || live.over)) return false;
  return game && game.status === 'playing' && !modalOpen() && !pending;
}

function handleTap(id) {
  if (!canAct()) return;
  unlockAudio();
  if (selecting === 'crane') {
    useCrane(id);
    return;
  }
  // Alle Buchten sichtbar belegt: LKW bleibt stehen (wie bei „Keine Rampe frei“)
  if (!view.canDispatch() && game.canExit(game.trucks[id])) {
    view.nudge(id, -1);
    sfx.noRamp();
    toast(t('noRamp'));
    return;
  }
  const res = game.tap(id);
  if (res.ok) {
    if (duel && !duel.t0) startDuelClock();
    if (hintShown) { hideToast(); hintShown = false; }
    updateGuide();
    hideBanner();
    sfx.tap();
    view.play(res.events);
    updateWarn();
    refreshBoosters();
    return;
  }
  if (res.reason === 'blocked') {
    view.nudge(id, res.blocker);
    sfx.blocked();
    vibrate(15);
  } else if (res.reason === 'locked') {
    view.nudge(id, res.key);
    sfx.blocked();
    toast(t('locked2'));
  } else if (res.reason === 'noRamp') {
    view.nudge(id, -1);
    sfx.noRamp();
    toast(t('noRamp'));
  }
}

// Tutorial-Hand in den ersten Leveln: zeigt auf den nächsten LKW der Referenzlösung
const GUIDE_LEVELS = 2;
function updateGuide() {
  view.guideId = null;
  if (!game || levelNo > GUIDE_LEVELS || game.status !== 'playing') return;
  if (save.levels[levelNo]?.won) return;
  const sol = LEVELS[levelNo - 1].sol || [];
  for (const id of sol) {
    const tr = game.trucks[id];
    if (!tr || tr.state !== 0) continue; // schon weg (nicht mehr im Hof)
    if (game.canExit(tr)) view.guideId = id;
    return;
  }
}

function handleDockTap(r) {
  if (!canAct() || selecting !== 'forklift') return;
  useForklift(r);
}

function updateWarn() {
  if (!game) return;
  const on = game.status === 'playing' && game.freeRampCount() === 1 && game.lotCount() > 0;
  const el = $('#warn');
  if (on && !warnOn) {
    const [x, y] = view.warnAnchor();
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.textContent = t('oneRamp');
    el.classList.remove('hidden', 'pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    sfx.warn();
  } else if (!on && warnOn) {
    el.classList.add('hidden');
  }
  warnOn = on;
}

function levelRecord(n) {
  if (!save.levels[n]) save.levels[n] = { won: false, fails: 0 };
  return save.levels[n];
}

function handleWon() {
  if (!game) return;
  setSelecting(null);
  if (duel) { duelWon(); return; }
  const rec = levelRecord(levelNo);
  const firstWin = !rec.won;
  const firstTry = firstWin && rec.fails === 0;
  const diff = difficulty(levelNo);
  const reward = Math.round((firstWin ? REWARD.win + (firstTry ? REWARD.firstTry : 0) : REWARD.replay) * DIFF_MULT[diff]);
  const coinsBefore = save.coins;
  rec.won = true;
  if (!rec.best || game.moves < rec.best) rec.best = game.moves;
  // Sterne: 3 = ohne Bonus und ohne Neustart, je ein Stern weniger für Bonus bzw. neuen Versuch
  const stars = Math.max(1, 3 - (usedBoosters > 0 ? 1 : 0) - (attempt > 1 ? 1 : 0));
  rec.stars = Math.max(rec.stars || 0, stars);
  save.coins += reward;
  save.stats.won++;
  if (levelNo >= save.level) save.level = levelNo + 1;
  save.maxLevel = Math.max(save.maxLevel, levelNo + 1);
  unlockBoosters();
  writeSave(save);
  $('#warn').classList.add('hidden');
  sfx.win();
  for (let k = 1; k <= stars; k++) setTimeout(() => sfx.coin(), 350 + k * 280);
  view.celebrate?.();
  updateProgress();
  showDialog({
    title: t('won'),
    cls: 'win',
    html: `<div class="win-stars">${[1, 2, 3].map((k) => `<span class="star ${k <= stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.28}s"></span>`).join('')}</div><img class="result-art" src="assets/win.png" alt=""><p>${stars < 3 ? t(usedBoosters > 0 ? 'starHintBooster' : 'starHintRetry') : t('wonText')}</p><div class="reward"><span class="coin"></span><span class="reward-num">+0</span>${firstTry ? ` <small>${t('firstTry')}</small>` : ''}${diff !== 'normal' ? ` <small class="diff-tag ${diff}">${t(diff)} ×${DIFF_MULT[diff]}</small>` : ''}</div>`,
    actions: [
      { label: t('next'), cls: 'primary pulse', fn: () => startLevel(levelNo + 1) },
      { label: t('menu'), fn: showMenu },
    ],
  });
  // Münzen zählen nach den Sternen hoch (Dialog und Münzanzeige)
  const num = $('#modal-panel .reward-num');
  setTimeout(() => {
    countUp(num, 0, reward, 900, (v) => '+' + v);
    countUp($('#hud-coins'), coinsBefore, save.coins, 900);
    countUp($('#menu-coins'), coinsBefore, save.coins, 900);
  }, 450 + stars * 280);
}

// Zahl animiert hochzählen (im Dialog mit leisem Münzklang)
function countUp(el, from, to, ms, fmt = (v) => String(v)) {
  if (!el) return;
  const t0 = performance.now();
  const loud = el.classList.contains('reward-num');
  let lastTick = 0;
  const step = (now) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (loud && now - lastTick > 120 && k < 1) { lastTick = now; sfx.coin(); }
    if (k < 1) requestAnimationFrame(step);
    else if (loud) { const r = el.parentElement; r.classList.remove('bump'); void r.offsetWidth; r.classList.add('bump'); }
  };
  requestAnimationFrame(step);
}

function handleLost(reason) {
  if (!game) return;
  setSelecting(null);
  if (duel) { duelLost(); return; }
  levelRecord(levelNo).fails++;
  save.stats.lost++;
  writeSave(save);
  $('#warn').classList.add('hidden');
  sfx.lose();
  vibrate(60);
  const text = reason === 'rush' ? t('lostRush') : reason === 'stuck' ? t('lostStuck') : t('lostText');
  // Weiterspielen mit Extra-Rampe: nur wenn alle Rampen voll waren und die Extra-Rampe noch frei ist
  const actions = [];
  const canContinue = reason !== 'rush' && reason !== 'stuck' && !game.extraUsed;
  if (canContinue) {
    const def = BOOSTERS[0];
    const st = save.boosters.ramp;
    const free = st.count > 0;
    const price = continuePrice();
    const afford = free || save.coins >= price;
    actions.push({
      html: `<span class="cont-ico"><img src="assets/boosters/ramp.png" alt=""></span><span class="cont-label">${t('continueRamp')}</span><span class="cont-price">${free ? `${t('continueFree')}` : `<span class="coin small"></span>${price}`}</span>`,
      cls: 'primary continue' + (afford ? ' pulse' : ' poor'),
      fn: () => continueWithRamp(def, free),
    });
  }
  actions.push({ label: t('restart'), cls: canContinue ? '' : 'primary', fn: () => startLevel(levelNo) });
  actions.push({ label: t('menu'), cls: 'quiet', fn: showMenu });
  showDialog({
    title: canContinue ? t('continueTitle') : reason === 'rush' ? t('lostRushTitle') : t('lost'),
    cls: 'lose',
    html: `<img class="result-art lose" src="assets/lose.png" alt=""><p>${text}</p>${canContinue ? `<p class="cont-text">${t('continueText')}</p>` : ''}`,
    actions,
  });
}

// Weiterspielen wird mit den Leveln teurer (früh günstig, später wie die Extra-Rampe)
function continuePrice() {
  return Math.min(BOOSTERS[0].price, 100 + 10 * Math.floor((levelNo - 1) / 7));
}

// Niederlage aufheben: Extra-Rampe einsetzen (Bonus-Vorrat oder Münzen) und weiterspielen
function continueWithRamp(def, free) {
  if (!game || game.extraUsed) return;
  if (!free) {
    const price = continuePrice();
    if (save.coins < price) { toast(`${t('notEnough')} (${price})`); sfx.noRamp(); return; }
    save.coins -= price;
    save.boosters.ramp.count++;
    updateCoins();
    sfx.coin();
  }
  // Fehlversuch zurücknehmen: es geht im selben Versuch weiter
  const rec = levelRecord(levelNo);
  rec.fails = Math.max(0, rec.fails - 1);
  save.stats.lost = Math.max(0, save.stats.lost - 1);
  hideModal();
  game.status = 'playing';
  const ev = game.useExtraRamp();
  if (ev) consume('ramp', ev);
}

function restartLevel() {
  if (game && game.moves > 0 && game.status === 'playing' && !duel) {
    levelRecord(levelNo).fails++;
    writeSave(save);
  }
  startLevel(levelNo);
}

// ---------- Boni ----------
function unlockBoosters() {
  for (const b of BOOSTERS) {
    const st = save.boosters[b.key];
    if (!st.unlocked && save.maxLevel >= b.unlock) {
      st.unlocked = true;
      st.count += 3;
    }
  }
}

function boosterAvailable(def) {
  return save.boosters[def.key].unlocked || DEV || levelNo >= def.unlock;
}

function refreshBoosters() {
  document.querySelectorAll('.booster').forEach((el) => {
    const def = BOOSTERS.find((b) => b.key === el.dataset.b);
    const st = save.boosters[def.key];
    const unlocked = boosterAvailable(def);
    const cnt = el.querySelector('.b-count');
    el.classList.toggle('locked', !unlocked);
    el.classList.toggle('active', selecting === def.key);
    el.classList.toggle('used', def.key === 'ramp' && !!game?.extraUsed);
    cnt.classList.toggle('price', unlocked && st.count === 0);
    if (!unlocked) cnt.textContent = `Lv ${def.unlock}`;
    else if (st.count > 0) cnt.textContent = st.count;
    else cnt.innerHTML = `<span class="coin small"></span>${def.price}`;
    el.onclick = () => onBooster(def);
  });
}

function onBooster(def) {
  unlockAudio();
  if (duel) return;
  if (!boosterAvailable(def)) {
    toast(`${t('booster_' + def.key)}: ${t('locked')} ${def.unlock}`);
    return;
  }
  if (!game || game.status !== 'playing' || pending) return;
  // Auswahl abbrechen
  if (selecting === def.key) { setSelecting(null); return; }
  // Vorbedingungen prüfen, bevor etwas bezahlt wird
  if (def.key === 'ramp' && game.extraUsed) { toast(t('onlyOnce')); return; }
  if (def.key === 'crane' && (game.freeRampCount() === 0 || !view.canDispatch())) { toast(t('noRamp')); return; }
  if (def.key === 'forklift' && !game.ramps.some((id) => id >= 0)) { toast(t('noDocked')); return; }
  const st = save.boosters[def.key];
  if (st.count > 0) { activate(def); return; }
  if (save.coins < def.price) { toast(`${t('notEnough')} (${def.price})`); sfx.noRamp(); return; }
  showDialog({
    title: t('booster_' + def.key),
    text: t('bdesc_' + def.key),
    html: `<div class="reward"><span class="coin"></span>${def.price}</div>`,
    actions: [
      { label: t('buy'), cls: 'primary', fn: () => { save.coins -= def.price; st.count++; writeSave(save); updateCoins(); sfx.coin(); hideModal(); activate(def); } },
      { label: t('cancel'), fn: hideModal },
    ],
  });
}

function activate(def) {
  if (def.key === 'crane') { setSelecting('crane'); toast(t('pickTruck'), 2500); return; }
  if (def.key === 'forklift') {
    const docked = game.ramps.map((id, r) => (id >= 0 ? r : -1)).filter((r) => r >= 0);
    if (docked.length === 1) { useForklift(docked[0]); return; }
    setSelecting('forklift');
    toast(t('pickDock'), 2500);
    return;
  }
  runWhenIdle(() => {
    const ev = def.key === 'ramp' ? game.useExtraRamp() : game.useShuffle(levelNo);
    if (ev) consume(def.key, ev);
  });
}

function useCrane(id) {
  setSelecting(null);
  runWhenIdle(() => {
    const ev = game.useCrane(id);
    if (ev) consume('crane', ev);
  });
}

function useForklift(r) {
  setSelecting(null);
  runWhenIdle(() => {
    const ev = game.useForklift(r);
    if (ev) consume('forklift', ev);
  });
}

// Bonus erst ausführen, wenn alle Animationen fertig sind (Anzeige = Logik).
function runWhenIdle(fn) {
  pending = true;
  view.whenIdle(() => {
    pending = false;
    if (game && game.status === 'playing') fn();
  });
}

function consume(key, ev) {
  save.boosters[key].count = Math.max(0, save.boosters[key].count - 1);
  save.stats.boostersUsed++;
  usedBoosters++;
  writeSave(save);
  sfx.booster();
  vibrate(20);
  view.play(ev);
  if (key === 'ramp') measureInsets();
  updateWarn();
  refreshBoosters();
}

function setSelecting(mode) {
  selecting = mode;
  view.select = mode === 'crane' ? 'truck' : mode === 'forklift' ? 'dock' : null;
  if (!mode) hideToast();
  refreshBoosters();
}

// ---------- Dialoge ----------
let modalTimer = null;
function showDialog({ title, text, html, actions = [], cls = '' }) {
  const p = $('#modal-panel');
  const m = $('#modal');
  clearTimeout(modalTimer);
  const wasOpen = !m.classList.contains('hidden') && !m.classList.contains('closing');
  p.className = 'panel ' + cls;
  p.innerHTML = `<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}${html || ''}<div class="actions"></div>`;
  const box = p.querySelector('.actions');
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    if (a.html) b.innerHTML = a.html; else b.textContent = a.label;
    b.onclick = () => a.fn();
    box.appendChild(b);
  }
  m.classList.remove('hidden', 'closing');
  // Dialog-Wechsel ohne Schließen: Panel kurz neu einblenden
  if (wasOpen) { void p.offsetWidth; p.classList.add('swap'); }
  p.scrollTop = 0;
}

function hideModal() {
  const m = $('#modal');
  if (m.classList.contains('hidden')) return;
  m.classList.add('closing');
  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => { m.classList.add('hidden'); m.classList.remove('closing'); }, 170);
}
function modalOpen() {
  const m = $('#modal');
  return !m.classList.contains('hidden') && !m.classList.contains('closing');
}

let toastTimer = null;
function toast(msg, ms = 1400) {
  const el = $('#toast');
  el.textContent = msg;
  const long = msg.length > 40;
  el.style.whiteSpace = long ? 'normal' : 'nowrap';
  el.style.width = long ? 'min(320px, 90vw)' : '';
  el.style.textAlign = 'center';
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast() {
  $('#toast').classList.add('hidden');
}

function showPause() {
  setSelecting(null);
  showDialog({
    title: t('pause'),
    actions: [
      { label: t('resume'), cls: 'primary', fn: hideModal },
      { label: t('restart'), fn: restartLevel },
      { label: t('settings'), fn: () => showSettings(showPause) },
      { label: t('menu'), fn: showMenu },
    ],
  });
}

function showSettings(back) {
  const s = save.settings;
  const row = (key, label, note = '') => `<div class="setting"><span>${label} ${note ? `<small>${note}</small>` : ''}</span><button class="switch ${s[key] ? 'on' : ''}" data-key="${key}"></button></div>`;
  const lang = getLang();
  showDialog({
    title: t('settings'),
    html: row('sound', t('sound')) + row('music', t('music')) + row('vibration', t('vibration'), t('vibrationNote')) + row('symbols', t('symbols'))
      + `<div class="setting"><span>${t('language')}</span><div class="seg"><button data-lang="de" class="${lang === 'de' ? 'on' : ''}">DE</button><button data-lang="en" class="${lang === 'en' ? 'on' : ''}">EN</button></div></div>`
      + `<div class="vp-diag">v${VERSION} · ${vpDiag.mode}${vpDiag.ns ? '/ns' : ''} · ${vpDiag.w}×${vpDiag.ih} · fix ${vpDiag.fix} · vv ${vpDiag.vv} · ch ${vpDiag.ch} · scr ${vpDiag.sh} · gap ${vpDiag.gap}</div>`,
    actions: [{ label: t('back'), cls: 'primary', fn: () => (back ? back() : hideModal()) }],
  });
  const p = $('#modal-panel');
  p.querySelectorAll('.switch').forEach((sw) => {
    sw.onclick = () => {
      unlockAudio();
      const k = sw.dataset.key;
      s[k] = !s[k];
      sw.classList.toggle('on', s[k]);
      writeSave(save);
      configureAudio(s);
      if (k === 'symbols') view.symbols = s.symbols;
    };
  });
  p.querySelectorAll('[data-lang]').forEach((b) => {
    b.onclick = () => {
      s.lang = b.dataset.lang;
      setLang(s.lang);
      writeSave(save);
      applyTexts();
      if (game) setHudLevel();
      refreshMenu();
      showSettings(back);
    };
  });
}

function showLevels() {
  let html = '';
  for (let w = 0; w * 10 < LEVELS.length; w++) {
    const got = Array.from({ length: 10 }, (_, k) => save.levels[w * 10 + k + 1]?.stars || 0).reduce((a, b) => a + b, 0);
    html += `<div class="world-banner" style="--wb:url('../assets/worlds/w${w + 1}.webp')"><div class="wb-text"><small>${t('world')} ${w + 1}</small><b>${t('wname' + (w + 1))}</b></div><div class="wb-stars"><span class="star on"></span>${got}/30</div></div><div class="level-grid">`;
    for (let i = w * 10 + 1; i <= Math.min(LEVELS.length, w * 10 + 10); i++) {
      const rec = save.levels[i];
      const open = DEV || i <= save.maxLevel;
      const d = difficulty(i);
      const cls = (rec?.won ? 'won' : i === save.level ? 'current' : '') + (d !== 'normal' ? ' ' + d : '');
      const st = rec?.won ? `<span class="mini-stars">${[1, 2, 3].map((k) => `<i class="${k <= (rec.stars || 1) ? 'on' : ''}"></i>`).join('')}</span>` : '';
      const badge = d !== 'normal' ? `<span class="lv-diff" title="${t(d)}"></span>` : '';
      html += `<button data-l="${i}" class="${cls.trim()}" ${open ? '' : 'disabled'} aria-label="${t('level')} ${i}${d !== 'normal' ? ' – ' + t(d) : ''}">${i}${badge}${st}</button>`;
    }
    html += '</div>';
  }
  html += `<div class="diff-legend"><span><i class="lv-diff hard"></i>${t('hard')}</span><span><i class="lv-diff vhard"></i>${t('vhard')}</span><span><span class="coin small"></span>${t('hardBonus')}</span></div>`;
  showDialog({ title: t('levels'), cls: 'levels', html, actions: [{ label: t('back'), fn: hideModal }] });
  $('#modal-panel').querySelectorAll('[data-l]').forEach((b) => {
    b.onclick = () => { unlockAudio(); goFullscreen(); endDuel(); startLevel(+b.dataset.l); };
  });
  const cur = $('#modal-panel').querySelector('.current');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

function goFullscreen() {
  const el = document.documentElement;
  if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}

// ---------- Verkabelung ----------
$('#btn-play').onclick = () => { unlockAudio(); goFullscreen(); endDuel(); startLevel(Math.min(save.level, LEVELS.length)); };
$('#btn-duel').onclick = () => { unlockAudio(); showDuelMenu(); };
$('#btn-levels').onclick = () => { unlockAudio(); showLevels(); };
$('#btn-settings').onclick = () => { unlockAudio(); showSettings(); };
$('#btn-pause').onclick = () => showPause();
$('#btn-restart').onclick = () => restartLevel();
// Ein zentraler UI-Klickton für alle Buttons (Menü, Dialoge, Pause, Levelauswahl, Boni)
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('button');
  if (!b || b.disabled) return;
  unlockAudio();
  sfx.button();
}, true);
$('#modal').addEventListener('pointerdown', (e) => e.stopPropagation());

document.addEventListener('visibilitychange', () => suspendAudio(document.hidden));
window.addEventListener('resize', () => { applyOrient(); if (game) measureInsets(); });

unlockBoosters();
writeSave(save);
showMenu();
const incomingDuel = readDuelLink();
const incomingLive = readLiveLink();
bootSplash().then(() => setTimeout(() => (incomingLive ? liveJoin(incomingLive) : incomingDuel ? showChallenge(incomingDuel) : checkDaily()), incomingDuel || incomingLive ? 250 : 700));
registerSW();

// ---------- Ladebildschirm ----------
// Wartet, bis die wichtigsten Bilder geladen sind (max. 6 s), dann sanftes Ausblenden.
function bootSplash() {
  const IMGS = ['assets/logo.png', 'assets/menu-bg3.jpg', 'assets/win.png', 'assets/lose.png',
    ...BOOSTERS.map((b) => `assets/boosters/${b.key}.png`)];
  const fill = $('#splash-fill');
  $('#splash-text').textContent = t('loading');
  let done = 0;
  const tick = () => { done++; fill.style.width = Math.round((done / IMGS.length) * 100) + '%'; };
  const load = (src) => new Promise((res) => {
    const im = new Image();
    im.onload = im.onerror = () => { tick(); res(); };
    im.src = src;
    if (im.decode) im.decode().catch(() => {});
  });
  const minTime = new Promise((r) => setTimeout(r, 650));
  const maxTime = new Promise((r) => setTimeout(r, 6000));
  return Promise.race([Promise.all([...IMGS.map(load), minTime]), maxTime]).then(() => new Promise((res) => {
    fill.style.width = '100%';
    const sp = $('#splash');
    setTimeout(() => {
      sp.classList.add('out');
      document.body.classList.remove('booting');
      setTimeout(() => { sp.remove(); res(); }, 450);
    }, 180);
  }));
}

// ---------- Offline (Service Worker) ----------
// Nur über https. Auf localhost bleibt die Entwicklung ohne Cache (außer mit ?sw zum Testen).
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has('sw')) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((ks) => ks.filter((k) => k.startsWith('pallet-rush')).forEach((k) => caches.delete(k))).catch(() => {});
    return;
  }
  if (location.protocol !== 'https:' && !local) return;
  const reg = () => navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(VERSION)).catch(() => {});
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
}

// ---------- Tägliche Belohnung ----------
const DAILY = [30, 40, 50, 60, 80, 100, 150]; // Tag 1–7 der Serie, danach bleibt es bei Tag 7
function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function checkDaily() {
  if (game || modalOpen()) return;
  const today = dayKey();
  const d = save.daily;
  if (d.last === today) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const streak = d.last === dayKey(y) ? d.streak + 1 : 1;
  const idx = Math.min(streak, DAILY.length) - 1;
  const days = DAILY.map((c, i) => `<div class="day ${i < idx ? 'done' : i === idx ? 'today' : ''}"><small>${t('day')} ${i + 1}</small><span class="coin"></span><b>${c}</b></div>`).join('');
  showDialog({
    title: t('dailyTitle'),
    html: `<p>${t('dailyText')}</p><div class="daily-row">${days}</div>`,
    actions: [{ label: `${t('collect')} +${DAILY[idx]}`, cls: 'primary', fn: () => {
      save.daily = { last: today, streak };
      save.coins += DAILY[idx];
      writeSave(save);
      sfx.coin();
      hideModal();
      refreshMenu();
      coinBurst($('#menu-coins'));
    } }],
  });
}

// Münzen fliegen von der Mitte zur Münzanzeige
function coinBurst(target) {
  const r = target.getBoundingClientRect();
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for (let i = 0; i < 10; i++) {
    const c = document.createElement('span');
    c.className = 'coin fly-coin';
    c.style.left = cx + 'px';
    c.style.top = cy + 'px';
    c.style.setProperty('--dx', (r.left + r.width / 2 - cx) + 'px');
    c.style.setProperty('--dy', (r.top + r.height / 2 - cy) + 'px');
    c.style.setProperty('--sx', ((Math.random() - 0.5) * 180) + 'px');
    c.style.setProperty('--sy', ((Math.random() - 0.5) * 180) + 'px');
    c.style.animationDelay = i * 0.05 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1500 + i * 50);
  }
  setTimeout(() => { target.parentElement.classList.remove('bump'); void target.offsetWidth; target.parentElement.classList.add('bump'); }, 900);
}

// Für Tests in der Konsole
window.__pr = { get game() { return game; }, get duel() { return duel; }, get live() { return live; }, liveHost, liveJoin, startDuel, duelCode, view, startLevel, get save() { return save; }, onBooster: (k) => onBooster(BOOSTERS.find((b) => b.key === k)) };

// ---------- Duell per Link ----------
// Ein Spieler schafft ein Level auf Zeit und schickt einen Link mit Level, Zeit, Zügen
// und Namen. Wer den Link öffnet, spielt dasselbe Level gegen diese Zeit. Kein Server nötig.
const DUEL_REWARD = 40;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (str, o) => str.replace(/\{(\w)\}/g, (_, k) => (o[k] ?? ''));

function fmtTime(ms) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m > 0 ? `${m}:${r.toFixed(1).padStart(4, '0')}` : `${r.toFixed(1)} s`;
}
function fmtClock(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function cleanNick(v) {
  return String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
}

function duelCode(l, time, moves, n) {
  const json = JSON.stringify({ v: 1, l, t: Math.round(time), m: moves, n: cleanNick(n) });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseDuelCode(code) {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const l = Number(o.l), tm = Number(o.t), m = Number(o.m);
    if (!Number.isInteger(l) || l < 1 || l > LEVELS.length) return null;
    if (!Number.isFinite(tm) || tm < 500 || tm > 3600000) return null;
    return { l, t: Math.round(tm), m: Number.isInteger(m) && m > 0 && m < 10000 ? m : 0, n: cleanNick(o.n) || '???', code: code.slice(0, 200) };
  } catch { return null; }
}

function readDuelLink() {
  const p = new URLSearchParams(location.search);
  const code = p.get('duel');
  if (code === null) return null;
  // Link aus der Adresszeile entfernen, damit ein Neuladen nicht erneut fragt
  p.delete('duel');
  const q = p.toString();
  try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch {}
  return parseDuelCode(code) || { bad: true };
}

function duelUrl(code) {
  const base = location.protocol === 'https:' || location.hostname === 'localhost' ? location.origin + location.pathname : 'https://pallet-rush.github.io/';
  return `${base}?duel=${code}`;
}

function startDuel(level, opp = null) {
  duel = { level, opp, t0: 0, time: 0, timer: 0 };
  goFullscreen();
  startLevel(level);
}

function endDuel() {
  endLive();
  if (duel) clearInterval(duel.timer);
  duel = null;
  document.body.classList.remove('duel-mode');
  $('#hud-duel').classList.add('hidden');
}

function resetDuelClock() {
  clearInterval(duel.timer);
  duel.t0 = 0;
  duel.time = 0;
  $('#hud-time').textContent = '0:00';
  $('#hud-duel').classList.remove('ahead', 'behind', 'running');
  $('#hud-opp').innerHTML = duel.opp ? `<b>${esc(duel.opp.n)}</b> ${fmtClock(duel.opp.t)}` : '';
  $('#hud-opp').classList.toggle('hidden', !duel.opp);
}

function startDuelClock() {
  duel.t0 = performance.now();
  $('#hud-duel').classList.add('running');
  const tick = () => {
    if (!duel || !duel.t0 || duel.time) return;
    const ms = performance.now() - duel.t0;
    $('#hud-time').textContent = fmtClock(ms);
    if (duel.opp) $('#hud-duel').classList.toggle('behind', ms > duel.opp.t);
  };
  tick();
  duel.timer = setInterval(tick, 200);
}

function stopDuelClock() {
  clearInterval(duel.timer);
  duel.time = duel.t0 ? performance.now() - duel.t0 : 0;
  $('#hud-duel').classList.remove('running');
  $('#hud-time').textContent = fmtTime(duel.time);
  return duel.time;
}

// Name einmalig abfragen, dann weiter
function askNick(then) {
  if (save.nick) { then(); return; }
  showDialog({
    title: t('nickTitle'),
    text: t('nickText'),
    html: `<input id="nick-input" class="nick-input" maxlength="14" autocomplete="nickname" enterkeyhint="done" placeholder="${t('nickPh')}">`,
    actions: [{ label: t('ok'), cls: 'primary', fn: () => {
      const v = cleanNick($('#nick-input').value);
      if (!v) { $('#nick-input').focus(); $('#nick-input').classList.add('shake'); return; }
      save.nick = v;
      writeSave(save);
      then();
    } }],
  });
  const inp = $('#nick-input');
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#modal-panel .btn.primary').click(); });
  setTimeout(() => inp.focus(), 200);
}

// Zufälliges Level aus den zuletzt freigeschalteten (bekannte Mechaniken)
function pickDuelLevel() {
  const hi = Math.max(1, Math.min(save.maxLevel, LEVELS.length));
  const lo = Math.max(1, hi - 14);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function showDuelMenu() {
  askNick(() => {
    showDialog({
      title: t('duelTitle'),
      cls: 'duel',
      html: `<div class="duel-art"><svg viewBox="0 0 48 48"><use href="#i-duel"/></svg></div><p>${t('liveIntro')}</p>`,
      actions: [
        { label: t('liveHost'), cls: 'primary pulse', fn: liveHost },
        { label: t('liveJoin'), fn: () => askLiveCode() },
        { label: t('timeDuel'), fn: showTimeDuel },
        { label: t('back'), cls: 'quiet', fn: hideModal },
      ],
    });
  });
}

function showChallenge(c) {
  if (c.bad) { toast(t('duelBadLink'), 2500); checkDaily(); return; }
  showDialog({
    title: t('challengeTitle'),
    cls: 'duel',
    html: `<div class="duel-art"><svg viewBox="0 0 48 48"><use href="#i-duel"/></svg></div><p>${fill(t('challengeText'), { n: `<b>${esc(c.n)}</b>`, l: c.l, t: `<b>${fmtTime(c.t)}</b>` })}</p><p class="duel-rules">${t('duelRules')}</p>`,
    actions: [
      { label: t('accept'), cls: 'primary pulse', fn: () => askNick(() => startDuel(c.l, c)) },
      { label: t('decline'), cls: 'quiet', fn: () => { hideModal(); setTimeout(checkDaily, 400); } },
    ],
  });
}

function duelWon() {
  if (duel.live) { liveWon(); return; }
  const time = stopDuelClock();
  const opp = duel.opp;
  const moves = game.moves;
  $('#warn').classList.add('hidden');
  sfx.win();
  view.celebrate?.();
  updateProgress();
  save.stats.won++;
  let title = t('duelDone'), text = t('duelDoneText'), reward = 0, cls = 'win duel';
  if (opp) {
    const diff = Math.abs(time - opp.t);
    if (Math.round(time / 100) === Math.round(opp.t / 100)) { title = t('duelTie'); text = ''; }
    else if (time < opp.t) {
      title = t('duelWin');
      text = fill(t('duelWinText'), { d: fmtTime(diff), n: esc(opp.n) });
      if (save.duels[opp.code] === undefined) reward = DUEL_REWARD;
    } else {
      title = t('duelLose');
      text = fill(t('duelLoseText'), { d: fmtTime(diff), n: esc(opp.n) });
      cls = 'duel lose-duel';
    }
    const best = save.duels[opp.code];
    save.duels[opp.code] = best === undefined ? Math.round(time) : Math.min(best, Math.round(time));
    // nur die letzten 50 Duelle merken
    const keys = Object.keys(save.duels);
    if (keys.length > 50) for (const k of keys.slice(0, keys.length - 50)) delete save.duels[k];
  }
  const coinsBefore = save.coins;
  save.coins += reward;
  writeSave(save);
  const row = (name, ms, me) => `<div class="dr ${me ? 'me' : ''}"><span>${name}</span><b>${fmtTime(ms)}</b></div>`;
  const rows = opp && time >= opp.t
    ? row(esc(opp.n), opp.t, false) + row(esc(save.nick), time, true)
    : row(esc(save.nick), time, true) + (opp ? row(esc(opp.n), opp.t, false) : '');
  showDialog({
    title,
    cls,
    html: `<div class="duel-board"><small>${t('level')} ${levelNo}</small>${rows}</div>${text ? `<p>${text}</p>` : ''}${reward ? `<div class="reward"><span class="coin"></span><span class="reward-num">+${reward}</span> <small>${t('duelReward')}</small></div>` : ''}`,
    // Verloren: zuerst „Nochmal“; sonst zuerst Herausfordern
    actions: (cls.includes('lose-duel') ? [
      { label: t('again'), cls: 'primary pulse', fn: () => startLevel(levelNo) },
      { label: t('challenge'), fn: () => shareDuel(levelNo, time, moves) },
    ] : [
      { label: opp ? t('challengeBack') : t('challenge'), cls: 'primary pulse', fn: () => shareDuel(levelNo, time, moves) },
      { label: t('again'), fn: () => startLevel(levelNo) },
    ]).concat([{ label: t('menu'), cls: 'quiet', fn: showMenu }]),
  });
  if (reward) setTimeout(() => { countUp($('#hud-coins'), coinsBefore, save.coins, 900); sfx.coin(); }, 500);
}

function duelLost() {
  if (duel.live) { liveLost(); return; }
  stopDuelClock();
  save.stats.lost++;
  writeSave(save);
  $('#warn').classList.add('hidden');
  sfx.lose();
  vibrate(60);
  showDialog({
    title: t('lost'),
    cls: 'lose',
    html: `<img class="result-art lose" src="assets/lose.png" alt=""><p>${t('duelLostText')}</p>`,
    actions: [
      { label: t('again'), cls: 'primary', fn: () => startLevel(levelNo) },
      { label: t('menu'), cls: 'quiet', fn: showMenu },
    ],
  });
}

async function shareDuel(l, time, moves) {
  const url = duelUrl(duelCode(l, time, moves, save.nick));
  const text = fill(t('shareText'), { l, t: fmtTime(time) });
  if (navigator.share) {
    try { await navigator.share({ title: 'Pallet Rush', text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast(t('linkCopied'), 2500);
    return;
  } catch {}
  // Letzte Möglichkeit: Link zum Markieren anzeigen
  const keep = $('#modal-panel .actions');
  const box = document.createElement('input');
  box.className = 'nick-input link-box';
  box.readOnly = true;
  box.value = url;
  box.setAttribute('aria-label', t('copyLink'));
  keep.parentElement.insertBefore(box, keep);
  box.focus();
  box.select();
}

function showTimeDuel() {
  showDialog({
    title: t('duelTitle'),
    cls: 'duel',
    html: `<p>${t('duelIntro')}</p><p class="duel-rules">${t('duelRules')}</p>`,
    actions: [
      { label: t('duelStart'), cls: 'primary pulse', fn: () => startDuel(pickDuelLevel()) },
      { label: t('back'), cls: 'quiet', fn: showDuelMenu },
    ],
  });
}

// ---------- Live-Duell (Echtzeit) ----------
// Beide spielen gleichzeitig dasselbe Level; jeder sieht den Fortschritt des anderen.
// Wer zuerst fertig ist, gewinnt. Verlieren (alle Rampen voll) kostet nur Zeit: neu starten.
const LIVE_REWARD = 30;
const oppName = () => esc(live?.opp?.n || '???');

function readLiveLink() {
  const p = new URLSearchParams(location.search);
  const code = (p.get('live') || '').toUpperCase();
  if (!p.has('live')) return null;
  p.delete('live');
  const q = p.toString();
  try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch {}
  return validCode(code) ? code : null;
}

function liveUrl(code) {
  const base = location.protocol === 'https:' || location.hostname === 'localhost' ? location.origin + location.pathname : 'https://pallet-rush.github.io/';
  return `${base}?live=${code}`;
}

function endLive() {
  if (!live) return;
  const l = live;
  live = null;
  clearTimeout(l.cdTimer);
  $('#countdown').classList.add('hidden');
  try { l.link?.send({ type: 'bye' }); } catch {}
  l.link?.close();
}

function newLive(host, code) {
  endLive();
  live = { host, code, link: null, opp: null, round: 0, ready: {}, myTime: null, oppTime: null, oppProg: null, over: false, countdown: false };
  const me = live;
  me.link = new LiveLink({
    onOpen: () => { if (live === me) me.link.send({ type: 'hello', n: save.nick, max: save.maxLevel, v: VERSION }); },
    onMessage: (m) => { if (live === me) onLiveMsg(m); },
    onClose: (reason) => { if (live === me) liveGone(reason); },
  });
  return me;
}

function liveHost() {
  askNick(async () => {
    let me = null;
    for (let tries = 0; tries < 3; tries++) {
      me = newLive(true, newCode());
      showLiveRoom();
      try { await me.link.host(me.code); break; }
      catch (e) {
        if (live !== me) return;
        if (e.message === 'taken' && tries < 2) continue;
        liveGone('net');
        return;
      }
    }
    if (live === me) { me.waiting = true; showLiveRoom(); }
  });
}

function showLiveRoom() {
  if (!live) return;
  const code = live.code;
  showDialog({
    title: t('liveTitle'),
    cls: 'duel live',
    html: `<p>${t('liveCodeText')}</p><div class="live-code">${code.split('').map((c) => `<span>${c}</span>`).join('')}</div>`
      + `<p class="live-status"><i class="live-dot"></i>${live.opp ? fill(t('liveConnected'), { n: oppName() }) : live.waiting ? t('liveWaiting') : t('liveConnecting')}</p>`,
    actions: [
      { label: t('liveShare'), cls: 'primary', fn: () => shareLive(code) },
      { label: t('cancel'), cls: 'quiet', fn: () => { endLive(); hideModal(); } },
    ],
  });
}

async function shareLive(code) {
  const url = liveUrl(code);
  const text = fill(t('liveShareText'), { c: code });
  if (navigator.share) {
    try { await navigator.share({ title: 'Pallet Rush', text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast(t('linkCopied'), 2500); } catch { toast(url, 4000); }
}

function askLiveCode(prefill = '') {
  askNick(() => {
    showDialog({
      title: t('liveJoin'),
      html: `<input id="live-input" class="nick-input live-input" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="${t('liveEnterCode')}" value="${esc(prefill)}">`,
      actions: [
        { label: t('liveJoinBtn'), cls: 'primary', fn: () => {
          const inp = $('#live-input');
          const c = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (!validCode(c)) { inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.focus(); return; }
          liveJoin(c);
        } },
        { label: t('back'), cls: 'quiet', fn: showDuelMenu },
      ],
    });
    const inp = $('#live-input');
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#modal-panel .btn.primary').click(); });
    setTimeout(() => inp.focus(), 200);
  });
}

function liveJoin(code) {
  askNick(async () => {
    const me = newLive(false, code);
    showDialog({
      title: t('liveTitle'),
      cls: 'duel live',
      html: `<div class="live-code small">${code.split('').map((c) => `<span>${c}</span>`).join('')}</div><p class="live-status"><i class="live-dot"></i>${t('liveConnecting')}</p>`,
      actions: [{ label: t('cancel'), cls: 'quiet', fn: () => { endLive(); hideModal(); } }],
    });
    try { await me.link.join(code); }
    catch { if (live === me) liveGone('net'); }
  });
}

function onLiveMsg(m) {
  switch (m.type) {
    case 'hello': {
      live.opp = { n: cleanNick(m.n) || '???', max: Math.max(1, Math.min(LEVELS.length, m.max | 0 || 1)) };
      if (live.host) { showLiveRoom(); setTimeout(() => { if (live && live.host && !live.round) liveStartRound(); }, 900); }
      else {
        const st = $('#modal-panel .live-status');
        if (st) st.innerHTML = `<i class="live-dot on"></i>${fill(t('liveConnected'), { n: oppName() })}`;
      }
      break;
    }
    case 'start':
      if (!live.host && Number.isInteger(m.level) && m.level >= 1 && m.level <= LEVELS.length) beginLiveRound(m.level, m.round | 0);
      break;
    case 'prog': {
      const was = live.oppProg;
      live.oppProg = { done: m.done | 0, total: m.total | 0, st: String(m.st || '') };
      if (was && m.done === 0 && was.done > 0 && duel?.live && !live.over) toast(fill(t('liveOppRestart'), { n: oppName() }), 1300);
      updateLiveHud();
      break;
    }
    case 'won':
      if (typeof m.t === 'number' && m.round === live.round) { live.oppTime = m.t; resolveLive(); }
      break;
    case 'rematch':
      live.ready.opp = true;
      if (live.host && live.ready.me) liveStartRound();
      else if (live.over) {
        const st = $('#modal-panel .live-status');
        if (st) st.innerHTML = `<i class="live-dot on"></i>${fill(t('liveRematchAsk'), { n: oppName() })}`;
      }
      break;
    case 'bye':
      liveGone('left');
      break;
    default: break;
  }
}

// Gastgeber wählt ein Level, das beide schon kennen
function liveStartRound() {
  if (!live || !live.host) return;
  const hi = Math.max(1, Math.min(save.maxLevel, live.opp?.max || 1, LEVELS.length));
  const lo = Math.max(1, hi - 14);
  const level = lo + Math.floor(Math.random() * (hi - lo + 1));
  const round = live.round + 1;
  live.link.send({ type: 'start', level, round });
  beginLiveRound(level, round);
}

function beginLiveRound(level, round) {
  if (duel) clearInterval(duel.timer);
  Object.assign(live, { round, ready: {}, myTime: null, oppTime: null, oppProg: { done: 0, total: 0, st: 'playing' }, over: false, rewarded: false });
  duel = { level, opp: null, live: true, t0: 0, time: 0, timer: 0 };
  hideModal();
  goFullscreen();
  startLevel(level);
  updateLiveHud();
  runCountdown();
}

function runCountdown() {
  const el = $('#countdown');
  live.countdown = true;
  const steps = ['3', '2', '1', t('liveGo')];
  let i = 0;
  const me = live;
  const step = () => {
    if (live !== me) return;
    if (i >= steps.length) { el.classList.add('hidden'); return; }
    el.textContent = steps[i];
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth;
    el.classList.add('pop');
    if (i < 3) sfx.tap(); else { sfx.start?.(); live.countdown = false; startDuelClock(); }
    i++;
    me.cdTimer = setTimeout(step, i === steps.length ? 600 : 800);
  };
  step();
}

function updateLiveHud() {
  if (!live || !duel?.live) return;
  const p = live.oppProg || { done: 0, total: 0 };
  const total = p.total || game?.trucks.length || 1;
  const pct = Math.round((Math.min(p.done, total) / total) * 100);
  const el = $('#hud-opp');
  el.classList.remove('hidden');
  el.innerHTML = `<b>${oppName()}</b><span class="opp-bar"><i style="width:${pct}%"></i></span><span class="opp-num">${Math.min(p.done, total)}/${total}</span>`;
}

function liveWon() {
  const time = stopDuelClock();
  live.myTime = time;
  live.link.send({ type: 'won', t: time, round: live.round });
  $('#warn').classList.add('hidden');
  sfx.win();
  view.celebrate?.();
  updateProgress();
  resolveLive();
}

function liveLost() {
  // Uhr läuft weiter: schnell neu starten
  $('#warn').classList.add('hidden');
  sfx.lose();
  vibrate(60);
  showDialog({
    title: t('lost'),
    cls: 'lose',
    html: `<p>${t('liveLostText')}</p>`,
    actions: [
      { label: t('liveRestart'), cls: 'primary pulse', fn: () => startLevel(levelNo) },
      { label: t('menu'), cls: 'quiet', fn: showMenu },
    ],
  });
}

// Ergebnis: kleinere Zeit gewinnt (beide Seiten rechnen gleich)
function resolveLive() {
  if (!live) return;
  const me = live.myTime, opp = live.oppTime;
  let result = null;
  if (me != null && (opp == null || me <= opp)) result = 'win';
  else if (opp != null && (me == null || opp < me)) result = 'lose';
  if (!result || live.shown === result + live.round) return;
  live.shown = result + live.round;
  live.over = true;
  if (result === 'lose' && me == null) {
    // Gegner ist schon im Ziel: eigenes Spiel anhalten
    stopDuelClock();
    setSelecting(null);
    sfx.lose();
  }
  let reward = 0;
  if (result === 'win' && !live.rewarded) {
    live.rewarded = true;
    reward = LIVE_REWARD;
    save.coins += reward;
    save.stats.won++;
    writeSave(save);
    updateCoins();
  }
  const row = (name, ms, isMe) => `<div class="dr ${isMe ? 'me' : ''}"><span>${name}</span><b>${ms != null ? fmtTime(ms) : `<small>${t('liveOppPlaying')}</small>`}</b></div>`;
  const rows = result === 'win'
    ? row(esc(save.nick), me, true) + row(oppName(), opp, false)
    : row(oppName(), opp, false) + row(esc(save.nick), me, true);
  showDialog({
    title: result === 'win' ? t('liveWin') : fill(t('liveLose'), { n: oppName() }),
    cls: result === 'win' ? 'win duel' : 'duel lose-duel',
    html: `<div class="duel-board"><small>${t('level')} ${levelNo}</small>${rows}</div>`
      + (reward ? `<div class="reward"><span class="coin"></span><span class="reward-num">+${reward}</span> <small>${t('duelReward')}</small></div>` : '')
      + `<p class="live-status"><i class="live-dot on"></i>${live.ready.opp ? fill(t('liveRematchAsk'), { n: oppName() }) : '&nbsp;'}</p>`,
    actions: [
      { label: t('liveRematch'), cls: 'primary pulse', fn: liveRematch },
      { label: t('menu'), cls: 'quiet', fn: showMenu },
    ],
  });
}

function liveRematch() {
  if (!live) return;
  live.ready.me = true;
  live.link.send({ type: 'rematch' });
  if (live.host && live.ready.opp) { liveStartRound(); return; }
  const st = $('#modal-panel .live-status');
  if (st) st.innerHTML = `<i class="live-dot"></i>${fill(t('liveRematchWait'), { n: oppName() })}`;
  const b = $('#modal-panel .btn.primary');
  if (b) { b.disabled = true; b.classList.remove('pulse'); }
}

function liveGone(reason) {
  if (!live) return;
  const name = oppName();
  const code = live.code;
  const inGame = !!(duel?.live && game);
  const l = live;
  live = null;
  clearTimeout(l.cdTimer);
  $('#countdown').classList.add('hidden');
  l.link?.close();
  if (duel?.live) { clearInterval(duel.timer); duel.live = false; duel.t0 = 0; }
  const text = reason === 'notfound' ? fill(t('liveNotFound'), { c: code })
    : reason === 'net' ? t('liveNet')
    : reason === 'p2p' ? t('liveP2p')
    : fill(t('liveLeft'), { n: name });
  const actions = reason === 'notfound'
    ? [{ label: t('liveJoin'), cls: 'primary', fn: () => askLiveCode() }, { label: t('menu'), cls: 'quiet', fn: showMenu }]
    : [{ label: t('menu'), cls: 'primary', fn: showMenu }];
  if (inGame || reason !== 'left' || modalOpen()) showDialog({ title: t('liveGone'), cls: 'lose', html: `<p>${text}</p>`, actions });
  else toast(text, 2500);
}
