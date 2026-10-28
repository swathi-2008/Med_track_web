import { api, setCsrfToken } from './api.js';

let currentUser = null;

export async function checkAuth() {
  try {
    const user = await api.get('/api/auth/me');
    currentUser = user;
    if (user.csrf_token) {
      setCsrfToken(user.csrf_token);
    }
    return user;
  } catch (err) {
    currentUser = null;
    throw err;
  }
}

export function getCurrentUser() {
  return currentUser;
}

export function hasRole(...roles) {
  if (!currentUser || !currentUser.role) return false;
  return roles.includes(currentUser.role);
}

export async function logout() {
  try {
    await api.post('/api/auth/logout');
  } catch (e) {
    // ignore network errors on logout
  } finally {
    currentUser = null;
    window.location.href = '/login.html';
  }
}
