/**
 * MedTrack Reports & CSV Export Module
 * Financial valuation, shelf-life audit, sales registers, and movement ledgers.
 */
import { apiGet } from './api.js';

let currentReportType = 'inventory';

export async function renderReports(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 tracking-tight">Reports & Regulatory Audit Exports</h2>
          <p class="text-sm text-slate-500">Valuation sheets, expiry risk ledgers, sales registers, and CSV downloads</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="reports-export-csv-btn" class="btn btn-secondary text-xs flex items-center gap-1.5">
            <svg class="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            Export to CSV
          </button>
        </div>
      </div>

      <!-- Filter Controls & Report Selector -->
      <div class="card p-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap gap-2" id="report-type-selector">
            <button class="btn btn-primary text-xs" data-type="inventory">Inventory Valuation</button>
            <button class="btn btn-secondary text-xs" data-type="expiry">Expiry Risk Audit</button>
            <button class="btn btn-secondary text-xs" data-type="sales">Sales Register</button>
            <button class="btn btn-secondary text-xs" data-type="purchases">Purchase Register</button>
            <button class="btn btn-secondary text-xs" data-type="stock-movements">Stock Ledger</button>
          </div>

          <div class="flex items-center gap-2" id="report-date-filters">
            <label class="text-xs text-slate-500 font-medium">From:</label>
            <input type="date" id="report-start-date" class="form-input text-xs py-1 px-2 w-36">
            <label class="text-xs text-slate-500 font-medium">To:</label>
            <input type="date" id="report-end-date" class="form-input text-xs py-1 px-2 w-36">
            <button id="report-filter-apply-btn" class="btn btn-secondary text-xs">Filter</button>
          </div>
        </div>
      </div>

      <!-- Report Summary KPIs -->
      <div id="report-kpis" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"></div>

      <!-- Report Data Table -->
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs" id="report-data-table">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200" id="report-table-head"></thead>
            <tbody class="divide-y divide-slate-100 font-mono" id="report-table-body">
              <tr><td class="p-6 text-center text-slate-400 font-sans">Select a report to generate data.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  setupEventListeners();
  await loadReport(currentReportType);
}

function setupEventListeners() {
  const typeSelector = document.getElementById('report-type-selector');
  typeSelector.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      typeSelector.querySelectorAll('button').forEach(b => {
        b.className = 'btn btn-secondary text-xs';
      });
      btn.className = 'btn btn-primary text-xs';
      currentReportType = btn.getAttribute('data-type');
      await loadReport(currentReportType);
    });
  });

  const filterBtn = document.getElementById('report-filter-apply-btn');
  filterBtn?.addEventListener('click', async () => {
    await loadReport(currentReportType);
  });

  const csvBtn = document.getElementById('reports-export-csv-btn');
  csvBtn?.addEventListener('click', () => {
    triggerCsvExport(currentReportType);
  });
}

function getFilterParams() {
  const start = document.getElementById('report-start-date')?.value;
  const end = document.getElementById('report-end-date')?.value;
  let params = new URLSearchParams();
  if (start) params.append('start_date', start);
  if (end) params.append('end_date', end);
  return params;
}

function triggerCsvExport(type) {
  const params = getFilterParams();
  params.append('format', 'csv');
  const url = `/api/reports/${type}?${params.toString()}`;
  window.location.href = url;
}

