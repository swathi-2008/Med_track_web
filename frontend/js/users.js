/**
 * MedTrack User Administration Module (ADMIN only)
 * RBAC management with last-active-admin protection.
 */
import { apiGet, apiPost, apiPut, apiPatch } from './api.js';
import { showToast, showModal, hideModal } from './components.js';

let usersList = [];

export async function renderUsers(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 tracking-tight">User Administration & Roles</h2>
          <p class="text-sm text-slate-500">Manage user accounts, assign RBAC access levels, and audit credential status</p>
        </div>
        <button id="users-create-btn" class="btn btn-primary text-xs flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
          </svg>
          New User Account
        </button>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th class="p-3 font-medium">Username</th>
                <th class="p-3 font-medium">Full Name</th>
                <th class="p-3 font-medium">Role</th>
                <th class="p-3 font-medium text-center">Status</th>
                <th class="p-3 font-medium text-right">Created</th>
                <th class="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="users-table-body" class="divide-y divide-slate-100">
              <tr><td colspan="6" class="p-6 text-center text-slate-400">Loading users...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('users-create-btn')?.addEventListener('click', openCreateUserModal);
  await loadUsers();
}

async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  try {
    usersList = await apiGet('/api/users');
    if (usersList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">No user accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = usersList.map(u => `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-mono font-medium text-slate-900">${escapeHtml(u.username)}</td>
        <td class="p-3 text-slate-700">${escapeHtml(u.full_name)}</td>
        <td class="p-3">
          <span class="inline-flex px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
            u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
            u.role === 'MANAGER' ? 'bg-blue-100 text-blue-800' :
            u.role === 'SALES_STAFF' ? 'bg-emerald-100 text-emerald-800' :
            'bg-amber-100 text-amber-800'
          }">
            ${u.role}
          </span>
        </td>
        <td class="p-3 text-center">
          <span class="inline-flex px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
            u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }">
            ${u.active ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </td>
        <td class="p-3 text-right font-mono text-slate-400 text-[11px]">${new Date(u.created_at).toLocaleDateString()}</td>
        <td class="p-3 text-right space-x-2">
          <button class="text-teal-700 hover:text-teal-900 font-medium user-edit-btn" data-id="${u.id}">Edit</button>
          <button class="text-${u.active ? 'rose-600' : 'emerald-600'} hover:underline font-medium user-toggle-btn" data-id="${u.id}" data-active="${u.active}">
            ${u.active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.user-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const user = usersList.find(u => u.id === id);
        if (user) openEditUserModal(user);
      });
    });

    tbody.querySelectorAll('.user-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const currentActive = btn.getAttribute('data-active') === 'true';
        try {
          await apiPatch(`/api/users/${id}/status`, { active: !currentActive });
          showToast(`User ${!currentActive ? 'activated' : 'deactivated'} successfully`, 'success');
          await loadUsers();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-rose-500">Failed to load users: ${err.message}</td></tr>`;
  }
}

function openCreateUserModal() {
  const modalContent = `
    <form id="create-user-form" class="space-y-4">
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Username *</label>
        <input type="text" id="new-user-username" class="form-input text-xs w-full font-mono" required minlength="3" maxlength="50" placeholder="e.g. jdoe">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
        <input type="text" id="new-user-fullname" class="form-input text-xs w-full" required minlength="2" maxlength="100" placeholder="e.g. John Doe">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Role *</label>
        <select id="new-user-role" class="form-input text-xs w-full" required>
          <option value="SALES_STAFF">SALES_STAFF (Counter Checkout, Cashier)</option>
          <option value="PURCHASE_STAFF">PURCHASE_STAFF (PR Creation, Goods Receipt)</option>
          <option value="MANAGER">MANAGER (Approvals, Dual-Risk, Expiry Center)</option>
          <option value="ADMIN">ADMIN (Full System Privileges, User Control)</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Password * (Min 10 characters)</label>
        <input type="password" id="new-user-password" class="form-input text-xs w-full font-mono" required minlength="10" placeholder="••••••••••••">
      </div>
      <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button type="button" class="btn btn-secondary text-xs" id="create-user-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary text-xs" id="create-user-submit-btn">Create User</button>
      </div>
    </form>
  `;

  showModal({
    title: "Create New User Account",
    content: modalContent,
  });

  document.getElementById('create-user-cancel-btn')?.addEventListener('click', hideModal);
  document.getElementById('create-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('new-user-username').value.trim();
    const fullName = document.getElementById('new-user-fullname').value.trim();
    const role = document.getElementById('new-user-role').value;
    const password = document.getElementById('new-user-password').value;

    const btn = document.getElementById('create-user-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      await apiPost('/api/users', {
        username,
        full_name: fullName,
        role,
        password,
      });
      showToast('User created successfully', 'success');
      hideModal();
      await loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Create User';
    }
  });
}

function openEditUserModal(user) {
  const modalContent = `
    <form id="edit-user-form" class="space-y-4">
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Username</label>
        <input type="text" class="form-input text-xs w-full font-mono bg-slate-100 text-slate-500" value="${escapeHtml(user.username)}" disabled>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
        <input type="text" id="edit-user-fullname" class="form-input text-xs w-full" required minlength="2" value="${escapeHtml(user.full_name)}">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Role *</label>
        <select id="edit-user-role" class="form-input text-xs w-full" required>
          <option value="SALES_STAFF" ${user.role === 'SALES_STAFF' ? 'selected' : ''}>SALES_STAFF</option>
          <option value="PURCHASE_STAFF" ${user.role === 'PURCHASE_STAFF' ? 'selected' : ''}>PURCHASE_STAFF</option>
          <option value="MANAGER" ${user.role === 'MANAGER' ? 'selected' : ''}>MANAGER</option>
          <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Reset Password (Leave blank to keep current)</label>
        <input type="password" id="edit-user-password" class="form-input text-xs w-full font-mono" minlength="10" placeholder="Optional new password">
      </div>
      <div class="flex items-center gap-2 pt-1">
        <input type="checkbox" id="edit-user-active" class="rounded border-slate-300 text-teal-600 focus:ring-teal-500" ${user.active ? 'checked' : ''}>
        <label for="edit-user-active" class="text-xs text-slate-700 font-medium">Account is Active</label>
      </div>
      <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button type="button" class="btn btn-secondary text-xs" id="edit-user-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary text-xs" id="edit-user-submit-btn">Save Changes</button>
      </div>
    </form>
  `;

  showModal({
    title: `Edit User: ${user.username}`,
    content: modalContent,
  });

  document.getElementById('edit-user-cancel-btn')?.addEventListener('click', hideModal);
  document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('edit-user-fullname').value.trim();
    const role = document.getElementById('edit-user-role').value;
    const password = document.getElementById('edit-user-password').value;
    const active = document.getElementById('edit-user-active').checked;

    const payload = {
      full_name: fullName,
      role,
      active,
    };
    if (password && password.trim()) {
      payload.password = password.trim();
    }

    const btn = document.getElementById('edit-user-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      await apiPut(`/api/users/${user.id}`, payload);
      showToast('User updated successfully', 'success');
      hideModal();
      await loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const render = renderUsers;

