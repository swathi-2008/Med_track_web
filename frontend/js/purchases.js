import { api } from './api.js';
import { getCurrentUser, hasRole } from './auth.js';
import { escapeHtml, formatCurrency, formatDate, showToast, showConfirmModal } from './components.js';

let activeTab = 'requests'; // 'requests', 'orders', 'receipts'

export async function render(container) {
  const canApprove = hasRole('ADMIN', 'MANAGER');
  const canProcure = hasRole('ADMIN', 'PURCHASE_STAFF', 'MANAGER');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Purchasing & Receipts</h1>
        <div class="page-subtitle">Procurement cycle: low-stock requisition, approval hierarchy, purchase orders, and goods receipts.</div>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button id="tab-pr-btn" class="btn btn-sm ${activeTab === 'requests' ? 'btn-primary' : 'btn-outline'}">Purchase Requests</button>
        <button id="tab-po-btn" class="btn btn-sm ${activeTab === 'orders' ? 'btn-primary' : 'btn-outline'}">Purchase Orders</button>
      </div>
    </div>

    <div id="purchasing-tab-content"></div>
    <div id="purchasing-modal-slot"></div>
  `;

  if (window.lucide) window.lucide.createIcons();

  container.querySelector('#tab-pr-btn')?.addEventListener('click', () => {
    activeTab = 'requests';
    render(container);
  });

  container.querySelector('#tab-po-btn')?.addEventListener('click', () => {
    activeTab = 'orders';
    render(container);
  });

  const slot = container.querySelector('#purchasing-tab-content');
  if (activeTab === 'requests') {
    await renderRequestsTab(slot, container);
  } else {
    await renderOrdersTab(slot, container);
  }
}

async function renderRequestsTab(slot, mainContainer) {
  const canCreate = hasRole('ADMIN', 'PURCHASE_STAFF', 'MANAGER');
  const canApprove = hasRole('ADMIN', 'MANAGER');
  const currentUser = getCurrentUser();

  slot.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div style="font-size: 0.9rem; color: var(--color-text-muted);">
        Manager review required. Self-approval is strictly forbidden.
      </div>
      <div>
        ${canCreate ? `<button id="btn-create-pr" class="btn btn-primary btn-sm"><i data-lucide="plus" style="width: 14px; height: 14px;"></i> New Purchase Request</button>` : ''}
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Request Number</th>
            <th>Requested By</th>
            <th>Date</th>
            <th>Items Requested</th>
            <th>Status</th>
            <th>Reviewed By</th>
            ${canApprove ? `<th style="text-align: right;">Review Action</th>` : ''}
          </tr>
        </thead>
        <tbody id="pr-table-body">
          <tr><td colspan="${canApprove ? 7 : 6}" style="text-align: center; padding: 2rem;">Loading requests...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  if (canCreate) {
    slot.querySelector('#btn-create-pr')?.addEventListener('click', () => openNewRequestModal(mainContainer));
  }

  const tbody = slot.querySelector('#pr-table-body');
  try {
    const requests = await api.get('/api/purchase-requests');
    if (requests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${canApprove ? 7 : 6}" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">No purchase requests found.</td></tr>`;
      return;
    }

    tbody.innerHTML = requests.map(pr => {
      let badgeClass = 'status-pending';
      if (pr.status === 'APPROVED') badgeClass = 'status-approved';
      if (pr.status === 'REJECTED') badgeClass = 'status-rejected';

      const itemsDesc = pr.items.map(i => `${i.medicine_name} (${i.quantity_requested})`).join(', ');
      const isOwnRequest = pr.requested_by_id === currentUser?.id;

      return `
        <tr>
          <td style="font-weight: 600; font-family: var(--font-mono);">${escapeHtml(pr.request_number)}</td>
          <td>${escapeHtml(pr.requested_by_name)}</td>
          <td>${formatDate(pr.created_at)}</td>
          <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(itemsDesc)}">
            ${escapeHtml(itemsDesc)}
          </td>
          <td>
            <span class="status-badge ${badgeClass}">${escapeHtml(pr.status)}</span>
          </td>
          <td style="font-size: 0.8rem; color: var(--color-text-muted);">
            ${pr.reviewed_by_name ? `${escapeHtml(pr.reviewed_by_name)} ${pr.review_reason ? `(${escapeHtml(pr.review_reason)})` : ''}` : '-'}
          </td>
          ${canApprove ? `
            <td style="text-align: right;">
              ${pr.status === 'PENDING' ? `
                ${isOwnRequest ? `
                  <span style="font-size: 0.75rem; color: var(--color-text-muted); font-style: italic;">Self-approval forbidden</span>
                ` : `
                  <button class="btn btn-outline btn-sm approve-pr-btn" data-id="${pr.id}" style="color: var(--color-healthy); margin-right: 0.25rem;">Approve</button>
                  <button class="btn btn-outline btn-sm reject-pr-btn" data-id="${pr.id}" style="color: var(--color-critical);">Reject</button>
                `}
              ` : `
                <span style="font-size: 0.8rem; color: var(--color-text-muted);">${escapeHtml(pr.status)}</span>
              `}
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    if (canApprove) {
      tbody.querySelectorAll('.approve-pr-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const reqId = btn.dataset.id;
          showConfirmModal({
            title: 'Approve Purchase Request',
            message: 'Approve this purchase request? This will allow a Purchase Order to be raised. Stock does not change until goods are received.',
            confirmText: 'Approve',
            confirmClass: 'btn-primary',
            onConfirm: async () => {
              try {
                await api.post(`/api/purchase-requests/${reqId}/approve`, {});
                showToast('Purchase request approved successfully.', 'success');
                renderRequestsTab(slot, mainContainer);
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        });
      });

      tbody.querySelectorAll('.reject-pr-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const reqId = btn.dataset.id;
          openRejectModal(mainContainer, reqId, () => renderRequestsTab(slot, mainContainer));
        });
      });
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${canApprove ? 7 : 6}" style="text-align: center; color: var(--color-critical); padding: 2rem;">Failed to load purchase requests: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function renderOrdersTab(slot, mainContainer) {
  const canProcure = hasRole('ADMIN', 'PURCHASE_STAFF', 'MANAGER');

  slot.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div style="font-size: 0.9rem; color: var(--color-text-muted);">
        Purchase Orders raised to suppliers. Record goods receipts to increase warehouse stock.
      </div>
      <div>
        ${canProcure ? `<button id="btn-create-po" class="btn btn-primary btn-sm"><i data-lucide="plus" style="width: 14px; height: 14px;"></i> Raise Purchase Order</button>` : ''}
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>PO Number</th>
            <th>Supplier</th>
            <th>Date</th>
            <th>Lines / Outstanding</th>
            <th>Status</th>
            ${canProcure ? `<th style="text-align: right;">Intake Action</th>` : ''}
          </tr>
        </thead>
        <tbody id="po-table-body">
          <tr><td colspan="${canProcure ? 6 : 5}" style="text-align: center; padding: 2rem;">Loading purchase orders...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  if (canProcure) {
    slot.querySelector('#btn-create-po')?.addEventListener('click', () => openNewPOModal(mainContainer));
  }

  const tbody = slot.querySelector('#po-table-body');
  try {
    const orders = await api.get('/api/purchase-orders');
    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${canProcure ? 6 : 5}" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">No purchase orders found.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(po => {
      let badgeClass = 'status-pending';
      if (po.status === 'RECEIVED') badgeClass = 'status-approved';
      if (po.status === 'PARTIALLY_RECEIVED') badgeClass = 'status-warning';

      const totalOrdered = po.items.reduce((acc, i) => acc + i.quantity_ordered, 0);
      const totalRecv = po.items.reduce((acc, i) => acc + i.quantity_received, 0);
      const outstanding = totalOrdered - totalRecv;

      return `
        <tr>
          <td style="font-weight: 600; font-family: var(--font-mono);">${escapeHtml(po.po_number)}</td>
          <td>${escapeHtml(po.supplier_name)}</td>
          <td>${formatDate(po.created_at)}</td>
          <td>
            ${po.items.length} line(s) · Received <strong>${totalRecv}</strong> / ${totalOrdered} (${outstanding} outstanding)
          </td>
          <td><span class="status-badge ${badgeClass}">${escapeHtml(po.status)}</span></td>
          ${canProcure ? `
            <td style="text-align: right;">
              ${po.status !== 'RECEIVED' ? `
                <button class="btn btn-outline btn-sm receive-grn-btn" data-id="${po.id}">
                  <i data-lucide="package-check" style="width: 14px; height: 14px;"></i> Goods Receipt
                </button>
              ` : `
                <span class="status-badge status-healthy">Completed</span>
              `}
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    if (canProcure) {
      tbody.querySelectorAll('.receive-grn-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const po = orders.find(x => x.id === btn.dataset.id);
          if (po) openGoodsReceiptModal(mainContainer, po, () => renderOrdersTab(slot, mainContainer));
        });
      });
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${canProcure ? 6 : 5}" style="text-align: center; color: var(--color-critical); padding: 2rem;">Failed to load purchase orders: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function openNewRequestModal(mainContainer) {
  const slot = mainContainer.querySelector('#purchasing-modal-slot');
  let medicines = [];
  try {
    const medResp = await api.get('/api/medicines', { active_only: true, size: 100 });
    medicines = medResp.items;
  } catch (e) {
    showToast('Failed to load medicines', 'error');
    return;
  }

  slot.innerHTML = `
    <div class="modal-overlay" id="pr-modal">
      <div class="modal-box" style="max-width: 480px;">
        <div class="modal-header">
          <h3 class="modal-title">New Purchase Requisition</h3>
          <button type="button" class="btn-icon" id="close-pr-modal-btn">✕</button>
        </div>
        <form id="pr-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="pr-med">Medicine *</label>
              <select id="pr-med" name="medicine_id" class="form-select" style="width: 100%;" required>
                <option value="">Choose medicine...</option>
                ${medicines.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (Current stock: ${m.total_stock}, Reorder: ${m.reorder_level})</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="pr-qty">Quantity Needed *</label>
              <input type="number" id="pr-qty" name="quantity_requested" class="form-input" style="width: 100%;" min="1" value="100" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="pr-notes">Requisition Notes</label>
              <textarea id="pr-notes" name="notes" class="form-input" style="width: 100%; height: 75px; resize: none;" placeholder="Reason for requisition (e.g. seasonal demand surge, low stock replenishment)"></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-pr-btn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="submit-pr-btn">Submit for Manager Approval</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#pr-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-pr-modal-btn').addEventListener('click', close);
  modal.querySelector('#cancel-pr-btn').addEventListener('click', close);

  const form = modal.querySelector('#pr-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      items: [{
        medicine_id: form.medicine_id.value,
        quantity_requested: parseInt(form.quantity_requested.value, 10),
        notes: form.notes.value.trim() || null,
      }]
    };

    try {
      await api.post('/api/purchase-requests', payload);
      showToast('Purchase request created and submitted for review.', 'success');
      close();
      render(mainContainer);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openRejectModal(mainContainer, reqId, onDone) {
  const slot = mainContainer.querySelector('#purchasing-modal-slot');
  slot.innerHTML = `
    <div class="modal-overlay" id="reject-modal">
      <div class="modal-box" style="max-width: 420px;">
        <div class="modal-header">
          <h3 class="modal-title">Reject Purchase Request</h3>
          <button type="button" class="btn-icon" id="close-reject-btn">✕</button>
        </div>
        <form id="reject-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="reject-reason">Mandatory Reason for Rejection *</label>
              <textarea id="reject-reason" name="reason" class="form-input" style="width: 100%; height: 90px; resize: none;" required placeholder="State regulatory, budget, or inventory justification..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-reject-btn">Cancel</button>
            <button type="submit" class="btn btn-danger">Confirm Rejection</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#reject-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-reject-btn').addEventListener('click', close);
  modal.querySelector('#cancel-reject-btn').addEventListener('click', close);

  modal.querySelector('#reject-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = e.target.reason.value.trim();
    if (reason.length < 3) {
      showToast('Rejection reason must be at least 3 characters', 'error');
      return;
    }
    try {
      await api.post(`/api/purchase-requests/${reqId}/reject`, { reason });
      showToast('Request rejected.', 'success');
      close();
      onDone();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function openNewPOModal(mainContainer) {
  const slot = mainContainer.querySelector('#purchasing-modal-slot');
  let suppliers = [];
  let medicines = [];
  let approvedRequests = [];

  try {
    const sResp = await api.get('/api/suppliers', { active_only: true, size: 100 });
    suppliers = sResp.items;
    const mResp = await api.get('/api/medicines', { active_only: true, size: 100 });
    medicines = mResp.items;
    const prResp = await api.get('/api/purchase-requests', { status: 'APPROVED' });
    approvedRequests = prResp;
  } catch (e) {
    showToast('Failed to load suppliers or approved requests', 'error');
    return;
  }

  slot.innerHTML = `
    <div class="modal-overlay" id="po-modal">
      <div class="modal-box" style="max-width: 520px;">
        <div class="modal-header">
          <h3 class="modal-title">Raise Purchase Order (PO)</h3>
          <button type="button" class="btn-icon" id="close-po-modal-btn">✕</button>
        </div>
        <form id="po-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="po-supp">Select Supplier *</label>
              <select id="po-supp" name="supplier_id" class="form-select" style="width: 100%;" required>
                <option value="">Choose supplier...</option>
                ${suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="po-pr">Linked Approved Request (Optional)</label>
              <select id="po-pr" name="request_id" class="form-select" style="width: 100%;">
                <option value="">Direct Order (No PR)</option>
                ${approvedRequests.map(pr => `<option value="${pr.id}">${escapeHtml(pr.request_number)} (${escapeHtml(pr.requested_by_name)})</option>`).join('')}
              </select>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: 1rem; margin-top: 1rem;">
              <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.5rem;">Order Line Item</div>
              <div class="form-group">
                <label class="form-label" for="po-med">Medicine *</label>
                <select id="po-med" name="medicine_id" class="form-select" style="width: 100%;" required>
                  <option value="">Choose medicine...</option>
                  ${medicines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
                </select>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label" for="po-qty">Quantity Ordered *</label>
                  <input type="number" id="po-qty" name="quantity_ordered" class="form-input" style="width: 100%;" min="1" value="200" required>
                </div>
                <div class="form-group">
                  <label class="form-label" for="po-cost">Unit Cost (₹ Rupees) *</label>
                  <input type="number" id="po-cost" name="unit_cost_rupees" class="form-input" style="width: 100%;" min="0" step="0.01" value="8.00" required>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-po-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Generate Purchase Order</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#po-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-po-modal-btn').addEventListener('click', close);
  modal.querySelector('#cancel-po-btn').addEventListener('click', close);

  const form = modal.querySelector('#po-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const costRupees = parseFloat(form.unit_cost_rupees.value);
    const payload = {
      supplier_id: form.supplier_id.value,
      request_id: form.request_id.value || null,
      items: [{
        medicine_id: form.medicine_id.value,
        quantity_ordered: parseInt(form.quantity_ordered.value, 10),
        unit_price: Math.round(costRupees * 100),
      }]
    };

    try {
      await api.post('/api/purchase-orders', payload);
      showToast('Purchase Order generated successfully.', 'success');
      close();
      render(mainContainer);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openGoodsReceiptModal(mainContainer, po, onDone) {
  const slot = mainContainer.querySelector('#purchasing-modal-slot');
  const openItems = po.items.filter(i => (i.quantity_ordered - i.quantity_received) > 0);

  if (openItems.length === 0) {
    showToast('All items in this PO have already been received.', 'info');
    return;
  }

  const primaryItem = openItems[0];
  const outstanding = primaryItem.quantity_ordered - primaryItem.quantity_received;

  // Set default future expiry date (e.g. 1 year ahead)
  const defaultExp = new Date();
  defaultExp.setFullYear(defaultExp.getFullYear() + 1);
  const defaultExpStr = defaultExp.toISOString().split('T')[0];

  slot.innerHTML = `
    <div class="modal-overlay" id="grn-modal">
      <div class="modal-box" style="max-width: 480px;">
        <div class="modal-header">
          <h3 class="modal-title">Record Goods Receipt (GRN)</h3>
          <button type="button" class="btn-icon" id="close-grn-btn">✕</button>
        </div>
        <form id="grn-form">
          <div class="modal-body">
            <div style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--color-text-muted);">
              PO: <strong>${escapeHtml(po.po_number)}</strong> · Supplier: <strong>${escapeHtml(po.supplier_name)}</strong>
              <br>Item: <strong>${escapeHtml(primaryItem.medicine_name)}</strong> (Outstanding: <strong>${outstanding}</strong>)
            </div>

            <div class="form-group">
              <label class="form-label" for="grn-batch">Batch Number *</label>
              <input type="text" id="grn-batch" name="batch_number" class="form-input" style="width: 100%; font-family: var(--font-mono);" required placeholder="e.g. LOT-2026-X">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" for="grn-qty">Quantity Received *</label>
                <input type="number" id="grn-qty" name="quantity_received" class="form-input" style="width: 100%;" min="1" max="${outstanding}" value="${outstanding}" required>
              </div>

              <div class="form-group">
                <label class="form-label" for="grn-exp">Expiry Date (Future) *</label>
                <input type="date" id="grn-exp" name="expiry_date" class="form-input" style="width: 100%;" min="${new Date().toISOString().split('T')[0]}" value="${defaultExpStr}" required>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="grn-cost">Unit Purchase Cost (₹ Rupees) *</label>
              <input type="number" id="grn-cost" name="cost_rupees" class="form-input" style="width: 100%;" step="0.01" value="${(primaryItem.unit_price / 100).toFixed(2)}" required>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="cancel-grn-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Confirm Receipt & Increase Stock</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = slot.querySelector('#grn-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-grn-btn').addEventListener('click', close);
  modal.querySelector('#cancel-grn-btn').addEventListener('click', close);

  const form = modal.querySelector('#grn-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const costRupees = parseFloat(form.cost_rupees.value);
    const qty = parseInt(form.quantity_received.value, 10);

    const payload = {
      po_id: po.id,
      items: [{
        po_item_id: primaryItem.id,
        batch_number: form.batch_number.value.trim(),
        expiry_date: form.expiry_date.value,
        quantity_received: qty,
        purchase_price: Math.round(costRupees * 100),
      }]
    };

    const idemKey = 'GRN-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    try {
      await api.post('/api/goods-receipts', payload, { 'Idempotency-Key': idemKey });
      showToast(`Goods received! Stock increased by ${qty} units.`, 'success');
      close();
      onDone();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
