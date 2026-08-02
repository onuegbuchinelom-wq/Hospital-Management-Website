/*
  ──────────────────────────────────────────────────────────────
  NeloCare AUTH — LOGIN PAGE
  ──────────────────────────────────────────────────────────────
*/

const USERS_KEY = "auth_users";
const SESSION_KEY = "auth_session";

const DASHBOARD_ROUTES = {
  patient: "/tailwind/src/pages/patientDashboard.html",
  doctor: "/tailwind/src/pages/doctorDashboard.html",
  admin: "/tailwind/src/pages/adminDashboard.html",
};
const DEFAULT_DASHBOARD = DASHBOARD_ROUTES.admin;

/*=
  ──────────────────────────────────────────────────────────────
  HELPERS
  ──────────────────────────────────────────────────────────────
*/
function getUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

/*
  ──────────────────────────────────────────────────────────────
  SESSION HANDLING
  "Keep me signed in" checked  -> session lives in localStorage
  "Keep me signed in" unchecked -> session lives in sessionStorage
  ──────────────────────────────────────────────────────────────
*/
function getSession() {
  const temporary = sessionStorage.getItem(SESSION_KEY);
  if (temporary) return JSON.parse(temporary);

  const persistent = localStorage.getItem(SESSION_KEY);
  return persistent ? JSON.parse(persistent) : null;
}

function saveSession(user, persist) {
  const sessionData = { ...user, loginTime: new Date().toLocaleString() };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

  if (persist) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
  return sessionData;
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

function dashboardForRole(role) {
  return DASHBOARD_ROUTES[role] || DEFAULT_DASHBOARD;
}

/*
  ──────────────────────────────────────────────────────────────
  ALERT HELPERS
  ──────────────────────────────────────────────────────────────
*/
function showAlert(id, message) {
  const el = document.getElementById(id);
  const msgEl = document.getElementById(id + "-msg");
  if (!el) return;
  if (msgEl) msgEl.textContent = message;
  el.classList.remove("hidden");
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

/*
  ──────────────────────────────────────────────────────────────
  LOGIN HANDLER
  ──────────────────────────────────────────────────────────────
*/
function handleLogin(event) {
  event.preventDefault();

  hideAlert("login-error");

  const email = document
    .getElementById("login-email")
    .value.trim()
    .toLowerCase();
  const password = document.getElementById("login-password").value;
  const rememberEl = document.getElementById("login-remember");
  const remember = rememberEl ? rememberEl.checked : true;

  if (!email || !password) {
    showAlert("login-error", "Please enter both your email and password.");
    return;
  }

  const users = getUsers();
  const foundUser = users.find((u) => u.email === email);

  if (!foundUser) {
    showAlert(
      "login-error",
      "No account found with this email. Please register first.",
    );
    return;
  }

  if (foundUser.password !== password) {
    showAlert("login-error", "Incorrect password. Please try again.");
    return;
  }

  const session = saveSession(foundUser, remember);
  console.log("Login successful. Session saved:", session);

  document.getElementById("login-form").reset();

  window.location.href = dashboardForRole(foundUser.role);
}

/*
  ──────────────────────────────────────────────────────────────
  INIT — login page only
  ──────────────────────────────────────────────────────────────
*/
document.addEventListener("DOMContentLoaded", function () {
  const session = getSession();
  const loginForm = document.getElementById("login-form");

  // If a session already exists, skip the login form and go
  // straight to the right dashboard.
  //   if (session && loginForm) {
  //     console.log('Session found. Redirecting to dashboard.', session);
  //     window.location.href = dashboardForRole(session.role);
  //     return;
  //   }

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  document.querySelectorAll(".password-eye").forEach(function (eye) {
    eye.addEventListener("click", function () {
      const input = eye.parentElement.querySelector("input");
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
    });
  });
});
