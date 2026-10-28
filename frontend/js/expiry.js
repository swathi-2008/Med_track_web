import { api } from './api.js';
import { hasRole } from './auth.js';
import { escapeHtml, formatCurrency, formatDate, showToast, showConfirmModal } from './components.js';

let activeWindow = 'all'; // '7', '30', '60', 'expired', 'all'

export async function render(container) {
  const canManage = hasRole('ADMIN', 'MANAGER');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Expiry Risk Center</h1>
        <div class="page-subtitle">Proactive loss prevention, wastage valuation, and FEFO mitigation alerts.</div>
      </div>
      <div>
        <button id="refresh-expiry-btn" class="btn btn-outline btn-sm">
          <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i> Refresh Analysis
        </button>
      </div>
    </div>

    <!-- Stat Cards -->
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">Batches at Risk <i data-lucide="alert-triangle" style="width: 16px; height: 16px; color: var(--color-critical);"></i></div>
        <div class="metric-value tabular-nums" id="stat-batches-risk">--</div>
        <div class="metric-subtext" id="stat-batches-sub">Evaluating active inventory</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Units at Risk <i data-lucide="boxes" style="width: 16px; height: 16px; color: var(--color-warning);"></i></div>
        <div class="metric-value tabular-nums" id="stat-units-risk">--</div>
        <div class="metric-subtext">Cumulative un-dispensed units</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Valuation at Risk <i data-lucide="indian-rupee" style="width: 16px; height: 16px; color: var(--color-primary);"></i></div>
        <div class="metric-value tabular-nums" id="stat-value-risk" style="color: var(--color-critical);">--</div>
        <div class="metric-subtext">Total cost basis of expiring stock</div>
      </div>
    </div>

    <!-- Filter Tabs / Segmented Control -->
    <div class="filter-bar" style="margin-top: 1.5rem;">
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-sm ${activeWindow === 'all' ? 'btn-primary' : 'btn-outline'} window-btn" data-window="all">All Evaluated</button>
        <button class="btn btn-sm ${activeWindow === '7' ? 'btn-primary' : 'btn-outline'} window-btn" data-window="7">Critical (≤ 7 Days)</button>
        <button class="btn btn-sm ${activeWindow === '30' ? 'btn-primary' : 'btn-outline'} window-btn" data-window="30">High (8 – 30 Days)</button>
        <button class="btn btn-sm ${activeWindow === '60' ? 'btn-primary' : 'btn-outline'} window-btn" data-window="60">Medium (31 – 60 Days)</button>
        <button class="btn btn-sm ${activeWindow === 'expired' ? 'btn-primary' : 'btn-outline'} window-btn" data-window="expired">Expired Stock</button>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Batch No</th>
            <th>Medicine</th>
            <th>Expiry Date</th>
            <th class="num-col">Days Left</th>
            <th class="num-col">Units Left</th>
            <th class="num-col">Cost / Unit</th>
            <th class="num-col">Value at Risk</th>
            <th>Recommended Action</th>
            ${canManage ? `<th style="text-align: right;">Action</th>` : ''}
          </tr>
        </thead>
        <tbody id="expiry-table-body">
          <tr><td colspan="${canManage ? 9 : 8}" style="text-align: center; padding: 2rem;">Computing risk report...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  container.querySelector('#refresh-expiry-btn')?.addEventListener('click', () => loadExpiryData(container));

  container.querySelectorAll('.window-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeWindow = btn.dataset.window;
      container.querySelectorAll('.window-btn').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.window === activeWindow ? 'btn-primary' : 'btn-outline'} window-btn`;
      });
      loadExpiryData(container);
    });
  });

  await loadExpiryData(container);
}

async function loadExpiryData(container) {
  const tbody = container.querySelector('#expiry-table-body');
  const canManage = hasRole('ADMIN', 'MANAGER');

  try {
    let windowParam = null;
    let includeExpired = true;

    if (activeWindow === '7') windowParam = 7;
    else if (activeWindow === '30') windowParam = 30;
    else if (activeWindow === '60') windowParam = 60;
    else if (activeWindow === 'expired') {
      windowParam = -1; // only expired
    }

    const report = await api.get('/api/batches/expiry-risk');

    // Filter items according to active tab
    let filteredItems = report.items;
    if (activeWindow === '7') {
      filteredItems = report.items.filter(i => i.days_left >= 0 && i.days_left <= 7);
    } else if (activeWindow === '30') {
      filteredItems = report.items.filter(i => i.days_left > 7 && i.days_left <= 30);
    } else if (activeWindow === '60') {
      filteredItems = report.items.filter(i => i.days_left > 30 && i.days_left <= 60);
    } else if (activeWindow === 'expired') {
      filteredItems = report.items.filter(i => i.days_left < 0);
    }

    // Update KPI stats
    const batchesAtRiskCount = report.counts_by_category.EXPIRED + report.counts_by_category.CRITICAL + report.counts_by_category.HIGH + report.counts_by_category.MEDIUM;
    container.querySelector('#stat-batches-risk').textContent = batchesAtRiskCount;
    container.querySelector('#stat-units-risk').textContent = report.total_quantity_at_risk.toLocaleString('en-IN');
    container.querySelector('#stat-value-risk').textContent = report.total_value_at_risk_display;
    container.querySelector('#stat-batches-sub').textContent = `${report.counts_by_category.CRITICAL} critical, ${report.counts_by_category.EXPIRED} expired`;

    if (filteredItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${canManage ? 9 : 8}" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">No batches found matching selected expiry window.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredItems.map(b => {
      let badgeClass = 'status-healthy';
      if (b.risk_category === 'EXPIRED' || b.risk_category === 'CRITICAL') {
        badgeClass = 'status-critical';
      } else if (b.risk_category === 'HIGH' || b.risk_category === 'MEDIUM') {
        badgeClass = 'status-warning';
      }

      return `
        <tr>
          <td style="font-weight: 600; font-family: var(--font-mono);">${escapeHtml(b.batch_number)}</td>
          <td><strong>${escapeHtml(b.medicine_name)}</strong> <span style="color: var(--color-text-muted); font-size: 0.8rem;">(${escapeHtml(b.strength)})</span></td>
          <td>${formatDate(b.expiry_date)}</td>
          <td class="num-col">
            <span class="status-badge ${badgeClass}">
              ${b.days_left < 0 ? `${Math.abs(b.days_left)}d overdue` : `${b.days_left}d`}
            </span>
          </td>
          <td class="num-col" style="font-weight: 600;">${b.quantity_available}</td>
          <td class="num-col">${formatCurrency(b.purchase_price)}</td>
          <td class="num-col" style="font-weight: 700; color: ${b.days_left <= 7 ? 'var(--color-critical)' : 'inherit'};">
            ${b.value_at_risk_display}
          </td>
          <td style="max-width: 320px; font-size: 0.8125rem; color: var(--color-text-muted);">
            ${escapeHtml(b.suggested_action)}
          </td>
          ${canManage ? `
            <td style="text-align: right;">
              ${b.status === 'ACTIVE' ? `
                <button class="btn btn-outline btn-sm quarantine-direct-btn" data-id="${b.id}" data-num="${escapeHtml(b.batch_number)}">
                  Quarantine
                </button>
              ` : `
                <span class="status-badge status-quarantined">${escapeHtml(b.status)}</span>
              `}
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    if (canManage) {
      tbody.querySelectorAll('.quarantine-direct-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const batchId = btn.dataset.id;
          const batchNum = btn.dataset.num;
          showConfirmModal({
            title: 'Quarantine Batch',
            message: `Quarantine batch ${batchNum}? It will be immediately withheld from active FEFO counter sales.`,
            confirmText: 'Quarantine',
            confirmClass: 'btn-danger',
            onConfirm: async () => {
              try {
                await api.patch(`/api/batches/${batchId}/status`, {
                  status: 'QUARANTINED',
                  reason: 'Quarantined from Expiry Risk Center due to approaching expiration threshold.'
                });
                showToast(`Batch ${batchNum} quarantined successfully.`, 'success');
                loadExpiryData(container);
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        });
      });
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${canManage ? 9 : 8}" style="text-align: center; color: var(--color-critical); padding: 2rem;">Failed to compute expiry risk report: ${escapeHtml(err.message)}</td></tr>`;
  }
}
