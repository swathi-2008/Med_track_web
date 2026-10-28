/**
 * MedTrack Audit Logs Module (ADMIN only)
 * Inspection of critical system mutations, approvals, and security events.
 */
import { apiGet } from './api.js';

export async function renderAuditLogs(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 tracking-tight">System Audit & Compliance Log</h2>
          <p class="text-sm text-slate-500">Immutable trail of inventory modifications, clinical quarantines, and authorization decisions</p>
        </div>
      </div>

      <div class="card p-4">
        <div class="flex items-center gap-3">
          <label class="text-xs text-slate-500 font-medium">Filter by Action:</label>
          <select id="audit-action-filter" class="form-input text-xs w-56">
            <option value="">All Actions</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="SALE_COMPLETED">SALE_COMPLETED</option>
            <option value="STOCK_QUARANTINED">STOCK_QUARANTINED</option>
            <option value="GOODS_RECEIVED">GOODS_RECEIVED</option>
            <option value="PURCHASE_REQUEST_APPROVED">PURCHASE_REQUEST_APPROVED</option>
            <option value="PURCHASE_REQUEST_REJECTED">PURCHASE_REQUEST_REJECTED</option>
            <option value="STOCK_ADJUSTMENT_APPROVED">STOCK_ADJUSTMENT_APPROVED</option>
            <option value="STOCK_ADJUSTMENT_REJECTED">STOCK_ADJUSTMENT_REJECTED</option>
          </select>
          <button id="audit-refresh-btn" class="btn btn-secondary text-xs">Refresh</button>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th class="p-3 font-medium">Timestamp</th>
                <th class="p-3 font-medium">Action</th>
                <th class="p-3 font-medium">Entity</th>
                <th class="p-3 font-medium">User</th>
                <th class="p-3 font-medium">Reference</th>
                <th class="p-3 font-medium">Reason / Details</th>
              </tr>
            </thead>
            <tbody id="audit-table-body" class="divide-y divide-slate-100 font-mono">
              <tr><td colspan="6" class="p-6 text-center text-slate-400 font-sans">Loading audit trail...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('audit-action-filter')?.addEventListener('change', loadAuditLogs);
  document.getElementById('audit-refresh-btn')?.addEventListener('click', loadAuditLogs);
  await loadAuditLogs();
}

async function loadAuditLogs() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  const action = document.getElementById('audit-action-filter')?.value;
  let url = '/api/audit-logs?limit=100';
  if (action) url += `&action=${encodeURIComponent(action)}`;

  try {
    const logs = await apiGet(url);
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 font-sans">No audit events found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr class="hover:bg-slate-50">
        <td class="p-3 text-slate-400 text-[11px] whitespace-nowrap">${new Date(l.created_at).toLocaleString()}</td>
        <td class="p-3 font-sans">
          <span class="inline-flex px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
            l.action.includes('REJECT') || l.action.includes('QUARANTINE') ? 'bg-rose-50 text-rose-700' :
            l.action.includes('APPROV') || l.action.includes('SUCCESS') ? 'bg-emerald-50 text-emerald-700' :
            'bg-slate-100 text-slate-700'
          }">
            ${escapeHtml(l.action)}
          </span>
        </td>
        <td class="p-3 font-sans text-slate-700">${escapeHtml(l.entity_type)}</td>
        <td class="p-3 font-sans text-slate-800 font-medium">${escapeHtml(l.username || 'System')}</td>
        <td class="p-3 text-slate-500">${escapeHtml(l.reference_id || l.entity_id || '—')}</td>
        <td class="p-3 font-sans text-slate-600 max-w-xs truncate" title="${escapeHtml(l.details || l.reason || '')}">
          ${escapeHtml(l.reason || l.details || '—')}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-rose-500 font-sans">Failed to load audit logs: ${err.message}</td></tr>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const render = renderAuditLogs;