async function loadReport(type) {
  const thead = document.getElementById('report-table-head');
  const tbody = document.getElementById('report-table-body');
  const kpis = document.getElementById('report-kpis');
  tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400 font-sans">Compiling data...</td></tr>`;

  try {
    const params = getFilterParams();
    const data = await apiGet(`/api/reports/${type}?${params.toString()}`);

    if (type === 'inventory') {
      renderInventoryReport(data, thead, tbody, kpis);
    } else if (type === 'expiry') {
      renderExpiryReport(data, thead, tbody, kpis);
    } else if (type === 'sales') {
      renderSalesReport(data, thead, tbody, kpis);
    } else if (type === 'purchases') {
      renderPurchasesReport(data, thead, tbody, kpis);
    } else if (type === 'stock-movements') {
      renderStockMovementsReport(data, thead, tbody, kpis);
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-rose-500 font-sans">Failed to load report: ${err.message}</td></tr>`;
  }
}

function renderInventoryReport(data, thead, tbody, kpis) {
  const sum = data.summary;
  kpis.innerHTML = `
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Medicines</div>
      <div class="text-xl font-bold font-mono text-slate-900">${sum.total_medicines}</div>
      <div class="text-xs text-slate-500 mt-1">${sum.total_units} units in eligible stock</div>
    </div>
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Inventory Cost Basis</div>
      <div class="text-xl font-bold font-mono text-slate-900">${sum.total_cost_valuation_display}</div>
      <div class="text-xs text-slate-500 mt-1">Acquisition valuation</div>
    </div>
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Retail Potential</div>
      <div class="text-xl font-bold font-mono text-emerald-700">${sum.total_retail_valuation_display}</div>
      <div class="text-xs text-slate-500 mt-1">Dispensing selling valuation</div>
    </div>
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Potential Gross Margin</div>
      <div class="text-xl font-bold font-mono text-teal-700">${sum.potential_margin_display}</div>
      <div class="text-xs text-slate-500 mt-1">Unrealized retail profit</div>
    </div>
  `;

  thead.innerHTML = `
    <tr>
      <th class="p-3 font-medium">Medicine</th>
      <th class="p-3 font-medium">Category</th>
      <th class="p-3 font-medium text-right">Reorder Lvl</th>
      <th class="p-3 font-medium text-right">Eligible Stock</th>
      <th class="p-3 font-medium text-right">Active Batches</th>
      <th class="p-3 font-medium text-right">Cost Value</th>
      <th class="p-3 font-medium text-right">Retail Value</th>
      <th class="p-3 font-medium text-center">Status</th>
    </tr>
  `;

  tbody.innerHTML = data.records.map(r => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-sans font-medium text-slate-900">${escapeHtml(r.name)} <span class="text-slate-400 font-normal">(${r.strength})</span></td>
      <td class="p-3 font-sans text-slate-600">${escapeHtml(r.category)}</td>
      <td class="p-3 text-right text-slate-500">${r.reorder_level}</td>
      <td class="p-3 text-right font-bold ${r.current_stock <= r.reorder_level ? 'text-rose-700' : 'text-slate-900'}">${r.current_stock} ${r.unit}</td>
      <td class="p-3 text-right text-slate-600">${r.active_batches_count}</td>
      <td class="p-3 text-right text-slate-600">${r.cost_valuation_display}</td>
      <td class="p-3 text-right font-semibold text-slate-900">${r.retail_valuation_display}</td>
      <td class="p-3 text-center font-sans">
        <span class="inline-flex px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
          r.status === 'ADEQUATE' ? 'bg-emerald-50 text-emerald-700' :
          r.status === 'LOW_STOCK' ? 'bg-amber-50 text-amber-700' :
          'bg-rose-50 text-rose-700'
        }">${r.status}</span>
      </td>
    </tr>
  `).join('');
}

function renderExpiryReport(data, thead, tbody, kpis) {
  const sum = data.summary;
  kpis.innerHTML = `
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Monitored Lots</div>
      <div class="text-xl font-bold font-mono text-slate-900">${sum.total_lots}</div>
      <div class="text-xs text-slate-500 mt-1">Batches with positive on-hand stock</div>
    </div>
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Cost At Risk</div>
      <div class="text-xl font-bold font-mono text-amber-700">${sum.total_cost_at_risk_display}</div>
      <div class="text-xs text-slate-500 mt-1">Potential write-off exposure</div>
    </div>
  `;

  thead.innerHTML = `
    <tr>
      <th class="p-3 font-medium">Batch</th>
      <th class="p-3 font-medium">Medicine</th>
      <th class="p-3 font-medium">Supplier</th>
      <th class="p-3 font-medium text-right">Expiry Date</th>
      <th class="p-3 font-medium text-right">Days Left</th>
      <th class="p-3 font-medium text-right">Qty Available</th>
      <th class="p-3 font-medium text-right">Cost At Risk</th>
      <th class="p-3 font-medium text-center">Risk Band</th>
    </tr>
  `;

  tbody.innerHTML = data.records.map(r => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-mono font-medium text-slate-800">${escapeHtml(r.batch_number)}</td>
      <td class="p-3 font-sans font-medium text-slate-900">${escapeHtml(r.medicine_name)}</td>
      <td class="p-3 font-sans text-slate-500">${escapeHtml(r.supplier_name)}</td>
      <td class="p-3 text-right text-slate-600">${r.expiry_date}</td>
      <td class="p-3 text-right font-bold ${r.days_to_expiry < 0 ? 'text-rose-600' : r.days_to_expiry <= 7 ? 'text-orange-600' : 'text-slate-700'}">${r.days_to_expiry}d</td>
      <td class="p-3 text-right">${r.quantity_available}</td>
      <td class="p-3 text-right font-semibold text-slate-900">${r.cost_at_risk_display}</td>
      <td class="p-3 text-center font-sans">
        <span class="inline-flex px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
          r.risk_band === 'EXPIRED' ? 'bg-rose-100 text-rose-800' :
          r.risk_band === 'CRITICAL' ? 'bg-orange-100 text-orange-800' :
          r.risk_band === 'HIGH' ? 'bg-amber-100 text-amber-800' :
          r.risk_band === 'MEDIUM' ? 'bg-blue-100 text-blue-800' :
          'bg-slate-100 text-slate-700'
        }">${r.risk_band}</span>
      </td>
    </tr>
  `).join('');
}

