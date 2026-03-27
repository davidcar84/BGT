import { getChartDataFull, getReference } from './who-data.js';
import { t } from './i18n.js';

let chartInstance = null;

const ZONE_COLORS = {
  green:  'rgba(200, 230, 201, 0.55)',
  yellow: 'rgba(255, 249, 196, 0.65)',
  red:    'rgba(255, 205, 210, 0.65)',
};
const LINE_COLORS = {
  SD3: 'rgba(183, 28, 28, 0.7)',
  SD2: 'rgba(229, 57, 53, 0.85)',
  SD1: 'rgba(255, 152, 0, 0.85)',
  M:   'rgba(56, 142, 60, 1)',
};
const BABY_COLOR = '#1565C0';

/**
 * Build Chart.js datasets for WHO reference lines and zones.
 * chartData: array of {month, SD3n, SD2n, SD1n, M, SD1, SD2, SD3}
 */
function buildWhoDatasets(chartData) {
  const labels = chartData.map(d => d.month);

  // Helper: extract series
  const series = key => chartData.map(d => d[key]);

  return [
    // ── Zone fills (order matters — back to front) ──────────
    // Red zone upper (+2/+3)
    {
      label: '', data: series('SD3'), fill: '+1',
      backgroundColor: ZONE_COLORS.red,
      borderColor: 'transparent', borderWidth: 0,
      pointRadius: 0, tension: 0.4, order: 10,
    },
    // Yellow zone upper (+1/+2)
    {
      label: '', data: series('SD2'), fill: '+1',
      backgroundColor: ZONE_COLORS.yellow,
      borderColor: 'transparent', borderWidth: 0,
      pointRadius: 0, tension: 0.4, order: 11,
    },
    // Green zone (-1/+1) — filled between SD1 lines
    {
      label: '', data: series('SD1'), fill: '+1',
      backgroundColor: ZONE_COLORS.green,
      borderColor: 'transparent', borderWidth: 0,
      pointRadius: 0, tension: 0.4, order: 12,
    },
    // Median (closes the green zone fill)
    {
      label: '', data: series('SD1n'), fill: false,
      borderColor: 'transparent', borderWidth: 0,
      pointRadius: 0, tension: 0.4, order: 13,
    },
    // Yellow zone lower (-2/-1)
    {
      label: '', data: series('SD2n'), fill: '+1',
      backgroundColor: ZONE_COLORS.yellow,
      borderColor: 'transparent', borderWidth: 0,
      pointRadius: 0, tension: 0.4, order: 14,
    },
    // Red zone lower (-3/-2)
    {
      label: '', data: series('SD3n'), fill: '+1',
      backgroundColor: ZONE_COLORS.red,
      borderColor: 'transparent', borderWidth: 0,
      pointRadius: 0, tension: 0.4, order: 15,
    },

    // ── Reference lines ──────────────────────────────────────
    {
      label: '+3 SD', data: series('SD3'),
      borderColor: LINE_COLORS.SD3, borderWidth: 1.2,
      borderDash: [4, 3], backgroundColor: 'transparent',
      pointRadius: 0, tension: 0.4, fill: false, order: 5,
    },
    {
      label: '+2 SD', data: series('SD2'),
      borderColor: LINE_COLORS.SD2, borderWidth: 1.5,
      borderDash: [5, 3], backgroundColor: 'transparent',
      pointRadius: 0, tension: 0.4, fill: false, order: 5,
    },
    {
      label: '+1 SD', data: series('SD1'),
      borderColor: LINE_COLORS.SD1, borderWidth: 1.2,
      borderDash: [3, 3], backgroundColor: 'transparent',
      pointRadius: 0, tension: 0.4, fill: false, order: 5,
    },
    {
      label: 'Median', data: series('M'),
      borderColor: LINE_COLORS.M, borderWidth: 2,
      backgroundColor: 'transparent',
      pointRadius: 0, tension: 0.4, fill: false, order: 4,
    },
    {
      label: '-1 SD', data: series('SD1n'),
      borderColor: LINE_COLORS.SD1, borderWidth: 1.2,
      borderDash: [3, 3], backgroundColor: 'transparent',
      pointRadius: 0, tension: 0.4, fill: false, order: 5,
    },
    {
      label: '-2 SD', data: series('SD2n'),
      borderColor: LINE_COLORS.SD2, borderWidth: 1.5,
      borderDash: [5, 3], backgroundColor: 'transparent',
      pointRadius: 0, tension: 0.4, fill: false, order: 5,
    },
    {
      label: '-3 SD', data: series('SD3n'),
      borderColor: LINE_COLORS.SD3, borderWidth: 1.2,
      borderDash: [4, 3], backgroundColor: 'transparent',
      pointRadius: 0, tension: 0.4, fill: false, order: 5,
    },
  ];
}

/**
 * Render or update the growth chart.
 * @param {string} type - 'weight'|'length'|'headCircumference'|'waistCircumference'
 * @param {string} sex  - 'male'|'female'
 * @param {Array}  measurements - array of {correctedAgeWeeks, value, date}
 */
