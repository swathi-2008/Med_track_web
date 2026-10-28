import { api } from './api.js';
import { hasRole } from './auth.js';
import { escapeHtml, formatCurrency, formatDate, showToast, renderFormErrors, clearFormErrors } from './components.js';

let state = {
  items: [],
  medicines: [],
  suppliers: [],
  total: 0,
  page: 1,
  size: 15,
  totalPages: 1,
  q: '',
  status: '',
  medicineId: '',
};

export async function render(container) {
  const canCreate = hasRole('ADMIN', 'MANAGER', 'PURCHASE_STAFF');
  const canChangeStatus = hasRole('ADMIN', 'MANAGER');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Batch Inventory</h1>
        <div class="page-subtitle">Track specific manufactured lots, expiration dates, unit costs, and quarantine states.</div>
      </div>
      <div>
        ${canCreate ? `<button id="btn-add-batch" class="btn btn-primary"><i data-lucide="plus" style="width: 16px; height: 16px;"></i> Intake New Batch</button>` : ''}
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input-group">
        <i data-lucide="search" class="search-icon" style="width: 16px; height: 16px;"></i>
        <input type="text" id="batch-search" placeholder="Search batch number..." value="${escapeHtml(state.q)}">
      </div>
      <div class="filter-controls">
        <select id="batch-status-filter" class="form-select">
          <option value="">All Statuses</option>
          <option value="ACTIVE" ${state.status === 'ACTIVE' ? 'selected' : ''}>Active</option>
          <option value="QUARANTINED" ${state.status === 'QUARANTINED' ? 'selected' : ''}>Quarantined</option>
          <option value="RECALLED" ${state.status === 'RECALLED' ? 'selected' : ''}>Recalled</option>
          <option value="INACTIVE" ${state.status === 'INACTIVE' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Batch No</th>
            <th>Medicine</th>
            <th>Supplier</th>
            <th>Expiry Date</th>
            <th class="num-col">Days Left</th>
            <th class="num-col">Available / Recv</th>
            <th class="num-col">Unit Cost</th>
            <th>Status</th>
            ${canChangeStatus ? `<th style="text-align: right;">Action</th>` : ''}
          </tr>
        </thead>
        <tbody id="batch-table-body">
          <tr><td colspan="${canChangeStatus ? 9 : 8}" style="text-align: center; padding: 2rem;">Loading batches...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pagination-bar" id="batch-pagination"></div>
    <div id="batch-modal-slot"></div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const searchInput = container.querySelector('#batch-search');
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      state.page = 1;
      loadBatches(container);
    }, 300);
  });

  const statusFilter = container.querySelector('#batch-status-filter');
  statusFilter.addEventListener('change', (e) => {
    state.status = e.target.value;
    state.page = 1;
    loadBatches(container);
  });

  if (canCreate) {
    container.querySelector('#btn-add-batch')?.addEventListener('click', async () => {
      await openBatchIntakeModal(container);
    });
  }

  await loadBatches(container);
}

