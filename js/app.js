import { t, getLang, setLang, applyDomTranslations } from './i18n.js';
import {
  getBabies, getBaby, saveBaby, deleteBaby,
  getMeasurements, addMeasurement, deleteMeasurement,
  calcAges, shouldUseCorrection,
  exportAll, importAll, clearAll
} from './db.js';
import { calcZScore } from './who-data.js';
import { renderChart, destroyChart } from './charts.js';

// ─── State ───────────────────────────────────────────────────
let activeBabyId = parseInt(localStorage.getItem('bgt_active_baby')) || null;
let currentChartType = 'weight';
let currentTab = 'babies';

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Apply saved language
  applyDomTranslations();
  updateLangUI();

  // Wire navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.tab));
  });

  // Language switch (header button)
  document.getElementById('lang-switch').addEventListener('click', () => {
    const next = getLang() === 'en' ? 'es' : 'en';
    setLang(next, fullRerender);
    updateLangUI();
  });

  // Language option buttons (settings tab)
  document.querySelectorAll('.lang-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang, fullRerender);
      updateLangUI();
    });
  });

  // Baby modal
  document.getElementById('btn-add-baby').addEventListener('click', openAddBabyModal);
  document.getElementById('baby-modal-close').addEventListener('click', closeBabyModal);
  document.getElementById('baby-form-cancel').addEventListener('click', closeBabyModal);
  document.getElementById('baby-form').addEventListener('submit', handleBabyFormSubmit);

  // Sex toggle
  document.querySelectorAll('.sex-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sex-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('baby-sex').value = btn.dataset.sex;
    });
  });

  // Measurement form
  document.getElementById('measurement-form').addEventListener('submit', handleMeasSave);
  document.getElementById('meas-date').addEventListener('change', updateAgeDisplay);
  document.getElementById('meas-date').value = todayISO();

  // Chart tabs
  document.querySelectorAll('.chart-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartType = btn.dataset.type;
      renderActiveChart();
    });
  });

  // Settings
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-import').addEventListener('change', handleImport);
  document.getElementById('btn-clear').addEventListener('click', handleClear);

  // Confirm modal
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  });
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);

  // Close modals on overlay click
  document.getElementById('baby-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('baby-modal')) closeBabyModal();
  });

  await renderBabies();
  navigateTo('babies');
});

// ─── Navigation ──────────────────────────────────────────────
function navigateTo(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (tab === 'register') renderRegisterTab();
  if (tab === 'charts')   renderChartsTab();
}