export function renderChart(type, sex, measurements) {
  const canvas = document.getElementById('growth-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  // Combined Fenton + WHO reference data in corrected weeks
  const chartData = getChartDataFull(type, sex);
  if (!chartData.length) return;

  const refLabels = chartData.map(d => d.cw); // x = corrected weeks

  // Baby data points (x = corrected weeks, can be negative for preterm)
  const babyPoints = measurements.map(m => ({
    x: m.correctedAgeWeeks,
    y: m.value,
    date: m.date,
    weeks: m.correctedAgeWeeks,
  })).sort((a, b) => a.x - b.x);

  const babyDataset = {
    label: t('charts_legend_baby'),
    data: babyPoints,
    parsing: { xAxisKey: 'x', yAxisKey: 'y' },
    borderColor: BABY_COLOR,
    backgroundColor: BABY_COLOR,
    pointRadius: 5,
    pointHoverRadius: 7,
    borderWidth: 2,
    tension: 0,
    fill: false,
    order: 1,
  };

  const whoDatasets = buildWhoDatasets(chartData);
  const xAbsMin = chartData[0].cw;           // −18 (if preterm) or 0
  const xAbsMax = chartData[chartData.length - 1].cw; // ~260 weeks

  // ── Default view: 16-week window ending ~4w past the last measurement ──
  let xMax, xMin;
  if (babyPoints.length) {
    const lastCW  = babyPoints[babyPoints.length - 1].x;
    const firstCW = babyPoints[0].x;
    xMax = Math.min(xAbsMax, lastCW + 4);
    xMin = Math.max(xAbsMin, xMax - 16);
    // If range spans less than 16w, expand left
    if (xMax - xMin < 16) xMin = Math.max(xAbsMin, xMax - 16);
    // Always show at least the full data range
    xMin = Math.min(xMin, firstCW - 2);
  } else {
    xMin = -2; xMax = 14; // default: just before term → 3 months post-term
  }

  // ── Y axis range for visible window (± 1 week padding) ──
  const visRef = chartData.filter(d => d.cw >= xMin - 2 && d.cw <= xMax + 2);
  const allVals = visRef.flatMap(d => [d.SD3n, d.SD3]);
  const yMin = Math.floor(Math.min(...allVals) * 0.95);
  const yMax = Math.ceil(Math.max(...allVals) * 1.02);

  // ── X tick callback: PMA label for preterm, weeks/months post-term ──
  function xLabel(cw) {
    if (cw < 0) return `PMA ${40 + Math.round(cw)}w`;
    if (cw === 0) return 'Term';
    if (cw <= 16) return `${Math.round(cw)}w`;
    const mo = Math.round(cw / 4.3452);
    return `${mo}${t('months_label')}`;
  }

  const range = xMax - xMin;
  const step  = range <= 8 ? 1 : range <= 20 ? 2 : range <= 52 ? 4 : 8;

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: refLabels,
      datasets: [...whoDatasets, babyDataset],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: item => item.datasetIndex === whoDatasets.length,
          callbacks: {
            title: items => items[0].raw.date || '',
            label: items => {
              const pt = items[0].raw;
              const unit = t(`unit_${type}`);
              const ref  = getReference(type, sex, pt.weeks);
              let zscore = '';
              if (ref) {
                const r = pt.y >= ref.M ? (ref.SD2 - ref.M) : (ref.M - ref.SD2n);
                const z = r > 0 ? ((pt.y - ref.M) / r).toFixed(1) : '?';
                zscore = ` (Z: ${z >= 0 ? '+' : ''}${z} SD)`;
              }
              return `${pt.y} ${unit}${zscore}`;
            },
            afterLabel: items => {
              const pt = items[0].raw;
              const pmaLabel = pt.weeks < 0 ? `PMA ${40 + Math.round(pt.weeks)}w` : '';
              return [
                `${t('register_corr_age')}: ${Math.round(pt.weeks)}w`,
                pmaLabel,
              ].filter(Boolean).join(' · ');
            }
          }
        },
        zoom: {
          zoom: {
            wheel: { enabled: true, speed: 0.1 },
            pinch: { enabled: true },
            mode: 'x',
            onZoom: () => showResetBtn(true),
          },
          pan: {
            enabled: true,
            mode: 'x',
            onPan: () => showResetBtn(true),
          },
          limits: { x: { min: xAbsMin, max: xAbsMax, minRange: 4 } },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: t('charts_x_label'), font: { size: 11 } },
          min: xMin,
          max: xMax,
          ticks: {
            stepSize: step,
            font: { size: 10 },
            callback: val => val % step !== 0 ? '' : xLabel(val),
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        y: {
          title: { display: true, text: t(`yaxis_${type}`), font: { size: 11 } },
          min: yMin,
          max: yMax,
          ticks: { font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
      },
    },
  });
}

function showResetBtn(visible) {
  const btn = document.getElementById('btn-reset-zoom');
  if (btn) btn.style.display = visible ? '' : 'none';
}

export function resetZoom() {
  if (chartInstance) {
    chartInstance.resetZoom();
    showResetBtn(false);
  }
}

export function destroyChart() {
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  showResetBtn(false);
}