async function loadBatches(container) {
  const tbody = container.querySelector('#batch-table-body');
  const pagination = container.querySelector('#batch-pagination');
  const canChangeStatus = hasRole('ADMIN', 'MANAGER');

  try {
    const params = {
      page: state.page,
      size: state.size,
    };
    if (state.q) params.q = state.q;
    if (state.status) params.status = state.status;
    if (state.medicineId) params.medicine_id = state.medicineId;

    const data = await api.get('/api/batches', params);
    state.items = data.items;
    state.total = data.total;
    state.totalPages = data.total_pages;

    if (state.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${canChangeStatus ? 9 : 8}" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">No batches found matching criteria.</td></tr>`;
      pagination.innerHTML = '';
      return;
    }

    tbody.innerHTML = state.items.map(b => {
      let riskBadgeClass = 'status-healthy';
      if (b.risk_category === 'EXPIRED' || b.risk_category === 'CRITICAL') {
        riskBadgeClass = 'status-critical';
      } else if (b.risk_category === 'HIGH' || b.risk_category === 'MEDIUM') {
        riskBadgeClass = 'status-warning';
      }

      let statusBadgeClass = 'status-active';
      if (b.status === 'QUARANTINED') statusBadgeClass = 'status-quarantined';
      if (b.status === 'RECALLED') statusBadgeClass = 'status-critical';
      if (b.status === 'INACTIVE') statusBadgeClass = 'status-inactive';

      return `
        <tr>
          <td style="font-weight: 600; font-family: var(--font-mono);">${escapeHtml(b.batch_number)}</td>
          <td>${escapeHtml(b.medicine_name || '-')}</td>
          <td>${escapeHtml(b.supplier_name || '-')}</td>
          <td>${formatDate(b.expiry_date)}</td>
          <td class="num-col" style="font-weight: 600;">
            <span class="status-badge ${riskBadgeClass}">
              ${b.days_to_expiry !== null ? (b.days_to_expiry < 0 ? `${Math.abs(b.days_to_expiry)}d ago` : `${b.days_to_expiry}d`) : '-'}
            </span>
          </td>
          <td class="num-col" style="font-weight: 600;">${b.quantity_available} <span style="font-weight: normal; color: var(--color-text-muted);">/ ${b.quantity_received}</span></td>
          <td class="num-col">${formatCurrency(b.purchase_price)}</td>
          <td>
            <span class="status-badge ${statusBadgeClass}">${escapeHtml(b.status)}</span>
          </td>
          ${canChangeStatus ? `
            <td style="text-align: right;">
              <button class="btn btn-outline btn-sm change-status-btn" data-id="${b.id}" data-status="${b.status}">Change Status</button>
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    pagination.innerHTML = `
      <div>Showing ${((state.page - 1) * state.size) + 1} to ${Math.min(state.page * state.size, state.total)} of ${state.total} entries</div>
      <div class="pagination-controls">
        <button class="btn btn-outline btn-sm" id="prev-batch" ${state.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span style="padding: 0 0.5rem;">Page ${state.page} of ${state.totalPages}</span>
        <button class="btn btn-outline btn-sm" id="next-batch" ${state.page >= state.totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;

    pagination.querySelector('#prev-batch')?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        loadBatches(container);
      }
    });

    pagination.querySelector('#next-batch')?.addEventListener('click', () => {
      if (state.page < state.totalPages) {
        state.page++;
        loadBatches(container);
      }
    });

    if (canChangeStatus) {
      tbody.querySelectorAll('.change-status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const b = state.items.find(x => x.id === btn.dataset.id);
          if (b) openStatusChangeModal(container, b);
        });
      });
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${canChangeStatus ? 9 : 8}" style="text-align: center; color: var(--color-critical); padding: 2rem;">Failed to load batches: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function openBatchIntakeModal(container) {
  const slot = container.querySelector('#batch-modal-slot');

  // Load medicines & suppliers lists
  let medicines = [];
  let suppliers = [];
  try {
    const medResp = await api.get('/api/medicines', { active_only: true, size: 100 });
    medicines = medResp.items;
    const suppResp = await api.get('/api/suppliers', { active_only: true, size: 100 });
    suppliers = suppResp.items;
  } catch (e) {
    showToast('Failed to load medicine or supplier lists', 'error');
    return;
  }

  slot.innerHTML = `
    <div class="modal-overlay" id="batch-intake-modal">
      <div class="modal-box" style="max-width: 520px;">
        <div class="modal-header">
          <h3 class="modal-title">Intake New Batch</h3>
          <button type="button" class="btn-icon" id="close-modal-btn">✕</button>
        </div>
        <form id="batch-intake-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="b-med">Medicine *</label>
              <select id="b-med" name="medicine_id" class="form-select" style="width: 100%;" required>
                <option value="">Select a medicine...</option>
                ${medicines.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.strength)})</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="b-supp">Supplier (Optional)</label>
              <select id="b-supp" name="supplier_id" class="form-select" style="width: 100%;">
                <option value="">No supplier specified</option>
                ${suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="b-num">Batch Number *</label>
                <input type="text" id="b-num" name="batch_number" class="form-input" style="width: 100%;" required placeholder="e.g. BATCH-2026-X">
              </div>

              <div class="form-group">
                <label class="form-label" for="b-exp">Expiry Date (yyyy-MM-dd) *</label>
                <input type="date" id="b-exp" name="expiry_date" class="form-input" style="width: 100%;" required>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="b-qty">Quantity Received *</label>
                <input type="number" id="b-qty" name="quantity_received" class="form-input" style="width: 100%;" required min="1" value="100">
              </div>

              <div class="form-group">
                <label class="form-label" for="b-cost">Unit Purchase Cost (₹ Rupees) *</label>
                <input type="number" id="b-cost" name="purchase_cost_rupees" class="form-input" style="width: 100%;" required min="0" step="0.01" value="5.00">
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-modal-btn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="save-batch-btn">Record Intake</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#batch-intake-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-modal-btn').addEventListener('click', close);
  modal.querySelector('#cancel-modal-btn').addEventListener('click', close);

  const form = modal.querySelector('#batch-intake-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const costRupees = parseFloat(form.purchase_cost_rupees.value);
    if (isNaN(costRupees) || costRupees < 0) {
      showToast('Please enter a valid purchase price', 'error');
      return;
    }

    const payload = {
      medicine_id: form.medicine_id.value,
      supplier_id: form.supplier_id.value || null,
      batch_number: form.batch_number.value.trim(),
      expiry_date: form.expiry_date.value,
      quantity_received: parseInt(form.quantity_received.value, 10),
      purchase_price: Math.round(costRupees * 100),
    };

    const saveBtn = modal.querySelector('#save-batch-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await api.post('/api/batches', payload);
      showToast('Batch intake recorded successfully', 'success');
      close();
      loadBatches(container);
    } catch (err) {
      if (err.fieldErrors && err.fieldErrors.length > 0) {
        renderFormErrors(form, err.fieldErrors);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Record Intake';
    }
  });
}

function openStatusChangeModal(container, batch) {
  const slot = container.querySelector('#batch-modal-slot');

  slot.innerHTML = `
    <div class="modal-overlay" id="status-modal">
      <div class="modal-box" style="max-width: 440px;">
        <div class="modal-header">
          <h3 class="modal-title">Change Batch Status</h3>
          <button type="button" class="btn-icon" id="close-modal-btn">✕</button>
        </div>
        <form id="status-form">
          <div class="modal-body">
            <div style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--color-text-muted);">
              Batch: <strong style="color: var(--color-text-main); font-family: var(--font-mono);">${escapeHtml(batch.batch_number)}</strong> · Medicine: <strong style="color: var(--color-text-main);">${escapeHtml(batch.medicine_name)}</strong>
            </div>

            <div class="form-group">
              <label class="form-label" for="new-status">Target Status *</label>
              <select id="new-status" name="status" class="form-select" style="width: 100%;" required>
                <option value="ACTIVE" ${batch.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE (Available for FEFO Sales)</option>
                <option value="QUARANTINED" ${batch.status === 'QUARANTINED' ? 'selected' : ''}>QUARANTINED (Hold for Quality Review)</option>
                <option value="RECALLED" ${batch.status === 'RECALLED' ? 'selected' : ''}>RECALLED (Manufacturer Recall)</option>
                <option value="INACTIVE" ${batch.status === 'INACTIVE' ? 'selected' : ''}>INACTIVE (Disposed / Decommissioned)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="status-reason">Audit Reason * (Mandatory)</label>
              <textarea id="status-reason" name="reason" class="form-input" style="width: 100%; height: 80px; resize: none;" required placeholder="State regulatory or inspection justification for this change..."></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-modal-btn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="save-status-btn">Update Status</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#status-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-modal-btn').addEventListener('click', close);
  modal.querySelector('#cancel-modal-btn').addEventListener('click', close);

  const form = modal.querySelector('#status-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const reason = form.reason.value.trim();
    if (reason.length < 3) {
      showToast('A meaningful reason (minimum 3 characters) is required', 'error');
      return;
    }

    const payload = {
      status: form.status.value,
      reason,
    };

    const saveBtn = modal.querySelector('#save-status-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating...';

    try {
      await api.patch(`/api/batches/${batch.id}/status`, payload);
      showToast(`Batch status updated to ${payload.status}`, 'success');
      close();
      loadBatches(container);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Update Status';
    }
  });
}
