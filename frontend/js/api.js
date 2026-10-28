/**
 * MedTrack API Client
 * Automatically manages CSRF double-submit token, session credentials,
 * uniform error parsing, and 401 redirects to login.html.
 */

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token;
}

export function getCsrfToken() {
  if (!csrfToken) {
    csrfToken = getCookie('csrf_token');
  }
  return csrfToken;
}

export class ApiError extends Error {
  constructor(status, error, message, fieldErrors = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
    this.fieldErrors = fieldErrors;
  }
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
  const headers = new Headers(options.headers || {});

  // Add JSON content-type if body is an object
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.body);
  }

  // Attach CSRF header on state-changing methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = getCsrfToken();
    if (token) {
      headers.set('X-CSRF-Token', token);
    }
  }

  // Always include credentials (HttpOnly session cookie)
  options.credentials = 'same-origin';
  options.headers = headers;

  const response = await fetch(url, options);

  // If 401 Unauthorized, redirect to login unless already on login page
  if (response.status === 401 && !window.location.pathname.endsWith('login.html')) {
    window.location.href = '/login.html';
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired or invalid. Please sign in again.');
  }

  // Read response
  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const status = response.status;
    const error = (data && data.error) ? data.error : 'ERROR';
    const message = (data && data.message) ? data.message : (typeof data === 'string' ? data : 'Request failed');
    const fieldErrors = (data && data.fieldErrors) ? data.fieldErrors : [];
    throw new ApiError(status, error, message, fieldErrors);
  }

  return data;
}

export const api = {
  get: (endpoint, params = {}) => {
    let url = endpoint;
    const query = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    }
    const qStr = query.toString();
    if (qStr) {
      url += (url.includes('?') ? '&' : '?') + qStr;
    }
    return request(url, { method: 'GET' });
  },
  post: (endpoint, body, headers = {}) => request(endpoint, { method: 'POST', body, headers }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export const apiGet = (endpoint, params) => api.get(endpoint, params);
export const apiPost = (endpoint, body, headers) => api.post(endpoint, body, headers);
export const apiPut = (endpoint, body) => api.put(endpoint, body);
export const apiPatch = (endpoint, body) => api.patch(endpoint, body);
export const apiDelete = (endpoint) => api.delete(endpoint);

