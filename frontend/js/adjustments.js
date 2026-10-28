import { api } from './api.js';
import { getCurrentUser, hasRole } from './auth.js';
import { escapeHtml, formatDate, showToast, showConfirmModal } from './components.js';

export async function render(container) {
  const canApprove = hasRole('ADMIN', 'MANAGER');
  const canRequest = hasRole('ADMIN', 'MANAGER', 'PURCHASE_STAFF', 'SALES_STAFF');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Stock Adjustments</h1>
        <div class="page-subtitle">Discrepancy reconciliation, breakage, damaged write-offs, and count adjustments.</div>
      </div>
      <div>
        ${canRequest ? `<button id="btn-request-adj" class="btn btn-primary btn-sm"><i data-lucide="plus" style="width: 14px; height: 14px;"></i> Request Adjustment</button>` : ''}
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Medicine</th>
            <th>Batch No</th>
            <th class="num-col">Adjusted Delta</th>
            <th>Reason</th>
            <th>Requested By</th>
            <th>Status</th>
            ${canApprove ? `<th style="text-align: right;">Review Action</th>` : ''}
          </tr>
        </thead>
        <tbody id="adj-table-body">
          <tr><td colspan="${canApprove ? 8 : 7}" style="text-align: center; padding: 2rem;">Loading adjustments...</td></tr>
        </tbody>
      </table>
    </div>

    <div id="adj-modal-slot"></div>
  `;

  if (window.lucide) window.lucide.createIcons();

  if (canRequest) {
    container.querySelector('#btn-request-adj')?.addEventListener('click', () => openAdjustmentRequestModal(container));
  }

  await loadAdjustments(container);
}

async function loadAdjustments(container) {
  const tbody = container.querySelector('#adj-table-body');
  const canApprove = hasRole('ADMIN', 'MANAGER');

  try {
    const list = await api.get('/api/stock-adjustments');
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${canApprove ? 8 : 7}" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">No stock adjustments requested.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(a => {
      let badgeClass = 'status-pending';
      if (a.status === 'APPROVED') badgeClass = 'status-approved';
      if (a.status === 'REJECTED') badgeClass = 'status-rejected';

      const deltaFormatted = a.adjusted_quantity > 0 ? `+${a.adjusted_quantity}` : `${a.adjusted_quantity}`;

      return `
        <tr>
          <td>${formatDate(a.created_at)}</td>
          <td><strong>${escapeHtml(a.medicine_name)}</strong></td>
          <td style="font-family: var(--font-mono);">${escapeHtml(a.batch_number)}</td>
          <td class="num-col" style="font-weight: 700; color: ${a.adjusted_quantity < 0 ? 'var(--color-critical)' : 'var(--color-healthy)'};">
            ${deltaFormatted}
          </td>
          <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(a.reason)}">
            ${escapeHtml(a.reason)}
          </td>
          <td>${escapeHtml(a.requested_by_name)}</td>
          <td><span class="status-badge ${badgeClass}">${escapeHtml(a.status)}</span></td>
          ${canApprove ? `
            <td style="text-align: right;">
              ${a.status === 'PENDING' ? `
                <button class="btn btn-outline btn-sm approve-adj-btn" data-id="${a.id}" style="color: var(--color-healthy); margin-right: 0.25rem;">Approve</button>
                <button class="btn btn-outline btn-sm reject-adj-btn" data-id="${a.id}" style="color: var(--color-critical);">Reject</button>
              ` : `
                <span style="font-size: 0.8rem; color: var(--color-text-muted);">${escapeHtml(a.status)}</span>
              `}
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    if (canApprove) {
      tbody.querySelectorAll('.approve-adj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const adjId = btn.dataset.id;
          showConfirmModal({
            title: 'Approve Stock Adjustment',
            message: 'Approving this adjustment will immediately modify the batch available inventory in the warehouse.',
            confirmText: 'Approve',
            confirmClass: 'btn-primary',
            onConfirm: async () => {
              try {
                await api.post(`/api/stock-adjustments/${adjId}/approve`, {});
                showToast('Adjustment approved and inventory updated.', 'success');
                loadAdjustments(container);
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        });
      });

      tbody.querySelectorAll('.reject-adj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const adjId = btn.dataset.id;
          openRejectAdjustmentModal(container, adjId, () => loadAdjustments(container));
        });
      });
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${canApprove ? 8 : 7}" style="text-align: center; color: var(--color-critical); padding: 2rem;">Failed to load adjustments: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function openAdjustmentRequestModal(container) {
  const slot = container.querySelector('#adj-modal-slot');
  let batches = [];
  try {
    const bResp = await api.get('/api/batches', { size: 100 });
    batches = bResp.items;
  } catch (e) {
    showToast('Failed to load batches list', 'error');
    return;
  }

  slot.innerHTML = `
    <div class="modal-overlay" id="adj-req-modal">
      <div class="modal-box" style="max-width: 460px;">
        <div class="modal-header">
          <h3 class="modal-title">Request Stock Adjustment</h3>
          <button type="button" class="btn-icon" id="close-adj-modal-btn">✕</button>
        </div>
        <form id="adj-req-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="adj-batch">Target Batch *</label>
              <select id="adj-batch" name="batch_id" class="form-select" style="width: 100%;" required>
                <option value="">Select a batch...</option>
                ${batches.map(b => `<option value="${b.id}">${escapeHtml(b.medicine_name)} · Lot ${escapeHtml(b.batch_number)} (Avail: ${b.quantity_available})</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="adj-delta">Adjusted Quantity (+ or - Delta) *</label>
              <input type="number" id="adj-delta" name="adjusted_quantity" class="form-input" style="width: 100%;" required placeholder="e.g. -5 for damaged bottles, +10 for recount find">
              <div style="font-size: 0.72rem; color: var(--color-text-muted); margin-top: 0.25rem;">
                Use a negative number to write off damaged stock, or positive for count correction.
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="adj-reason">Audit Justification *</label>
              <textarea id="adj-reason" name="reason" class="form-input" style="width: 100%; height: 75px; resize: none;" required placeholder="State breakage, damage report, or physical count discrepancy"></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-adj-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Submit for Manager Review</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#adj-req-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-adj-modal-btn').addEventListener('click', close);
  modal.querySelector('#cancel-adj-btn').addEventListener('click', close);

  const form = modal.querySelector('#adj-req-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const delta = parseInt(form.adjusted_quantity.value, 10);
    if (isNaN(delta) || delta === 0) {
      showToast('Adjustment quantity must be non-zero', 'error');
      return;
    }

    const payload = {
      batch_id: form.batch_id.value,
      adjusted_quantity: delta,
      reason: form.reason.value.trim(),
    };

    try {
      await api.post('/api/stock-adjustments', payload);
      showToast('Stock adjustment requested for manager review.', 'success');
      close();
      loadAdjustments(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openRejectAdjustmentModal(container, adjId, onDone) {
  const slot = container.querySelector('#adj-modal-slot');
  slot.innerHTML = `
    <div class="modal-overlay" id="reject-adj-modal">
      <div class="modal-box" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title">Reject Stock Adjustment</h3>
          <button type="button" class="btn-icon" id="close-reject-adj-btn">✕</button>
        </div>
        <form id="reject-adj-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="adj-rej-reason">Rejection Reason *</label>
              <textarea id="adj-rej-reason" name="reason" class="form-input" style="width: 100%; height: 80px; resize: none;" required placeholder="State why adjustment cannot be authorized"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-reject-adj-btn">Cancel</button>
            <button type="submit" class="btn btn-danger">Confirm Rejection</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#reject-adj-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-reject-adj-btn').addEventListener('click', close);
  modal.querySelector('#cancel-reject-adj-btn').addEventListener('click', close);

  modal.querySelector('#reject-adj-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = e.target.reason.value.trim();
    if (reason.length < 3) {
      showToast('Rejection reason must be at least 3 characters', 'error');
      return;
    }

    try {
      await api.post(`/api/stock-adjustments/${adjId}/reject`, { reason });
      showToast('Stock adjustment rejected.', 'success');
      close();
      onDone();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
