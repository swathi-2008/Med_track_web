import { api } from './api.js';
import { hasRole } from './auth.js';
import { escapeHtml, showToast, renderFormErrors, clearFormErrors } from './components.js';

let state = {
  items: [],
  total: 0,
  page: 1,
  size: 15,
  totalPages: 1,
  q: '',
};

export async function render(container) {
  const canManage = hasRole('ADMIN', 'PURCHASE_STAFF');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Suppliers Directory</h1>
        <div class="page-subtitle">Pharmaceutical distributors, contact details, and procurement partners.</div>
      </div>
      <div>
        ${canManage ? `<button id="btn-add-supplier" class="btn btn-primary"><i data-lucide="plus" style="width: 16px; height: 16px;"></i> Add Supplier</button>` : ''}
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-input-group">
        <i data-lucide="search" class="search-icon" style="width: 16px; height: 16px;"></i>
        <input type="text" id="supplier-search" placeholder="Search suppliers by name, contact or email..." value="${escapeHtml(state.q)}">
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Supplier Name</th>
            <th>Contact Person</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Address</th>
            <th>Status</th>
            ${canManage ? `<th style="text-align: right;">Actions</th>` : ''}
          </tr>
        </thead>
        <tbody id="supplier-table-body">
          <tr><td colspan="${canManage ? 7 : 6}" style="text-align: center; padding: 2rem;">Loading suppliers...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pagination-bar" id="supplier-pagination"></div>
    <div id="supplier-modal-slot"></div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const searchInput = container.querySelector('#supplier-search');
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      state.page = 1;
      loadSuppliers(container);
    }, 300);
  });

  if (canManage) {
    container.querySelector('#btn-add-supplier')?.addEventListener('click', () => {
      openSupplierModal(container, null);
    });
  }

  await loadSuppliers(container);
}

async function loadSuppliers(container) {
  const tbody = container.querySelector('#supplier-table-body');
  const pagination = container.querySelector('#supplier-pagination');
  const canManage = hasRole('ADMIN', 'PURCHASE_STAFF');

  try {
    const data = await api.get('/api/suppliers', { page: state.page, size: state.size, q: state.q });
    state.items = data.items;
    state.total = data.total;
    state.totalPages = data.total_pages;

    if (state.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${canManage ? 7 : 6}" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">No suppliers found.</td></tr>`;
      pagination.innerHTML = '';
      return;
    }

    tbody.innerHTML = state.items.map(s => `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.contact_person)}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.phone)}</td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(s.address)}</td>
        <td>
          <span class="status-badge ${s.active ? 'status-active' : 'status-inactive'}">
            ${s.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        ${canManage ? `
          <td style="text-align: right;">
            <button class="btn btn-outline btn-sm edit-supplier-btn" data-id="${s.id}">Edit</button>
          </td>
        ` : ''}
      </tr>
    `).join('');

    pagination.innerHTML = `
      <div>Showing ${((state.page - 1) * state.size) + 1} to ${Math.min(state.page * state.size, state.total)} of ${state.total} entries</div>
      <div class="pagination-controls">
        <button class="btn btn-outline btn-sm" id="prev-supp" ${state.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span style="padding: 0 0.5rem;">Page ${state.page} of ${state.totalPages}</span>
        <button class="btn btn-outline btn-sm" id="next-supp" ${state.page >= state.totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;

    pagination.querySelector('#prev-supp')?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        loadSuppliers(container);
      }
    });

    pagination.querySelector('#next-supp')?.addEventListener('click', () => {
      if (state.page < state.totalPages) {
        state.page++;
        loadSuppliers(container);
      }
    });

    if (canManage) {
      tbody.querySelectorAll('.edit-supplier-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = state.items.find(x => x.id === btn.dataset.id);
          if (s) openSupplierModal(container, s);
        });
      });
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${canManage ? 7 : 6}" style="text-align: center; color: var(--color-critical); padding: 2rem;">Failed to load suppliers: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function openSupplierModal(container, s) {
  const isEdit = !!s;
  const slot = container.querySelector('#supplier-modal-slot');

  slot.innerHTML = `
    <div class="modal-overlay" id="supp-modal">
      <div class="modal-box" style="max-width: 480px;">
        <div class="modal-header">
          <h3 class="modal-title">${isEdit ? 'Edit Supplier' : 'Add New Supplier'}</h3>
          <button type="button" class="btn-icon" id="close-modal-btn">✕</button>
        </div>
        <form id="supplier-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="s-name">Company / Supplier Name *</label>
              <input type="text" id="s-name" name="name" class="form-input" style="width: 100%;" required value="${isEdit ? escapeHtml(s.name) : ''}">
            </div>

            <div class="form-group">
              <label class="form-label" for="s-contact">Contact Person *</label>
              <input type="text" id="s-contact" name="contact_person" class="form-input" style="width: 100%;" required value="${isEdit ? escapeHtml(s.contact_person) : ''}">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="s-email">Email *</label>
                <input type="email" id="s-email" name="email" class="form-input" style="width: 100%;" required value="${isEdit ? escapeHtml(s.email) : ''}">
              </div>

              <div class="form-group">
                <label class="form-label" for="s-phone">Phone *</label>
                <input type="text" id="s-phone" name="phone" class="form-input" style="width: 100%;" required value="${isEdit ? escapeHtml(s.phone) : ''}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="s-address">Address *</label>
              <textarea id="s-address" name="address" class="form-input" style="width: 100%; height: 75px; resize: none;" required>${isEdit ? escapeHtml(s.address) : ''}</textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-modal-btn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="save-supp-btn">${isEdit ? 'Save Changes' : 'Create Supplier'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#supp-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-modal-btn').addEventListener('click', close);
  modal.querySelector('#cancel-modal-btn').addEventListener('click', close);

  const form = modal.querySelector('#supplier-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const payload = {
      name: form.name.value.trim(),
      contact_person: form.contact_person.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      address: form.address.value.trim(),
    };

    const saveBtn = modal.querySelector('#save-supp-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      if (isEdit) {
        await api.put(`/api/suppliers/${s.id}`, payload);
        showToast('Supplier updated successfully', 'success');
      } else {
        await api.post('/api/suppliers', payload);
        showToast('Supplier created successfully', 'success');
      }
      close();
      loadSuppliers(container);
    } catch (err) {
      if (err.fieldErrors && err.fieldErrors.length > 0) {
        renderFormErrors(form, err.fieldErrors);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Supplier';
    }
  });
}
