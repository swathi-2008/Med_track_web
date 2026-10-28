import { api } from './api.js';
import { getCurrentUser } from './auth.js';
import { escapeHtml, formatCurrency, formatDate, showToast, showConfirmModal } from './components.js';

let state = {
  cart: [], // { medicine_id, medicine_name, strength, unit, unit_price, quantity, fefo_preview }
  history: [],
  page: 1,
  size: 15,
  total: 0,
  activeTab: 'checkout', // 'checkout' or 'history'
};

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sales & Counter Checkout</h1>
        <div class="page-subtitle">Dispense medicines with automated First-Expired, First-Out (FEFO) batch allocation.</div>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button id="tab-checkout-btn" class="btn btn-sm ${state.activeTab === 'checkout' ? 'btn-primary' : 'btn-outline'}">New Checkout</button>
        <button id="tab-history-btn" class="btn btn-sm ${state.activeTab === 'history' ? 'btn-primary' : 'btn-outline'}">Sales History</button>
      </div>
    </div>

    <div id="sales-view-content"></div>
    <div id="receipt-modal-slot"></div>
  `;

  if (window.lucide) window.lucide.createIcons();

  container.querySelector('#tab-checkout-btn')?.addEventListener('click', () => {
    state.activeTab = 'checkout';
    render(container);
  });

  container.querySelector('#tab-history-btn')?.addEventListener('click', () => {
    state.activeTab = 'history';
    render(container);
  });

  const contentSlot = container.querySelector('#sales-view-content');
  if (state.activeTab === 'checkout') {
    await renderCheckout(contentSlot, container);
  } else {
    await renderHistory(contentSlot, container);
  }
}

async function renderCheckout(slot, mainContainer) {
  slot.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 380px; gap: 1.5rem; align-items: start;">
      <!-- Left: Item selection & cart -->
      <div>
        <div class="card" style="margin-bottom: 1.5rem;">
          <div class="card-header">
            <h3 class="card-title">Select Medicine to Dispense</h3>
          </div>
          <div class="card-body">
            <div style="display: flex; gap: 0.75rem; align-items: flex-end;">
              <div style="flex: 1;">
                <label class="form-label" for="pos-med-select">Medicine Search</label>
                <select id="pos-med-select" class="form-select" style="width: 100%;">
                  <option value="">Choose medicine...</option>
                </select>
              </div>
              <div style="width: 110px;">
                <label class="form-label" for="pos-qty-input">Quantity</label>
                <input type="number" id="pos-qty-input" class="form-input" min="1" value="1" style="width: 100%;">
              </div>
              <div>
                <button type="button" id="btn-add-to-cart" class="btn btn-primary" style="height: 38px;">
                  <i data-lucide="plus" style="width: 16px; height: 16px;"></i> Add Line
                </button>
              </div>
            </div>

            <!-- Real-time FEFO Preview Box -->
            <div id="fefo-preview-box" style="margin-top: 1rem; display: none; background: #f8fafc; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.75rem;">
              <div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 0.35rem;">
                FEFO Suggestion Preview
              </div>
              <div id="fefo-preview-content" style="font-size: 0.825rem;"></div>
            </div>
          </div>
        </div>

        <!-- Cart Table -->
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th class="num-col">Qty</th>
                <th class="num-col">Unit Price</th>
                <th class="num-col">Subtotal</th>
                <th>FEFO Batch Allocation</th>
                <th style="text-align: right;">Remove</th>
              </tr>
            </thead>
            <tbody id="cart-table-body">
              <tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">Cart is empty. Select a medicine above to begin.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right: Summary & Checkout Button -->
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Order Summary</h3>
          </div>
          <div class="card-body">
            <div style="display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 0.75rem;">
              <span style="color: var(--color-text-muted);">Total Items:</span>
              <strong id="summary-items-count">0</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 1rem;">
              <span style="color: var(--color-text-muted);">Cashier:</span>
              <span id="summary-cashier">${escapeHtml(getCurrentUser()?.full_name || 'Staff')}</span>
            </div>
            <div style="border-top: 1px solid var(--color-border); padding-top: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-weight: 600; font-size: 1.1rem;">Total Amount:</span>
              <span id="summary-grand-total" style="font-size: 1.6rem; font-weight: 700; color: var(--color-primary); font-variant-numeric: tabular-nums;">₹0.00</span>
            </div>

            <button type="button" id="btn-complete-sale" class="btn btn-primary" style="width: 100%; padding: 0.75rem;" disabled>
              <i data-lucide="check-circle-2" style="width: 18px; height: 18px;"></i> Complete Sale & Print Receipt
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Populate medicines dropdown
  const medSelect = slot.querySelector('#pos-med-select');
  const qtyInput = slot.querySelector('#pos-qty-input');
  const previewBox = slot.querySelector('#fefo-preview-box');
  const previewContent = slot.querySelector('#fefo-preview-content');

  let activeMedicines = [];
  try {
    const medResp = await api.get('/api/medicines', { active_only: true, size: 100 });
    activeMedicines = medResp.items;
    medSelect.innerHTML = `
      <option value="">Choose medicine...</option>
      ${activeMedicines.map(m => `
        <option value="${m.id}" data-price="${m.selling_price}" data-stock="${m.total_stock}">
          ${escapeHtml(m.name)} (${escapeHtml(m.strength)}) — Stock: ${m.total_stock} · ${formatCurrency(m.selling_price)}
        </option>
      `).join('')}
    `;
  } catch (err) {
    showToast('Failed to load medicine list for checkout', 'error');
  }

  // Real-time preview handler
  async function updateFefoPreview() {
    const medId = medSelect.value;
    const qty = parseInt(qtyInput.value, 10);
    if (!medId || isNaN(qty) || qty <= 0) {
      previewBox.style.display = 'none';
      return;
    }

    try {
      const fefo = await api.get('/api/stock/fefo-suggestion', { medicine_id: medId, quantity: qty });
      previewBox.style.display = 'block';

      if (!fefo.fulfillable) {
        previewContent.innerHTML = `
          <div style="color: var(--color-critical); font-weight: 600;">
            Shortage: Only ${fefo.total_available} available (short by ${fefo.shortage} units).
          </div>
        `;
      } else {
        previewContent.innerHTML = `
          <div style="color: var(--color-healthy); font-weight: 600; margin-bottom: 0.25rem;">
            Fully fulfillable via FEFO order:
          </div>
          ${fefo.allocations.map(a => `
            <div>• Batch <strong>${escapeHtml(a.batch_number)}</strong> (exp: ${formatDate(a.expiry_date)}): <strong>${a.quantity}</strong> units @ ${formatCurrency(a.unit_price)}</div>
          `).join('')}
        `;
      }
    } catch (e) {
      previewBox.style.display = 'none';
    }
  }

  medSelect.addEventListener('change', updateFefoPreview);
  qtyInput.addEventListener('input', updateFefoPreview);

  // Add to cart
  slot.querySelector('#btn-add-to-cart')?.addEventListener('click', async () => {
    const medId = medSelect.value;
    const qty = parseInt(qtyInput.value, 10);

    if (!medId) {
      showToast('Please select a medicine first', 'warning');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      showToast('Quantity must be at least 1', 'warning');
      return;
    }

    const med = activeMedicines.find(m => m.id === medId);
    if (!med) return;

    try {
      const fefo = await api.get('/api/stock/fefo-suggestion', { medicine_id: medId, quantity: qty });
      if (!fefo.fulfillable) {
        showToast(`Insufficient stock! Only ${fefo.total_available} units available in active unexpired batches.`, 'error');
        return;
      }

      state.cart.push({
        medicine_id: med.id,
        medicine_name: med.name,
        strength: med.strength,
        unit: med.unit,
        unit_price: med.selling_price,
        quantity: qty,
        allocations: fefo.allocations,
        subtotal: fefo.total_amount,
      });

      renderCartRows(slot, mainContainer);
      medSelect.value = '';
      qtyInput.value = '1';
      previewBox.style.display = 'none';
      showToast(`Added ${qty} ${med.unit}s of ${med.name} to cart`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  renderCartRows(slot, mainContainer);
}

function renderCartRows(slot, mainContainer) {
  const tbody = slot.querySelector('#cart-table-body');
  const itemsCount = slot.querySelector('#summary-items-count');
  const grandTotal = slot.querySelector('#summary-grand-total');
  const completeBtn = slot.querySelector('#btn-complete-sale');

  if (state.cart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">Cart is empty. Select a medicine above to begin.</td></tr>`;
    itemsCount.textContent = '0';
    grandTotal.textContent = '₹0.00';
    completeBtn.disabled = true;
    return;
  }

  let totalPaise = 0;
  let totalUnits = 0;

  tbody.innerHTML = state.cart.map((item, idx) => {
    totalPaise += item.subtotal;
    totalUnits += item.quantity;

    const batchesSummary = item.allocations.map(a => `${a.batch_number} (${a.quantity})`).join(', ');

    return `
      <tr>
        <td><strong>${escapeHtml(item.medicine_name)}</strong> <span style="color: var(--color-text-muted); font-size: 0.8rem;">(${escapeHtml(item.strength)})</span></td>
        <td class="num-col" style="font-weight: 600;">${item.quantity}</td>
        <td class="num-col">${formatCurrency(item.unit_price)}</td>
        <td class="num-col" style="font-weight: 700;">${formatCurrency(item.subtotal)}</td>
        <td style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--color-text-muted);">${escapeHtml(batchesSummary)}</td>
        <td style="text-align: right;">
          <button class="btn-icon remove-cart-btn" data-idx="${idx}" title="Remove item" style="color: var(--color-critical);">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  itemsCount.textContent = `${state.cart.length} lines (${totalUnits} units)`;
  grandTotal.textContent = formatCurrency(totalPaise);
  completeBtn.disabled = false;

  tbody.querySelectorAll('.remove-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      state.cart.splice(idx, 1);
      renderCartRows(slot, mainContainer);
    });
  });

  completeBtn.onclick = async () => {
    completeBtn.disabled = true;
    completeBtn.textContent = 'Processing checkout...';

    // Generate unique client idempotency key
    const idempotencyKey = 'IDEM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    const payload = {
      items: state.cart.map(c => ({
        medicine_id: c.medicine_id,
        quantity: c.quantity,
      })),
    };

    try {
      const saleResult = await api.post('/api/sales', payload, {
        'Idempotency-Key': idempotencyKey,
      });

      showToast(`Sale confirmed! Reference: ${saleResult.reference_number}`, 'success');
      state.cart = [];
      renderCartRows(slot, mainContainer);
      openReceiptModal(mainContainer, saleResult);
    } catch (err) {
      showToast(`Checkout failed: ${err.message}`, 'error');
    } finally {
      completeBtn.disabled = false;
      completeBtn.innerHTML = `<i data-lucide="check-circle-2" style="width: 18px; height: 18px;"></i> Complete Sale & Print Receipt`;
      if (window.lucide) window.lucide.createIcons();
    }
  };
}

async function renderHistory(slot, mainContainer) {
  slot.innerHTML = `
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Reference Number</th>
            <th>Timestamp</th>
            <th>Cashier</th>
            <th class="num-col">Lines</th>
            <th class="num-col">Total Amount</th>
            <th>Status</th>
            <th style="text-align: right;">Receipt</th>
          </tr>
        </thead>
        <tbody id="history-table-body">
          <tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading sales history...</td></tr>
        </tbody>
      </table>
    </div>
    <div class="pagination-bar" id="history-pagination"></div>
  `;

  const tbody = slot.querySelector('#history-table-body');
  const pagination = slot.querySelector('#history-pagination');

  try {
    const data = await api.get('/api/sales', { page: state.page, size: state.size });
    state.history = data.items;
    state.total = data.total;

    if (state.history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">No sales recorded yet.</td></tr>`;
      pagination.innerHTML = '';
      return;
    }

    tbody.innerHTML = state.history.map(s => `
      <tr>
        <td style="font-weight: 600; font-family: var(--font-mono);">${escapeHtml(s.reference_number)}</td>
        <td>${formatDate(s.created_at)}</td>
        <td>${escapeHtml(s.cashier_name)}</td>
        <td class="num-col">${s.items_count}</td>
        <td class="num-col" style="font-weight: 700;">${s.total_amount_display}</td>
        <td><span class="status-badge status-healthy">${escapeHtml(s.status)}</span></td>
        <td style="text-align: right;">
          <button class="btn btn-outline btn-sm view-receipt-btn" data-id="${s.id}">View Receipt</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.view-receipt-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const fullSale = await api.get(`/api/sales/${btn.dataset.id}`);
          openReceiptModal(mainContainer, fullSale);
        } catch (e) {
          showToast('Failed to load receipt details', 'error');
        }
      });
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-critical); padding: 2rem;">Failed to load sales history: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function openReceiptModal(container, sale) {
  const slot = container.querySelector('#receipt-modal-slot');
  slot.innerHTML = `
    <div class="modal-overlay" id="receipt-modal">
      <div class="modal-box" style="max-width: 480px;">
        <div class="modal-header">
          <h3 class="modal-title">Official Pharmacy Dispense Receipt</h3>
          <button type="button" class="btn-icon" id="close-receipt-btn">✕</button>
        </div>
        <div class="modal-body" style="font-size: 0.85rem; font-family: var(--font-mono);" id="printable-area">
          <div style="text-align: center; margin-bottom: 1rem; border-bottom: 1px dashed var(--color-border); padding-bottom: 0.75rem;">
            <div style="font-weight: 700; font-size: 1.1rem; color: var(--color-text-main);">MedTrack Pharmacy</div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Licensed Dispense Counter</div>
            <div style="margin-top: 0.35rem;">Ref: <strong>${escapeHtml(sale.reference_number)}</strong></div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Date: ${formatDate(sale.created_at)} · Cashier: ${escapeHtml(sale.cashier_name)}</div>
          </div>

          <div style="margin-bottom: 1rem;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--color-border); text-align: left;">
                  <th style="padding: 4px 0;">Item / Batch</th>
                  <th style="padding: 4px 0; text-align: right;">Qty</th>
                  <th style="padding: 4px 0; text-align: right;">Price</th>
                  <th style="padding: 4px 0; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${sale.items.map(itm => `
                  <tr style="border-bottom: 1px dashed #f1f5f9;">
                    <td style="padding: 6px 0;">
                      <div><strong>${escapeHtml(itm.medicine_name)}</strong></div>
                      <div style="font-size: 0.72rem; color: var(--color-text-muted);">Lot: ${escapeHtml(itm.batch_number)}</div>
                    </td>
                    <td style="text-align: right; padding: 6px 0;">${itm.quantity}</td>
                    <td style="text-align: right; padding: 6px 0;">${itm.unit_price_display}</td>
                    <td style="text-align: right; padding: 6px 0; font-weight: 600;">${itm.subtotal_display}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="border-top: 2px solid var(--color-border); padding-top: 0.75rem; display: flex; justify-content: space-between; font-size: 1rem; font-weight: 700;">
            <span>Grand Total:</span>
            <span style="color: var(--color-primary);">${sale.total_amount_display}</span>
          </div>

          <div style="text-align: center; margin-top: 1.5rem; font-size: 0.72rem; color: var(--color-text-muted);">
            Thank you for trusting MedTrack. Dispensed in compliance with standard FEFO inventory guidelines.
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="close-receipt-footer-btn">Close</button>
          <button type="button" class="btn btn-primary" id="print-receipt-btn">
            <i data-lucide="printer" style="width: 14px; height: 14px;"></i> Print Receipt
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const modal = slot.querySelector('#receipt-modal');
  const close = () => { slot.innerHTML = ''; };

  modal.querySelector('#close-receipt-btn').addEventListener('click', close);
  modal.querySelector('#close-receipt-footer-btn').addEventListener('click', close);

  modal.querySelector('#print-receipt-btn')?.addEventListener('click', () => {
    window.print();
  });
}
