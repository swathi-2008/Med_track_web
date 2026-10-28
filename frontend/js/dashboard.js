/**
 * MedTrack Dashboard Module
 * Role-aware summary stats, Chart.js trends, expiry breakdown, and quick actions.
 */
import { apiGet } from './api.js';
import { getCurrentUser } from './auth.js';
import { navigateTo } from './router.js';

let salesChartInstance = null;
let expiryChartInstance = null;

export async function renderDashboard(container) {

  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 tracking-tight">Executive Operations Dashboard</h2>
          <p class="text-sm text-slate-500">Real-time inventory valuation, expiry risks, and dispensing velocity</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs uppercase tracking-wider font-semibold text-slate-400">Signed in as</span>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">${user.role}</span>
        </div>
      </div>

      <!-- KPI Stat Grid -->
      <div id="dashboard-kpi-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-4 animate-pulse"><div class="h-12 bg-slate-100 rounded"></div></div>
        <div class="card p-4 animate-pulse"><div class="h-12 bg-slate-100 rounded"></div></div>
        <div class="card p-4 animate-pulse"><div class="h-12 bg-slate-100 rounded"></div></div>
        <div class="card p-4 animate-pulse"><div class="h-12 bg-slate-100 rounded"></div></div>
      </div>

      <!-- Quick Actions Bar -->
      <div class="card p-4 bg-slate-50 border-slate-200">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick Actions</span>
          <div class="flex flex-wrap gap-2" id="dashboard-quick-actions"></div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="card p-5 lg:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-semibold text-slate-900">7-Day Dispensing & Revenue Velocity</h3>
              <p class="text-xs text-slate-500">Daily transaction volume and revenue generated</p>
            </div>
          </div>
          <div class="h-64 relative">
            <canvas id="salesVelocityChart"></canvas>
          </div>
        </div>

        <div class="card p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-semibold text-slate-900">Batch Expiry Portfolio</h3>
              <p class="text-xs text-slate-500">Distribution of active lots by shelf-life risk</p>
            </div>
          </div>
          <div class="h-64 relative flex items-center justify-center">
            <canvas id="expiryPortfolioChart"></canvas>
          </div>
        </div>
      </div>

      <!-- Recent Transactions Activity -->
      <div class="card overflow-hidden">
        <div class="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-slate-900">Recent Inventory & Dispensing Activity</h3>
          <span class="text-xs text-slate-500">Live ledger stream</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th class="p-3 font-medium">Type</th>
                <th class="p-3 font-medium">Medicine</th>
                <th class="p-3 font-medium text-right">Quantity Delta</th>
                <th class="p-3 font-medium">Reason</th>
                <th class="p-3 font-medium text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody id="dashboard-activity-body" class="divide-y divide-slate-100 font-mono">
              <tr><td colspan="5" class="p-4 text-center text-slate-400 font-sans">Loading activity...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  renderQuickActions(user);
  await loadDashboardData(user);
}

function renderQuickActions(user) {
  const container = document.getElementById('dashboard-quick-actions');
  if (!container) return;

  const actions = [];
  if (user.role === 'SALES_STAFF' || user.role === 'ADMIN' || user.role === 'MANAGER') {
    actions.push({ label: 'Open POS Counter', target: '#sales', primary: true });
  }
  if (user.role === 'MANAGER' || user.role === 'ADMIN') {
    actions.push({ label: 'Decision Intelligence', target: '#intelligence' });
    actions.push({ label: 'Expiry Risk Center', target: '#expiry' });
    actions.push({ label: 'Review PRs', target: '#purchasing' });
  }
  if (user.role === 'PURCHASE_STAFF' || user.role === 'ADMIN') {
    actions.push({ label: 'Create Purchase Request', target: '#purchasing' });
    actions.push({ label: 'Receive Goods (GRN)', target: '#purchasing' });
  }

  container.innerHTML = actions.map(a => `
    <button class="btn ${a.primary ? 'btn-primary' : 'btn-secondary'} text-xs" data-target="${a.target}">
      ${a.label}
    </button>
  `).join('');

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) navigateTo(target);
    });
  });
}

