const db = new Dexie('BGT');

db.version(1).stores({
  babies: '++id, name, sex, birthDate, gestationalAgeWeeks',
  measurements: '++id, babyId, date, type, value, correctedAgeWeeks, chronologicalAgeWeeks'
});

// ─── Age calculations ────────────────────────────────────────
export function calcAges(birthDate, measDate, gestationalAgeWeeks) {
  const birth = new Date(birthDate + 'T00:00:00Z');
  const meas  = new Date(measDate  + 'T00:00:00Z');
  const diffMs = meas - birth;
  const chronWeeks = diffMs / (7 * 24 * 3600 * 1000); // decimal weeks for daily chart precision
  const correction = 40 - (gestationalAgeWeeks || 40);
  const corrWeeks  = chronWeeks - correction;
  return { chronWeeks, corrWeeks, isPreterm: gestationalAgeWeeks < 37 };
}

export function shouldUseCorrection(correctedAgeWeeks) {
  // WHO recommends using corrected age until 24 months (≈ 104 weeks) corrected
  return correctedAgeWeeks <= 104;
}

// ─── CRUD: babies ────────────────────────────────────────────
export async function getBabies() {
  return db.babies.toArray();
}

export async function getBaby(id) {
  return db.babies.get(id);
}

export async function saveBaby(data) {
  if (data.id) {
    await db.babies.update(data.id, data);
    return data.id;
  } else {
    return db.babies.add(data);
  }
}

export async function deleteBaby(id) {
  await db.measurements.where('babyId').equals(id).delete();
  await db.babies.delete(id);
}

// ─── CRUD: measurements ──────────────────────────────────────
export async function getMeasurements(babyId) {
  return db.measurements
    .where('babyId').equals(babyId)
    .sortBy('date');
}

export async function addMeasurement(data) {
  return db.measurements.add(data);
}

export async function updateMeasurement(id, data) {
  return db.measurements.update(id, data);
}

export async function deleteMeasurement(id) {
  return db.measurements.delete(id);
}

// ─── Migration: recalculate decimal age weeks ────────────────
// Runs once after the switch from Math.round to decimal calcAges.
// Guards with localStorage so it never runs again.
export async function migrateDecimalWeeks() {
  const FLAG = 'bgt_migrated_decimal_weeks_v1';
  if (localStorage.getItem(FLAG)) return 0;

  const babies = await db.babies.toArray();
  if (!babies.length) { localStorage.setItem(FLAG, '1'); return 0; }

  const babyMap = Object.fromEntries(babies.map(b => [b.id, b]));
  const measurements = await db.measurements.toArray();

  const updates = [];
  for (const m of measurements) {
    const baby = babyMap[m.babyId];
    if (!baby) continue;
    const { chronWeeks, corrWeeks } = calcAges(baby.birthDate, m.date, baby.gestationalAgeWeeks);
    // Only queue records that still store the old rounded integer values
    if (m.correctedAgeWeeks !== corrWeeks || m.chronologicalAgeWeeks !== chronWeeks) {
      updates.push({ id: m.id, correctedAgeWeeks: corrWeeks, chronologicalAgeWeeks: chronWeeks });
    }
  }

  await db.transaction('rw', db.measurements, async () => {
    for (const u of updates) {
      await db.measurements.update(u.id, {
        correctedAgeWeeks: u.correctedAgeWeeks,
        chronologicalAgeWeeks: u.chronologicalAgeWeeks,
      });
    }
  });

  localStorage.setItem(FLAG, '1');
  return updates.length;
}

// ─── Export / Import ─────────────────────────────────────────
export async function exportAll() {
  const babies = await db.babies.toArray();
  const measurements = await db.measurements.toArray();
  return { version: '1.0', exportDate: new Date().toISOString(), babies, measurements };
}

export async function importAll(data) {
  await db.babies.clear();
  await db.measurements.clear();
  if (data.babies?.length)       await db.babies.bulkAdd(data.babies);
  if (data.measurements?.length) await db.measurements.bulkAdd(data.measurements);
}

export async function clearAll() {
  await db.babies.clear();
  await db.measurements.clear();
}

export default db;
