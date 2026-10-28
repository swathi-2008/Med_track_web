import { checkAuth, getCurrentUser, hasRole, logout } from './auth.js';
import { showToast } from './components.js';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', roles: ['ADMIN', 'MANAGER', 'SALES_STAFF', 'PURCHASE_STAFF'] },
  { id: 'medicines', label: 'Medicines Master', icon: 'pill', roles: ['ADMIN', 'MANAGER', 'SALES_STAFF'] },
  { id: 'batches', label: 'Batch Inventory', icon: 'boxes', roles: ['ADMIN', 'MANAGER', 'SALES_STAFF'] },
  { id: 'expiry', label: 'Expiry Risk Center', icon: 'clock', roles: ['ADMIN', 'MANAGER'] },
  { id: 'intelligence', label: 'Intelligence Center', icon: 'sparkles', roles: ['ADMIN', 'MANAGER'] },
  { id: 'sales', label: 'Sales & Checkout (FEFO)', icon: 'shopping-cart', roles: ['ADMIN', 'SALES_STAFF'] },
  { id: 'purchasing', label: 'Purchasing & Receipts', icon: 'truck', roles: ['ADMIN', 'MANAGER', 'PURCHASE_STAFF'] },
  { id: 'adjustments', label: 'Stock Adjustments', icon: 'sliders-horizontal', roles: ['ADMIN', 'MANAGER', 'PURCHASE_STAFF'] },
  { id: 'suppliers', label: 'Suppliers Directory', icon: 'building-2', roles: ['ADMIN', 'PURCHASE_STAFF'] },
  { id: 'reports', label: 'Reports & Analytics', icon: 'bar-chart-3', roles: ['ADMIN', 'MANAGER'] },
  { id: 'users', label: 'User Management', icon: 'users', roles: ['ADMIN'] },
  { id: 'audit', label: 'Audit Trail', icon: 'shield-check', roles: ['ADMIN'] },
];

let activeRoute = 'dashboard';

export async function navigate(routeId) {
  const item = NAV_ITEMS.find(n => n.id === routeId);
  if (!item) {
    routeId = 'dashboard';
  } else if (!hasRole(...item.roles)) {
    showToast('You do not have permission to view that section', 'error');
    routeId = 'dashboard';
  }

  activeRoute = routeId;
  window.location.hash = `#${routeId}`;

  // Update navigation link active state
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.route === routeId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Update breadcrumb
  const currentNav = NAV_ITEMS.find(n => n.id === routeId);
  const breadcrumbEl = document.getElementById('breadcrumb-current');
  if (breadcrumbEl && currentNav) {
    breadcrumbEl.textContent = currentNav.label;
  }

  // Load page module
  const contentArea = document.getElementById('main-content');
  if (!contentArea) return;

  try {
    const pageModule = await import(`/js/${routeId}.js`);
    if (pageModule && typeof pageModule.render === 'function') {
      await pageModule.render(contentArea);
    }
  } catch (err) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Module Under Construction</div>
        <div class="empty-description">Section "${escapeHtml(routeId)}" will be loaded once its milestone is complete.</div>
      </div>
    `;
  }

  // Refresh icons
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function initApp() {
  try {
    const user = await checkAuth();
    
    // Update user display
    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-role-label');
    const avatarEl = document.getElementById('user-avatar-initials');

    if (nameEl) nameEl.textContent = user.full_name || user.username;
    if (roleEl) roleEl.textContent = user.role.replace('_', ' ');
    if (avatarEl) {
      const initial = (user.full_name || user.username || 'U').charAt(0).toUpperCase();
      avatarEl.textContent = initial;
    }

    // Render Navigation Items
    const navContainer = document.getElementById('sidebar-nav');
    if (navContainer) {
      navContainer.innerHTML = '';
      
      let lastSection = null;
      NAV_ITEMS.forEach(item => {
        if (!hasRole(...item.roles)) return;

        const link = document.createElement('a');
        link.href = `#${item.id}`;
        link.className = `nav-link ${item.id === activeRoute ? 'active' : ''}`;
        link.dataset.route = item.id;
        link.innerHTML = `
          <i data-lucide="${item.icon}" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
          <span class="nav-link-text">${escapeHtml(item.label)}</span>
        `;
        link.addEventListener('click', (e) => {
          e.preventDefault();
          navigate(item.id);
          // close mobile sidebar if open
          document.getElementById('app-sidebar')?.classList.remove('mobile-open');
        });

        navContainer.appendChild(link);
      });
    }

    // Sidebar Toggles
    const sidebar = document.getElementById('app-sidebar');
    const desktopToggle = document.getElementById('sidebar-toggle-btn');
    if (desktopToggle && sidebar) {
      desktopToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => logout());
    }

    // Initial Route
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    await navigate(hash);

    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '') || 'dashboard';
      if (newHash !== activeRoute) {
        navigate(newHash);
      }
    });

  } catch (err) {
    // 401 will have redirected to login.html
    console.error('Initialization error:', err);
  }
}

document.addEventListener('DOMContentLoaded', initApp);

export const navigateTo = navigate;

