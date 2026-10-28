import { api } from './api.js';
import { getCurrentUser, hasRole } from './auth.js';
import { escapeHtml, formatCurrency, showToast, showConfirmModal, renderFormErrors, clearFormErrors } from './components.js';

let state = {
  items: [],
  total: 0,
  page: 1,
  size: 15,
  totalPages: 1,
  q: '',
  category: '',
  activeOnly: null,
};

export async function render(container) {
  const isAdmin = hasRole('ADMIN');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Medicines Master</h1>
        <div class="page-subtitle">Central pharmacy catalog of drugs, formulations, pricing, and reorder levels.</div>
      </div>
      <div>
        ${isAdmin ? `<button id="btn-add-medicine" class="btn btn-primary"><i data-lucide="plus" style="width: 16px; height: 16px;"></i> Add Medicine</button>` : ''}
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input-group">
        <i data-lucide="search" class="search-icon" style="width: 16px; height: 16px;"></i>
        <input type="text" id="med-search" placeholder="Search medicines by name or category..." value="${escapeHtml(state.q)}">
      </div>
      <div class="filter-controls">
        <select id="med-status-filter" class="form-select">
          <option value="">All Statuses</option>
          <option value="true" ${state.activeOnly === true ? 'selected' : ''}>Active Only</option>
          <option value="false" ${state.activeOnly === false ? 'selected' : ''}>Inactive Only</option>
        </select>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Medicine Name</th>
            <th>Category</th>
            <th>Strength / Unit</th>
            <th class="num-col">Selling Price</th>
            <th class="num-col">Reorder Level</th>
            <th class="num-col">Active Stock</th>
            <th>Status</th>
            ${isAdmin ? `<th style="text-align: right;">Actions</th>` : ''}
          </tr>
        </thead>
        <tbody id="med-table-body">
          <tr><td colspan="${isAdmin ? 8 : 7}" style="text-align: center; padding: 2rem;">Loading medicines...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pagination-bar" id="med-pagination"></div>

    <div id="medicine-modal-slot"></div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Attach search and filter handlers
  const searchInput = container.querySelector('#med-search');
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      state.page = 1;
      loadMedicines(container);
    }, 300);
  });

  const statusFilter = container.querySelector('#med-status-filter');
  statusFilter.addEventListener('change', (e) => {
    state.activeOnly = e.target.value === '' ? null : e.target.value === 'true';
    state.page = 1;
    loadMedicines(container);
  });

  if (isAdmin) {
    container.querySelector('#btn-add-medicine')?.addEventListener('click', () => {
      openMedicineModal(container, null);
    });
  }

  await loadMedicines(container);
}

