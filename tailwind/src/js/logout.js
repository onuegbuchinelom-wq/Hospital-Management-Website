/*
  ──────────────────────────────────────────────────────────────
  NeloCare AUTH — LOGOUT
  Include this on every dashboard page (patient/doctor/admin).
  Requires an element with id="logout-btn" somewhere in the HTML.
  ──────────────────────────────────────────────────────────────
*/

const SESSION_KEY = 'auth_session';

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function logout() {
  clearSession();
  console.log('Session cleared. Logging out.');
  // Adjust this path if your dashboards live in a different folder
  // relative to login.html
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', function () {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});