import { getChartData, getReference } from './who-data.js';
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

  // Destroy existing instance
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  const chartData = getChartData(type, sex);
  if (!chartData.length) return;

  const whoLabels = chartData.map(d => d.month); // x = months

  // Baby data: convert corrected weeks → months for x-axis
  const babyPoints = measurements.map(m => ({
    x: m.correctedAgeWeeks / 4.3452,
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

  // Y axis range: WHO min/max + 10%
  const allVals = chartData.flatMap(d => [d.SD3n, d.SD3]);
  const yMin = Math.floor(Math.min(...allVals) * 0.95);
  const yMax = Math.ceil(Math.max(...allVals) * 1.02);

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: whoLabels,
      datasets: [...whoDatasets, babyDataset],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: item => item.datasetIndex === whoDatasets.length, // only baby dataset
          callbacks: {
            title: items => {
              const pt = items[0].raw;
              return pt.date || '';
            },
            label: items => {
              const pt = items[0].raw;
              const unit = t(`unit_${type}`);
              const ref = getReference(type, sex, pt.weeks);
              let zscore = '';
              if (ref) {
                const range = pt.y >= ref.M ? (ref.SD2 - ref.M) : (ref.M - ref.SD2n);
                const z = range > 0 ? ((pt.y - ref.M) / range).toFixed(1) : '?';
                zscore = ` (Z: ${z > 0 ? '+' : ''}${z} SD)`;
              }
              return `${pt.y} ${unit}${zscore}`;
            },
            afterLabel: items => {
              const pt = items[0].raw;
              return `${t('register_corr_age')}: ${Math.round(pt.weeks)} ${t('register_weeks')}`;
            }
          }
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: t('charts_x_label'), font: { size: 11 } },
          min: 0,
          max: chartData[chartData.length - 1].month,
          ticks: {
            stepSize: 4,
            font: { size: 10 },
            callback: val => {
              if (val % 4 !== 0) return '';
              const weeks = Math.round(val * 4.3452);
              return `${weeks}w`;
            },
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        x2: {
          type: 'linear',
          position: 'bottom',
          min: 0,
          max: chartData[chartData.length - 1].month,
          ticks: {
            stepSize: 6,
            font: { size: 9 },
            color: '#9CA3AF',
            callback: val => {
              if (val % 6 !== 0) return '';
              return `${val}${t('months_label')}`;
            },
          },
          grid: { display: false },
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

export function destroyChart() {
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
}