async function loadMedicines(container) {
  const tbody = container.querySelector('#med-table-body');
  const pagination = container.querySelector('#med-pagination');
  const isAdmin = hasRole('ADMIN');

  try {
    const params = {
      page: state.page,
      size: state.size,
    };
    if (state.q) params.q = state.q;
    if (state.activeOnly !== null) params.active_only = state.activeOnly;

    const data = await api.get('/api/medicines', params);
    state.items = data.items;
    state.total = data.total;
    state.totalPages = data.total_pages;

    if (state.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">No medicines found matching criteria.</td></tr>`;
      pagination.innerHTML = '';
      return;
    }

    tbody.innerHTML = state.items.map(m => `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.category)}</td>
        <td>${escapeHtml(m.strength)} · ${escapeHtml(m.unit)}</td>
        <td class="num-col" style="font-weight: 600;">${formatCurrency(m.selling_price)}</td>
        <td class="num-col">${m.reorder_level}</td>
        <td class="num-col" style="font-weight: 600; color: ${m.total_stock <= m.reorder_level ? 'var(--color-critical)' : 'var(--color-healthy)'};">
          ${m.total_stock}
        </td>
        <td>
          <span class="status-badge ${m.active ? 'status-active' : 'status-inactive'}">
            ${m.active ? 'Active' : 'Deactivated'}
          </span>
        </td>
        ${isAdmin ? `
          <td style="text-align: right;">
            <button class="btn btn-outline btn-sm edit-med-btn" data-id="${m.id}" style="margin-right: 0.25rem;">Edit</button>
            <button class="btn ${m.active ? 'btn-outline' : 'btn-primary'} btn-sm toggle-status-btn" data-id="${m.id}" data-active="${m.active}">
              ${m.active ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        ` : ''}
      </tr>
    `).join('');

    // Pagination controls
    pagination.innerHTML = `
      <div>Showing ${((state.page - 1) * state.size) + 1} to ${Math.min(state.page * state.size, state.total)} of ${state.total} entries</div>
      <div class="pagination-controls">
        <button class="btn btn-outline btn-sm" id="prev-page" ${state.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span style="padding: 0 0.5rem;">Page ${state.page} of ${state.totalPages}</span>
        <button class="btn btn-outline btn-sm" id="next-page" ${state.page >= state.totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;

    pagination.querySelector('#prev-page')?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        loadMedicines(container);
      }
    });

    pagination.querySelector('#next-page')?.addEventListener('click', () => {
      if (state.page < state.totalPages) {
        state.page++;
        loadMedicines(container);
      }
    });

    // Edit and status handlers
    if (isAdmin) {
      tbody.querySelectorAll('.edit-med-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const med = state.items.find(x => x.id === btn.dataset.id);
          if (med) openMedicineModal(container, med);
        });
      });

      tbody.querySelectorAll('.toggle-status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const med = state.items.find(x => x.id === btn.dataset.id);
          if (!med) return;
          const nextActive = !med.active;
          showConfirmModal({
            title: nextActive ? 'Activate Medicine' : 'Deactivate Medicine',
            message: `Are you sure you want to ${nextActive ? 'activate' : 'deactivate'} "${med.name}"? Deactivated medicines cannot receive new batches or be sold.`,
            confirmText: nextActive ? 'Activate' : 'Deactivate',
            confirmClass: nextActive ? 'btn-primary' : 'btn-danger',
            onConfirm: async () => {
              try {
                await api.patch(`/api/medicines/${med.id}/status`, { active: nextActive });
                showToast(`Medicine "${med.name}" ${nextActive ? 'activated' : 'deactivated'}.`, 'success');
                loadMedicines(container);
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        });
      });
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" style="text-align: center; color: var(--color-critical); padding: 2rem;">Failed to load medicines: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function openMedicineModal(container, med) {
  const isEdit = !!med;
  const slot = container.querySelector('#medicine-modal-slot');

  slot.innerHTML = `
    <div class="modal-overlay" id="med-modal">
      <div class="modal-box" style="max-width: 500px;">
        <div class="modal-header">
          <h3 class="modal-title">${isEdit ? 'Edit Medicine' : 'Add New Medicine'}</h3>
          <button type="button" class="btn-icon" id="close-modal-btn">✕</button>
        </div>
        <form id="medicine-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="med-name">Medicine Name *</label>
              <input type="text" id="med-name" name="name" class="form-input" style="width: 100%;" required value="${isEdit ? escapeHtml(med.name) : ''}" placeholder="e.g. Paracetamol 650mg">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="med-category">Category *</label>
                <input type="text" id="med-category" name="category" class="form-input" style="width: 100%;" required value="${isEdit ? escapeHtml(med.category) : ''}" placeholder="e.g. Analgesics, Antibiotics">
              </div>

              <div class="form-group">
                <label class="form-label" for="med-strength">Strength *</label>
                <input type="text" id="med-strength" name="strength" class="form-input" style="width: 100%;" required value="${isEdit ? escapeHtml(med.strength) : ''}" placeholder="e.g. 500mg, 10ml">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="med-unit">Dispense Unit *</label>
                <input type="text" id="med-unit" name="unit" class="form-input" style="width: 100%;" required value="${isEdit ? escapeHtml(med.unit) : 'Tablet'}" placeholder="Tablet, Bottle, Vial">
              </div>

              <div class="form-group">
                <label class="form-label" for="med-reorder">Reorder Level *</label>
                <input type="number" id="med-reorder" name="reorder_level" class="form-input" style="width: 100%;" required min="0" value="${isEdit ? med.reorder_level : '20'}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="med-price">Selling Price (₹ Rupees) *</label>
              <input type="number" id="med-price" name="selling_price_rupees" class="form-input" style="width: 100%;" required min="0" step="0.01" value="${isEdit ? (med.selling_price / 100).toFixed(2) : '10.00'}" placeholder="e.g. 15.50">
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-modal-btn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="save-med-btn">${isEdit ? 'Save Changes' : 'Create Medicine'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#med-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-modal-btn').addEventListener('click', close);
  modal.querySelector('#cancel-modal-btn').addEventListener('click', close);

  const form = modal.querySelector('#medicine-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const priceRupees = parseFloat(form.selling_price_rupees.value);
    if (isNaN(priceRupees) || priceRupees < 0) {
      showToast('Please enter a valid non-negative selling price', 'error');
      return;
    }

    const payload = {
      name: form.name.value.trim(),
      category: form.category.value.trim(),
      strength: form.strength.value.trim(),
      unit: form.unit.value.trim(),
      reorder_level: parseInt(form.reorder_level.value, 10),
      selling_price: Math.round(priceRupees * 100), // convert to paise
    };

    const saveBtn = modal.querySelector('#save-med-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      if (isEdit) {
        await api.put(`/api/medicines/${med.id}`, payload);
        showToast('Medicine updated successfully', 'success');
      } else {
        await api.post('/api/medicines', payload);
        showToast('Medicine created successfully', 'success');
      }
      close();
      loadMedicines(container);
    } catch (err) {
      if (err.fieldErrors && err.fieldErrors.length > 0) {
        renderFormErrors(form, err.fieldErrors);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Medicine';
    }
  });
}