async function loadDashboardData(user) {
  try {
    const [summary, trend, expiryBreakdown, activity] = await Promise.all([
      apiGet('/api/dashboard/summary'),
      apiGet('/api/dashboard/sales-trend'),
      apiGet('/api/dashboard/expiry-breakdown'),
      apiGet('/api/dashboard/recent-activity?limit=8'),
    ]);

    renderKPIs(summary.metrics, user);
    renderCharts(trend, expiryBreakdown);
    renderActivity(activity);
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

function renderKPIs(m, user) {
  const grid = document.getElementById('dashboard-kpi-grid');
  if (!grid) return;

  let cards = [];

  if (user.role === 'ADMIN' || user.role === 'MANAGER') {
    cards = [
      {
        title: "Total Retail Valuation",
        value: m.total_inventory_retail_display,
        sub: `Cost Basis: ${m.total_inventory_cost_display}`,
        color: "text-slate-900",
      },
      {
        title: "Today's Sales Revenue",
        value: m.today_revenue_display,
        sub: `${m.today_sales_count} transaction(s) completed today`,
        color: "text-emerald-700",
      },
      {
        title: "Critical & High Expiry Risk",
        value: `${m.near_expiry_count} lot(s)`,
        sub: `${m.expired_lots_count} expired lot(s) require quarantine`,
        color: m.near_expiry_count > 0 ? "text-amber-700" : "text-slate-900",
      },
      {
        title: "Under-Stocked Items",
        value: `${m.low_stock_count} item(s)`,
        sub: `${m.pending_purchase_requests} PR(s) pending approval`,
        color: m.low_stock_count > 0 ? "text-rose-700" : "text-slate-900",
      },
    ];
  } else if (user.role === 'SALES_STAFF') {
    cards = [
      {
        title: "My Sales Today",
        value: m.my_today_revenue_display,
        sub: `${m.my_today_sales_count} sale(s) billed by you`,
        color: "text-emerald-700",
      },
      {
        title: "Total Store Sales Today",
        value: m.today_revenue_display,
        sub: `${m.today_sales_count} total store orders`,
        color: "text-slate-900",
      },
      {
        title: "Near-Expiry Lots",
        value: `${m.near_expiry_count} lot(s)`,
        sub: "Prioritized via FEFO checkout",
        color: "text-amber-700",
      },
      {
        title: "Low Stock Items",
        value: `${m.low_stock_count} item(s)`,
        sub: "Verify shelf availability",
        color: "text-rose-700",
      },
    ];
  } else {
    // PURCHASE_STAFF
    cards = [
      {
        title: "Items Below Reorder Level",
        value: `${m.low_stock_count} item(s)`,
        sub: "Actionable replenishment needed",
        color: "text-rose-700",
      },
      {
        title: "Pending Purchase Requisitions",
        value: `${m.pending_purchase_requests} request(s)`,
        sub: "Awaiting Manager review",
        color: "text-amber-700",
      },
      {
        title: "Open Purchase Orders",
        value: `${m.open_purchase_orders} PO(s)`,
        sub: "Pending Goods Receipt (GRN)",
        color: "text-blue-700",
      },
      {
        title: "Lots Expiring (≤30 Days)",
        value: `${m.near_expiry_count} lot(s)`,
        sub: "Avoid reordering duplicate near-expiry",
        color: "text-slate-900",
      },
    ];
  }

  grid.innerHTML = cards.map(c => `
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">${c.title}</div>
      <div class="text-2xl font-bold font-mono tracking-tight ${c.color}">${c.value}</div>
      <div class="text-xs text-slate-500 mt-1">${c.sub}</div>
    </div>
  `).join('');
}

function renderCharts(trend, expiry) {
  if (typeof Chart === 'undefined') return;

  // 1. Sales Trend
  const ctxTrend = document.getElementById('salesVelocityChart');
  if (ctxTrend) {
    if (salesChartInstance) salesChartInstance.destroy();
    salesChartInstance = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: trend.map(t => t.date),
        datasets: [{
          label: 'Revenue (INR)',
          data: trend.map(t => t.revenue_inr),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.08)',
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#0f766e',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ₹${context.raw.toLocaleString('en-IN')}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => `₹${val}`,
              font: { family: 'ui-monospace, monospace', size: 10 },
            },
            grid: { color: '#f1f5f9' },
          },
          x: {
            ticks: { font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    });
  }

  // 2. Expiry Risk Doughnut
  const ctxExpiry = document.getElementById('expiryPortfolioChart');
  if (ctxExpiry) {
    if (expiryChartInstance) expiryChartInstance.destroy();
    expiryChartInstance = new Chart(ctxExpiry, {
      type: 'doughnut',
      data: {
        labels: ['Expired (<0d)', 'Critical (≤7d)', 'High (≤30d)', 'Medium (≤60d)', 'Healthy (>60d)'],
        datasets: [{
          data: [
            expiry.expired.count,
            expiry.critical_7d.count,
            expiry.high_30d.count,
            expiry.medium_60d.count,
            expiry.healthy.count,
          ],
          backgroundColor: [
            '#ef4444', // Red
            '#f97316', // Orange
            '#f59e0b', // Amber
            '#3b82f6', // Blue
            '#10b981', // Green
          ],
          borderWidth: 2,
          borderColor: '#ffffff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 10 }, boxWidth: 12 },
          },
        },
        cutout: '70%',
      },
    });
  }
}

function renderActivity(activity) {
  const tbody = document.getElementById('dashboard-activity-body');
  if (!tbody) return;

  if (!activity || activity.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 font-sans">No recent stock activity logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = activity.map(tx => {
    const isPositive = tx.quantity_delta > 0;
    const deltaStr = isPositive ? `+${tx.quantity_delta}` : `${tx.quantity_delta}`;
    const deltaColor = isPositive ? 'text-emerald-700' : 'text-rose-700';
    const dateFormatted = new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-sans">
          <span class="inline-flex px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
            tx.type === 'SALE' ? 'bg-emerald-50 text-emerald-800' :
            tx.type === 'RECEIPT' ? 'bg-blue-50 text-blue-800' :
            tx.type === 'QUARANTINE' ? 'bg-rose-50 text-rose-800' :
            'bg-amber-50 text-amber-800'
          }">
            ${tx.type}
          </span>
        </td>
        <td class="p-3 font-sans font-medium text-slate-800">${escapeHtml(tx.medicine_name)}</td>
        <td class="p-3 text-right font-bold ${deltaColor}">${deltaStr}</td>
        <td class="p-3 font-sans text-slate-500">${escapeHtml(tx.reason || '—')}</td>
        <td class="p-3 text-right text-slate-400 text-[11px]">${dateFormatted}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const render = renderDashboard;