// ─── Language UI sync ────────────────────────────────────────
function updateLangUI() {
  const lang = getLang();
  document.getElementById('lang-switch').textContent = lang === 'en' ? '🇺🇸 EN' : '🇪🇸 ES';
  document.querySelectorAll('.lang-opt-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
}

function fullRerender() {
  applyDomTranslations();
  updateLangUI();
  renderBabies();
  if (currentTab === 'register') renderRegisterTab();
  if (currentTab === 'charts')   renderChartsTab();
}

// ─── Babies Tab ──────────────────────────────────────────────
async function renderBabies() {
  const babies = await getBabies();
  const list = document.getElementById('babies-list');
  list.innerHTML = '';

  if (!babies.length) {
    list.innerHTML = `<p class="empty-msg">${t('babies_empty')}</p>`;
    return;
  }

  for (const baby of babies) {
    const card = buildBabyCard(baby);
    list.appendChild(card);
  }
}

function buildBabyCard(baby) {
  const card = document.createElement('div');
  card.className = 'baby-card' + (baby.id === activeBabyId ? ' selected' : '');
  card.dataset.id = baby.id;

  const isPreterm = baby.gestationalAgeWeeks < 37;
  const avatarClass = baby.sex === 'female' ? 'baby-avatar--female' : 'baby-avatar--male';
  const emoji = baby.sex === 'female' ? '👧' : '👦';
  const ageDays = Math.floor((Date.now() - new Date(baby.birthDate + 'T00:00:00Z').getTime()) / 86400000);
  const ageText = ageDays < 30
    ? `${ageDays}d`
    : ageDays < 365
      ? `${Math.floor(ageDays/30)}m ${ageDays % 30}d`
      : `${Math.floor(ageDays/365)}y ${Math.floor((ageDays%365)/30)}m`;

  card.innerHTML = `
    <div class="baby-avatar ${avatarClass}">${emoji}</div>
    <div class="baby-info">
      <div class="baby-name">${escHtml(baby.name)} ${isPreterm ? `<span class="badge badge--preterm">${t('baby_badge_preterm')}</span>` : ''}</div>
      <div class="baby-meta">${ageText} · ${baby.sex === 'female' ? t('baby_form_sex_female') : t('baby_form_sex_male')} · GA ${baby.gestationalAgeWeeks}w</div>
    </div>
    <div class="baby-actions">
      <button class="btn-edit" data-id="${baby.id}">${t('btn_edit')}</button>
      <button class="btn-del" data-id="${baby.id}">${t('btn_delete')}</button>
    </div>
  `;

  // Select on card body click
  card.addEventListener('click', e => {
    if (e.target.closest('.baby-actions')) return;
    activeBabyId = baby.id;
    localStorage.setItem('bgt_active_baby', activeBabyId);
    document.querySelectorAll('.baby-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
  });

  card.querySelector('.btn-edit').addEventListener('click', e => {
    e.stopPropagation();
    openEditBabyModal(baby);
  });

  card.querySelector('.btn-del').addEventListener('click', e => {
    e.stopPropagation();
    confirm(t('baby_delete_confirm'), async () => {
      await deleteBaby(baby.id);
      if (activeBabyId === baby.id) {
        activeBabyId = null;
        localStorage.removeItem('bgt_active_baby');
      }
      await renderBabies();
    });
  });

  return card;
}

// ─── Baby Modal ──────────────────────────────────────────────
function openAddBabyModal() {
  document.getElementById('baby-modal-title').textContent = t('baby_form_title_add');
  document.getElementById('baby-id').value = '';
  document.getElementById('baby-name').value = '';
  document.getElementById('baby-dob').value = '';
  document.getElementById('baby-ga').value = '40';
  document.getElementById('baby-notes').value = '';
  document.getElementById('baby-sex').value = 'male';
  document.querySelectorAll('.sex-btn').forEach(b => b.classList.toggle('active', b.dataset.sex === 'male'));
  document.getElementById('baby-error').style.display = 'none';
  document.getElementById('baby-modal').classList.add('open');
}

function openEditBabyModal(baby) {
  document.getElementById('baby-modal-title').textContent = t('baby_form_title_edit');
  document.getElementById('baby-id').value = baby.id;
  document.getElementById('baby-name').value = baby.name;
  document.getElementById('baby-dob').value = baby.birthDate;
  document.getElementById('baby-ga').value = baby.gestationalAgeWeeks;
  document.getElementById('baby-notes').value = baby.notes || '';
  document.getElementById('baby-sex').value = baby.sex;
  document.querySelectorAll('.sex-btn').forEach(b => b.classList.toggle('active', b.dataset.sex === baby.sex));
  document.getElementById('baby-error').style.display = 'none';
  document.getElementById('baby-modal').classList.add('open');
}

function closeBabyModal() {
  document.getElementById('baby-modal').classList.remove('open');
}

async function handleBabyFormSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('baby-error');
  errorEl.style.display = 'none';

  const name = document.getElementById('baby-name').value.trim();
  const dob  = document.getElementById('baby-dob').value;
  const ga   = parseInt(document.getElementById('baby-ga').value);
  const sex  = document.getElementById('baby-sex').value;
  const notes = document.getElementById('baby-notes').value.trim();
  const idVal = document.getElementById('baby-id').value;

  if (!name) { showFormError(errorEl, t('error_required')); return; }
  if (!dob)  { showFormError(errorEl, t('error_required')); return; }
  if (isNaN(ga) || ga < 22 || ga > 42) { showFormError(errorEl, t('error_ga_range')); return; }

  await saveBaby({ id: idVal ? parseInt(idVal) : undefined, name, birthDate: dob, gestationalAgeWeeks: ga, sex, notes });
  closeBabyModal();
  await renderBabies();
  showToast(t('success_saved'));
}

// ─── Register Tab ─────────────────────────────────────────────
async function renderRegisterTab() {
  const noBabyEl = document.getElementById('register-no-baby');
  const formArea = document.getElementById('register-form-area');
  const bar = document.getElementById('active-baby-bar');

  if (!activeBabyId) {
    noBabyEl.style.display = '';
    formArea.style.display = 'none';
    return;
  }

  const baby = await getBaby(activeBabyId);
  if (!baby) {
    activeBabyId = null;
    localStorage.removeItem('bgt_active_baby');
    noBabyEl.style.display = '';
    formArea.style.display = 'none';
    return;
  }

  noBabyEl.style.display = 'none';
  formArea.style.display = '';
  bar.style.display = '';
  bar.textContent = `👶 ${baby.name}`;

  updateAgeDisplay();
  await renderMeasHistory(baby);
}

function updateAgeDisplay() {
  if (!activeBabyId) return;
  getBaby(activeBabyId).then(baby => {
    if (!baby) return;
    const measDate = document.getElementById('meas-date').value;
    if (!measDate || !baby.birthDate) return;
    const { chronWeeks, corrWeeks } = calcAges(baby.birthDate, measDate, baby.gestationalAgeWeeks);
    const ageDiv = document.getElementById('age-display');
    document.getElementById('chron-age-val').textContent = chronWeeks;
    document.getElementById('corr-age-val').textContent = corrWeeks;
    ageDiv.style.display = '';
  });
}

async function handleMeasSave(e) {
  e.preventDefault();
  if (!activeBabyId) return;
  const errorEl = document.getElementById('meas-error');
  errorEl.style.display = 'none';

  const baby  = await getBaby(activeBabyId);
  const date  = document.getElementById('meas-date').value;
  const type  = document.getElementById('meas-type').value;
  const value = parseFloat(document.getElementById('meas-value').value);

  if (!date) { showFormError(errorEl, t('error_required')); return; }
  if (isNaN(value)) { showFormError(errorEl, t('error_invalid_number')); return; }

  const validationError = validateMeasurement(type, value);
  if (validationError) { showFormError(errorEl, validationError); return; }

  const { chronWeeks, corrWeeks } = calcAges(baby.birthDate, date, baby.gestationalAgeWeeks);

  await addMeasurement({
    babyId: activeBabyId,
    date,
    type,
    value,
    chronologicalAgeWeeks: chronWeeks,
    correctedAgeWeeks: corrWeeks,
  });

  document.getElementById('meas-value').value = '';
  document.getElementById('meas-date').value = todayISO();
  showToast(t('success_saved'));
  await renderMeasHistory(baby);
}

async function renderMeasHistory(baby) {
  const rows = document.getElementById('meas-tbody');
  const measurements = await getMeasurements(activeBabyId);

  if (!measurements.length) {
    rows.innerHTML = `<tr><td colspan="6" class="empty-msg">${t('register_empty')}</td></tr>`;
    return;
  }

  rows.innerHTML = '';
  // Newest first
  for (const m of [...measurements].reverse()) {
    const z = calcZScore(m.type, baby.sex, m.correctedAgeWeeks, m.value);
    const zLabel = z !== null ? formatZScore(z) : '—';
    const zClass = z === null ? '' : Math.abs(z) > 2 ? 'zscore-alert' : Math.abs(z) > 1 ? 'zscore-warn' : 'zscore-ok';
    const unit = t(`unit_${m.type}`);
    const typeName = t(`type_${m.type}`);

    let warningHtml = '';
    if (z !== null && z < -2) warningHtml = `<span class="alert-badge">▼ ${t('register_warning_below')}</span>`;
    else if (z !== null && z > 2) warningHtml = `<span class="alert-badge">▲ ${t('register_warning_above')}</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.date}</td>
      <td>${typeName}</td>
      <td>${m.value} ${unit}${warningHtml}</td>
      <td>${m.correctedAgeWeeks}w</td>
      <td class="${zClass}">${zLabel}</td>
      <td><button class="btn-del-meas" data-id="${m.id}" title="${t('btn_delete')}">🗑</button></td>
    `;
    tr.querySelector('.btn-del-meas').addEventListener('click', async () => {
      await deleteMeasurement(m.id);
      await renderMeasHistory(baby);
    });
    rows.appendChild(tr);
  }
}

// ─── Charts Tab ───────────────────────────────────────────────
async function renderChartsTab() {
  const noBabyEl = document.getElementById('charts-no-baby');
  const chartsArea = document.getElementById('charts-area');
  const infoBar = document.getElementById('charts-baby-info');
  const noteEl = document.getElementById('chart-age-note');

  if (!activeBabyId) {
    noBabyEl.style.display = '';
    chartsArea.style.display = 'none';
    destroyChart();
    return;
  }

  const baby = await getBaby(activeBabyId);
  if (!baby) {
    noBabyEl.style.display = '';
    chartsArea.style.display = 'none';
    return;
  }

  noBabyEl.style.display = 'none';
  chartsArea.style.display = '';
  infoBar.style.display = '';
  infoBar.textContent = `👶 ${baby.name} · ${baby.sex === 'female' ? t('baby_form_sex_female') : t('baby_form_sex_male')} · GA ${baby.gestationalAgeWeeks}w`;

  const measurements = await getMeasurements(activeBabyId);
  const filtered = measurements.filter(m => m.type === currentChartType);

  // Age note
  const lastMeas = filtered.length ? filtered[filtered.length - 1] : null;
  const useCorr = lastMeas ? shouldUseCorrection(lastMeas.correctedAgeWeeks) : true;
  noteEl.textContent = useCorr ? t('charts_using_corrected') : t('charts_using_chronological');

  renderChart(currentChartType, baby.sex, filtered);
}

function renderActiveChart() {
  if (currentTab === 'charts') renderChartsTab();
}

// ─── Settings ─────────────────────────────────────────────────
async function handleExport() {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `bgt-export-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('success_exported'));
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  confirm(t('settings_import_confirm'), async () => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAll(data);
      activeBabyId = null;
      localStorage.removeItem('bgt_active_baby');
      await renderBabies();
      showToast(t('success_imported'));
    } catch {
      showToast('Import failed — invalid file');
    }
    e.target.value = '';
  });
}

function handleClear() {
  confirm(t('settings_clear_confirm'), async () => {
    await clearAll();
    activeBabyId = null;
    localStorage.removeItem('bgt_active_baby');
    await renderBabies();
    showToast(t('success_cleared'));
  });
}

// ─── Confirm Modal ────────────────────────────────────────────
let confirmCallback = null;

function confirm(message, callback) {
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-title').textContent = t('confirm_title');
  document.getElementById('confirm-ok').textContent = t('btn_confirm');
  document.getElementById('confirm-cancel').textContent = t('btn_close');
  confirmCallback = callback;
  document.getElementById('confirm-modal').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirm-modal').classList.remove('open');
  confirmCallback = null;
}


// ─── Toast ────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ─── Helpers ──────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showFormError(el, msg) {
  el.textContent = msg;
  el.style.display = '';
}

function validateMeasurement(type, value) {
  const ranges = {
    weight:             [0.3, 30],
    length:             [20,  150],
    headCircumference:  [25,  60],
    waistCircumference: [25,  80],
  };
  const [min, max] = ranges[type] || [0, Infinity];
  if (value < min || value > max) return t(`error_${type === 'weight' ? 'weight' : type === 'length' ? 'length' : type === 'headCircumference' ? 'head' : 'waist'}_range`);
  return null;
}

function formatZScore(z) {
  const sign = z >= 0 ? '+' : '';
  return `${sign}${z.toFixed(1)} SD`;
}
