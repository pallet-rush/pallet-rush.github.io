// Spielstand im localStorage, mit Versionierung und Migration.
//
// GOLDENE REGEL: Ein Update darf den Spielstand NIE löschen.
// - Jede Struktur-Änderung bekommt eine neue SCHEMA-Nummer und eine Migration.
// - Vor jeder Migration wird der alte Stand als Sicherung abgelegt.
// - Ist der Stand unlesbar, wird er gesichert und nicht einfach überschrieben.
// - Unbekannte Felder (z. B. von einer neueren Version) bleiben erhalten.

const KEY = 'palletrush.save';
const BACKUP_KEY = 'palletrush.save.backup';
export const SCHEMA = 1;

export function defaultSave() {
  return {
    schema: SCHEMA,
    createdAt: Date.now(),
    level: 1,          // nächstes zu spielendes Level
    maxLevel: 1,       // höchstes freigeschaltetes Level
    coins: 0,
    levels: {},        // { [id]: { won: true, fails: 0, best: moves, stars: 1-3 } }
    boosters: {
      ramp: { unlocked: false, count: 0 },
      shuffle: { unlocked: false, count: 0 },
      crane: { unlocked: false, count: 0 },
      forklift: { unlocked: false, count: 0 },
    },
    settings: {
      sound: true,
      music: true,
      vibration: true,
      symbols: false,
      lang: null,      // null = Gerätesprache
    },
    stats: { played: 0, won: 0, lost: 0, boostersUsed: 0 },
    seenTips: {},      // bereits gezeigte Erklärungen (Mechaniken, Boni)
    daily: { last: '', streak: 0 }, // tägliche Belohnung: letzter Tag (YYYY-MM-DD), Serie
  };
}

// Migrationen: MIGRATIONS[n] hebt Schema n auf n+1.
// Beispiel für später:
//   1: (s) => { s.neuesFeld = 0; return s; },
const MIGRATIONS = {};

// Füllt fehlende Felder mit Standardwerten auf, ohne vorhandene zu überschreiben.
function fillDefaults(target, defaults) {
  for (const k of Object.keys(defaults)) {
    const dv = defaults[k];
    if (target[k] === undefined || target[k] === null && dv !== null) {
      target[k] = structuredClone(dv);
    } else if (dv && typeof dv === 'object' && !Array.isArray(dv) && typeof target[k] === 'object') {
      fillDefaults(target[k], dv);
    }
  }
  return target;
}

function storage() {
  try {
    const s = window.localStorage;
    s.setItem('__t', '1');
    s.removeItem('__t');
    return s;
  } catch {
    return null; // z. B. privater Modus: Spiel läuft, speichert aber nicht.
  }
}

export function loadSave() {
  const st = storage();
  if (!st) return defaultSave();
  const raw = st.getItem(KEY);
  if (!raw) return defaultSave();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    st.setItem(KEY + '.corrupt.' + Date.now(), raw);
    return defaultSave();
  }
  if (typeof data !== 'object' || !data) return defaultSave();
  let schema = data.schema || 1;
  if (schema < SCHEMA) {
    st.setItem(BACKUP_KEY + '.v' + schema, raw);
    while (schema < SCHEMA) {
      const m = MIGRATIONS[schema];
      if (m) data = m(data);
      schema++;
      data.schema = schema;
    }
  }
  // Neuerer Spielstand als diese Version (z. B. Rückkehr zu alter Version): nichts verwerfen.
  return fillDefaults(data, defaultSave());
}

export function writeSave(data) {
  const st = storage();
  if (!st) return;
  try {
    st.setItem(KEY, JSON.stringify(data));
  } catch {
    /* Speicher voll: nicht abstürzen */
  }
}
