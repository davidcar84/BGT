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
  const chronWeeks = Math.round(diffMs / (7 * 24 * 3600 * 1000));
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
