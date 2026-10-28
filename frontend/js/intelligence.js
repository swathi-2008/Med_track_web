import { api } from './api.js';
import { hasRole } from './auth.js';
import { escapeHtml, formatCurrency, showToast } from './components.js';

let activeRiskFilter = 'all'; // 'all', 'SHORTAGE', 'EXPIRY', 'DUAL_RISK', 'MONITOR'

export async function render(container) {
  const canAct = hasRole('ADMIN', 'MANAGER', 'PURCHASE_STAFF');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dual-Risk Intelligence Center</h1>
        <div class="page-subtitle">Deterministic decision support reconciling shelf-life expiration vs. out-of-stock shortages.</div>
      </div>
      <div>
        <button id="refresh-intel-btn" class="btn btn-outline btn-sm">
          <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i> Refresh Decision Matrix
        </button>
      </div>
    </div>

    <!-- Mandatory Rule-Based Disclaimer Banner -->
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 0.75rem 1rem; border-radius: var(--radius-md); font-size: 0.8125rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.65rem;">
      <i data-lucide="info" style="width: 18px; height: 18px; flex-shrink: 0; color: #2563eb;"></i>
      <div>
        <strong>Rule-based decision support — not machine learning.</strong> Every recommendation is deterministically computed from real-time batch shelf life, reorder thresholds, confirmed in-transit shipments, and historical sales velocity.
      </div>
    </div>

    <!-- Stat Summary Cards -->
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">Dual-Risk Compounds <i data-lucide="alert-octagon" style="width: 16px; height: 16px; color: var(--color-critical);"></i></div>
        <div class="metric-value tabular-nums" id="stat-dual-count">--</div>
        <div class="metric-subtext">Imminent shortage + expiring lots</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Shortage Risk SKUs <i data-lucide="trending-down" style="width: 16px; height: 16px; color: var(--color-warning);"></i></div>
        <div class="metric-value tabular-nums" id="stat-shortage-count">--</div>
        <div class="metric-subtext">Below reorder level</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Expiry Risk SKUs <i data-lucide="clock" style="width: 16px; height: 16px; color: var(--color-primary);"></i></div>
        <div class="metric-value tabular-nums" id="stat-expiry-count">--</div>
        <div class="metric-subtext">Lots expiring in ≤ 30 days</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Active SKUs Analyzed <i data-lucide="shield-check" style="width: 16px; height: 16px; color: var(--color-healthy);"></i></div>
        <div class="metric-value tabular-nums" id="stat-total-analyzed">--</div>
        <div class="metric-subtext">100% active catalog evaluated</div>
      </div>
    </div>

    <!-- Filter Segmented Tabs -->
    <div class="filter-bar" style="margin-top: 1.5rem;">
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-sm ${activeRiskFilter === 'all' ? 'btn-primary' : 'btn-outline'} filter-btn" data-filter="all">All Recommendations</button>
        <button class="btn btn-sm ${activeRiskFilter === 'DUAL_RISK' ? 'btn-primary' : 'btn-outline'} filter-btn" data-filter="DUAL_RISK">Dual-Risk (Critical)</button>
        <button class="btn btn-sm ${activeRiskFilter === 'SHORTAGE' ? 'btn-primary' : 'btn-outline'} filter-btn" data-filter="SHORTAGE">Shortage Replenishment</button>
        <button class="btn btn-sm ${activeRiskFilter === 'EXPIRY' ? 'btn-primary' : 'btn-outline'} filter-btn" data-filter="EXPIRY">Expiry Mitigation</button>
        <button class="btn btn-sm ${activeRiskFilter === 'MONITOR' ? 'btn-primary' : 'btn-outline'} filter-btn" data-filter="MONITOR">Monitor Velocity</button>
      </div>
    </div>

    <!-- Recommendations Stream -->
    <div id="recommendations-container" style="display: flex; flex-direction: column; gap: 1rem;">
      <div style="padding: 2.5rem; text-align: center; color: var(--color-text-muted);">Analyzing inventory telemetry...</div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  container.querySelector('#refresh-intel-btn')?.addEventListener('click', () => loadIntelligenceData(container));

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeRiskFilter = btn.dataset.filter;
      container.querySelectorAll('.filter-btn').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.filter === activeRiskFilter ? 'btn-primary' : 'btn-outline'} filter-btn`;
      });
      loadIntelligenceData(container);
    });
  });

  await loadIntelligenceData(container);
}

async function loadIntelligenceData(container) {
  const targetSlot = container.querySelector('#recommendations-container');

  try {
    const data = await api.get('/api/intelligence/recommendations');

    container.querySelector('#stat-dual-count').textContent = data.dual_risks_count;
    container.querySelector('#stat-shortage-count').textContent = data.shortage_risks_count;
    container.querySelector('#stat-expiry-count').textContent = data.expiry_risks_count;
    container.querySelector('#stat-total-analyzed').textContent = data.total_medicines_analyzed;

    let recs = data.recommendations;
    if (activeRiskFilter !== 'all') {
      recs = recs.filter(r => r.risk_type === activeRiskFilter);
    }

    if (recs.length === 0) {
      targetSlot.innerHTML = `
        <div class="empty-state" style="background: white; border: 1px solid var(--color-border); border-radius: var(--radius-lg);">
          <div class="empty-title">All Parameters Nominal</div>
          <div class="empty-description">No active inventory risks detected matching this filter category. Standard FEFO protocol in effect.</div>
        </div>
      `;
      return;
    }

    targetSlot.innerHTML = recs.map(r => {
      let cardBorder = 'var(--color-border)';
      let severityBadge = 'status-healthy';
      if (r.severity === 'CRITICAL') {
        cardBorder = '#fca5a5';
        severityBadge = 'status-critical';
      } else if (r.severity === 'HIGH' || r.severity === 'MEDIUM') {
        cardBorder = '#fde68a';
        severityBadge = 'status-warning';
      }

      const d = r.data_considered;

      return `
        <div class="card" style="border: 1px solid ${cardBorder};">
          <div class="card-header" style="background-color: #fafafa;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="status-badge ${severityBadge}">
                ${r.severity}
              </span>
              <strong style="font-size: 1.05rem; color: var(--color-text-main);">${escapeHtml(r.medicine_name)}</strong>
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">(${escapeHtml(r.category)})</span>
            </div>
            <div>
              <span style="font-size: 0.75rem; font-family: var(--font-mono); font-weight: 600; color: #475569; background: #f1f5f9; padding: 2px 8px; border-radius: var(--radius-sm);">
                ${escapeHtml(r.rule_applied)}
              </span>
            </div>
          </div>

          <div class="card-body">
            <!-- Problem -->
            <div style="margin-bottom: 0.75rem; font-size: 0.875rem;">
              <span style="font-weight: 600; color: var(--color-critical);">Problem:</span> ${escapeHtml(r.problem)}
            </div>

            <!-- Five-Part Explanation Grid -->
            <div style="background-color: var(--color-canvas); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 0.75rem; font-size: 0.8125rem;">
              <div style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-text-muted); font-size: 0.7rem; margin-bottom: 0.35rem;">
                Telemetry Considered
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 1rem; color: var(--color-text-main);">
                <div>Eligible Stock: <strong class="tabular-nums">${d.eligible_stock}</strong></div>
                <div>Reorder Threshold: <strong class="tabular-nums">${d.reorder_level}</strong></div>
                <div>30d Dispense Velocity: <strong class="tabular-nums">${d.sales_demand_30d} units</strong></div>
                <div>Open PO Incoming: <strong class="tabular-nums">${d.confirmed_incoming_po}</strong></div>
                <div>Pending PRs: <strong class="tabular-nums">${d.pending_requests}</strong></div>
                ${d.expired_stock > 0 ? `<div style="color: var(--color-critical); font-weight: 600;">Expired On-Hand: ${d.expired_stock}</div>` : ''}
              </div>
            </div>

            <!-- Suggested Action & Reason -->
            <div style="display: grid; grid-template-columns: 1fr; gap: 0.5rem; font-size: 0.875rem;">
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-md); padding: 0.65rem 0.85rem; color: #166534;">
                <strong>Suggested Action:</strong> ${escapeHtml(r.suggested_action)}
              </div>
              <div style="font-size: 0.8125rem; color: var(--color-text-muted);">
                <strong>Rationale:</strong> ${escapeHtml(r.reason)}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    targetSlot.innerHTML = `<div class="empty-state" style="color: var(--color-critical);">Failed to evaluate decision matrix: ${escapeHtml(err.message)}</div>`;
  }
}
