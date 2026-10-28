/**
 * MedTrack Reusable UI Components
 * Pure vanilla ES6, zero external UI framework dependencies.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatCurrency(minorUnits) {
  if (minorUnits === null || minorUnits === undefined || isNaN(minorUnits)) return '₹0.00';
  const major = minorUnits / 100;
  return '₹' + major.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Toast notification container
let toastContainer = null;
function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('role', 'status');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message, type = 'info', durationMs = 3500) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 250);
  }, durationMs);
}

// Confirmation Modal
export function showConfirmModal({ title, message, confirmText = 'Confirm', confirmClass = 'btn-primary', onConfirm }) {
  const existing = document.getElementById('medtrack-confirm-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'medtrack-confirm-modal';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <button type="button" class="btn-icon close-modal-btn" aria-label="Close modal">✕</button>
      </div>
      <div class="modal-body">
        <p style="color: var(--color-text-muted); font-size: 0.9rem;">${escapeHtml(message)}</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline cancel-modal-btn">Cancel</button>
        <button type="button" class="btn ${confirmClass} confirm-modal-btn">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.close-modal-btn').addEventListener('click', close);
  overlay.querySelector('.cancel-modal-btn').addEventListener('click', close);
  overlay.querySelector('.confirm-modal-btn').addEventListener('click', async () => {
    close();
    if (onConfirm) await onConfirm();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

// Inline Form Field Error rendering
export function clearFormErrors(form) {
  form.querySelectorAll('.form-error').forEach(el => el.remove());
  form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
}

export function renderFormErrors(form, fieldErrors = []) {
  clearFormErrors(form);
  for (const err of fieldErrors) {
    const input = form.querySelector(`[name="${err.field}"]`);
    if (input) {
      input.classList.add('has-error');
      const errEl = document.createElement('div');
      errEl.className = 'form-error';
      errEl.textContent = err.message;
      input.parentNode.appendChild(errEl);
    }
  }
}

// Empty state element generator
export function renderEmptyState({ title = 'No records found', description = 'There is currently no data to display.', actionText, onAction }) {
  const container = document.createElement('div');
  container.className = 'empty-state';
  container.innerHTML = `
    <div class="empty-title">${escapeHtml(title)}</div>
    <div class="empty-description">${escapeHtml(description)}</div>
    ${actionText ? `<button type="button" class="btn btn-primary empty-action-btn">${escapeHtml(actionText)}</button>` : ''}
  `;
  if (actionText && onAction) {
    container.querySelector('.empty-action-btn').addEventListener('click', onAction);
  }
  return container;
}