function renderSalesReport(data, thead, tbody, kpis) {
  const sum = data.summary;
  kpis.innerHTML = `
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Orders Billed</div>
      <div class="text-xl font-bold font-mono text-slate-900">${sum.total_sales_count}</div>
      <div class="text-xs text-slate-500 mt-1">${sum.total_items_sold} units dispensed</div>
    </div>
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Sales Revenue</div>
      <div class="text-xl font-bold font-mono text-emerald-700">${sum.total_revenue_display}</div>
      <div class="text-xs text-slate-500 mt-1">Completed counter sales</div>
    </div>
  `;

  thead.innerHTML = `
    <tr>
      <th class="p-3 font-medium">Reference</th>
      <th class="p-3 font-medium">Cashier</th>
      <th class="p-3 font-medium text-right">Items</th>
      <th class="p-3 font-medium text-right">Total (INR)</th>
      <th class="p-3 font-medium text-center">Status</th>
      <th class="p-3 font-medium text-right">Date & Time</th>
    </tr>
  `;

  tbody.innerHTML = data.records.map(r => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-mono font-medium text-slate-800">${escapeHtml(r.reference_number)}</td>
      <td class="p-3 font-sans text-slate-700">${escapeHtml(r.cashier)}</td>
      <td class="p-3 text-right text-slate-600">${r.items_count}</td>
      <td class="p-3 text-right font-bold text-slate-900">${r.total_amount_display}</td>
      <td class="p-3 text-center font-sans">
        <span class="inline-flex px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-emerald-50 text-emerald-700">${r.status}</span>
      </td>
      <td class="p-3 text-right text-slate-500 text-[11px]">${new Date(r.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

function renderPurchasesReport(data, thead, tbody, kpis) {
  const sum = data.summary;
  kpis.innerHTML = `
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Purchase Orders</div>
      <div class="text-xl font-bold font-mono text-slate-900">${sum.total_pos}</div>
      <div class="text-xs text-slate-500 mt-1">Supplier commitments</div>
    </div>
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Procurement Spend</div>
      <div class="text-xl font-bold font-mono text-blue-700">${sum.total_spend_display}</div>
      <div class="text-xs text-slate-500 mt-1">Committed inventory cost</div>
    </div>
  `;

  thead.innerHTML = `
    <tr>
      <th class="p-3 font-medium">PO Number</th>
      <th class="p-3 font-medium">Supplier</th>
      <th class="p-3 font-medium text-right">Ordered</th>
      <th class="p-3 font-medium text-right">Received</th>
      <th class="p-3 font-medium text-right">Total Amount</th>
      <th class="p-3 font-medium text-center">Status</th>
      <th class="p-3 font-medium text-right">Date</th>
    </tr>
  `;

  tbody.innerHTML = data.records.map(r => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-mono font-medium text-slate-800">${escapeHtml(r.po_number)}</td>
      <td class="p-3 font-sans text-slate-700">${escapeHtml(r.supplier_name)}</td>
      <td class="p-3 text-right text-slate-600">${r.units_ordered}</td>
      <td class="p-3 text-right font-medium text-slate-800">${r.units_received}</td>
      <td class="p-3 text-right font-bold text-slate-900">${r.total_amount_display}</td>
      <td class="p-3 text-center font-sans">
        <span class="inline-flex px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
          r.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' :
          r.status === 'OPEN' ? 'bg-blue-50 text-blue-700' :
          'bg-amber-50 text-amber-700'
        }">${r.status}</span>
      </td>
      <td class="p-3 text-right text-slate-500 text-[11px]">${new Date(r.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('');
}

function renderStockMovementsReport(data, thead, tbody, kpis) {
  kpis.innerHTML = `
    <div class="card p-4">
      <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Total Ledger Entries</div>
      <div class="text-xl font-bold font-mono text-slate-900">${data.count}</div>
      <div class="text-xs text-slate-500 mt-1">Chronological transaction history</div>
    </div>
  `;

  thead.innerHTML = `
    <tr>
      <th class="p-3 font-medium">Type</th>
      <th class="p-3 font-medium">Medicine</th>
      <th class="p-3 font-medium">Batch</th>
      <th class="p-3 font-medium text-right">Delta</th>
      <th class="p-3 font-medium">Ref</th>
      <th class="p-3 font-medium">Reason</th>
      <th class="p-3 font-medium text-right">Timestamp</th>
    </tr>
  `;

  tbody.innerHTML = data.records.map(r => {
    const isPos = r.quantity_delta > 0;
    return `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-sans">
          <span class="inline-flex px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
            r.transaction_type === 'SALE' ? 'bg-emerald-50 text-emerald-800' :
            r.transaction_type === 'RECEIPT' ? 'bg-blue-50 text-blue-800' :
            r.transaction_type === 'QUARANTINE' ? 'bg-rose-50 text-rose-800' :
            'bg-amber-50 text-amber-800'
          }">${r.transaction_type}</span>
        </td>
        <td class="p-3 font-sans font-medium text-slate-800">${escapeHtml(r.medicine_name)}</td>
        <td class="p-3 font-mono text-slate-600">${escapeHtml(r.batch_number)}</td>
        <td class="p-3 text-right font-bold ${isPos ? 'text-emerald-700' : 'text-rose-700'}">${isPos ? '+' : ''}${r.quantity_delta}</td>
        <td class="p-3 font-sans text-slate-500">${escapeHtml(r.reference_type || '—')}</td>
        <td class="p-3 font-sans text-slate-500">${escapeHtml(r.reason || '—')}</td>
        <td class="p-3 text-right text-slate-400 text-[11px]">${new Date(r.timestamp).toLocaleString()}</td>
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

export const render = renderReports;

