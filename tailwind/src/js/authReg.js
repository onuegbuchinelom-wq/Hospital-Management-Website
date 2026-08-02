/*
  ──────────────────────────────────────────────────────────────
  NeloCare AUTH — REGISTER PAGE
  ──────────────────────────────────────────────────────────────
*/

const USERS_KEY    = 'auth_users';
const SESSION_KEY  = 'auth_session';
const PATIENTS_KEY = 'nelocare_patients';
const DOCTORS_KEY  = 'nelocare_doctors';

const DASHBOARD_ROUTES = {
  patient: '/tailwind/src/pages/patientDashboard.html',
  doctor:  '/tailwind/src/pages/doctorDashboard.html',
  admin:   '/tailwind/src/pages/adminDashboard.html'
};
const DEFAULT_DASHBOARD = DASHBOARD_ROUTES.patient;

// Allowed doctor departments — keep this list in sync with the
// <select id="reg-department"> options in register.html.
const DEPARTMENTS = [
  'Cardiology',
  'Pediatrics',
  'Gynecology',
  'Dermatology',
  'Neurology',
  'Orthopedics'
];

/*
  ──────────────────────────────────────────────────────────────
  SEED DEMO ACCOUNTS
  ──────────────────────────────────────────────────────────────
*/
function seedDemoAccounts() {
  const existing = getUsers();
  if (existing.length > 0) return;

  const demoUsers = [
    {
      id:       generateId(),
      name:     'Chidi Okonkwo',
      email:    'patient@demo.com',
      phone:    '+234 801 234 5678',
      password: 'patient123',
      role:     'patient',
      joinedAt: new Date().toLocaleString()
    },
    {
      id:       generateId(),
      name:     'Dr. Grace Wilson',
      email:    'doctor@demo.com',
      phone:    '+234 802 345 6789',
      password: 'doctor123',
      role:     'doctor',
      department: 'Cardiology',
      joinedAt: new Date().toLocaleString()
    },
    {
      id:       generateId(),
      name:     'Admin User',
      email:    'admin@demo.com',
      phone:    '+234 803 456 7890',
      password: 'admin123!',
      role:     'admin',
      joinedAt: new Date().toLocaleString()
    }
  ];

  localStorage.setItem(USERS_KEY, JSON.stringify(demoUsers));
  console.log('Demo accounts seeded to localStorage.');
}

/*
  ──────────────────────────────────────────────────────────────
  HELPERS
  ──────────────────────────────────────────────────────────────
*/
function generateId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

function getUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getSession() {
  const temporary = sessionStorage.getItem(SESSION_KEY);
  if (temporary) return JSON.parse(temporary);

  const persistent = localStorage.getItem(SESSION_KEY);
  return persistent ? JSON.parse(persistent) : null;
}

function dashboardForRole(role) {
  return DASHBOARD_ROUTES[role] || DEFAULT_DASHBOARD;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Password rule: 8+ chars, at least one digit, at least one special character
function isValidPassword(password) {
  return /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
}

/*
  ──────────────────────────────────────────────────────────────
  SHARED CLINICAL / STAFF RECORDS
  ──────────────────────────────────────────────────────────────
  auth_users only holds login credentials. The Doctor Dashboard
  (nelocare_patients) and Admin Dashboard (nelocare_patients +
  nelocare_doctors) both need a real record with the same id as
  the auth_users entry — this is what makes a new registrant show
  up automatically on those dashboards without any manual step.
*/
function getPatients() {
  const raw = localStorage.getItem(PATIENTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function savePatients(patients) {
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
}

function getDoctors() {
  const raw = localStorage.getItem(DOCTORS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveDoctors(doctors) {
  localStorage.setItem(DOCTORS_KEY, JSON.stringify(doctors));
}

// "Chiamaka Nwachukwu" -> "CN" — same convention already used by the
// seeded demo patients in doctorsdashboard.js.
function getInitials(name) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '??';
}

// Creates the record that the Doctor Dashboard's ownership model and
// the Admin Dashboard's Patients table both key off of. Unassigned by
// default — same as every other patient in the system until a doctor
// (or admin) actually assigns one.
function createPatientRecord(user) {
  const patients = getPatients();
  patients.push({
    id: user.id,
    name: user.name,
    initials: getInitials(user.name),
    condition: 'Not specified',
    department: 'Not assigned yet',
    blood: 'Not set',
    lastVisit: '—',
    nextAppt: '—',
    status: 'Active',
    assignedDoctorId: null,
    email: user.email || '',
    phone: user.phone || ''
  });
  savePatients(patients);
}

// Creates the record the Admin Dashboard's Doctors grid (and the
// doctor's own profile/dashboard) reads from. `department` now comes
// from the registration form instead of being hardcoded, so a
// freshly registered doctor's chosen department shows up everywhere
// immediately.
function createDoctorRecord(user) {
  const doctors = getDoctors();
  doctors.push({
    id: user.id,
    name: user.name,
    initials: getInitials(user.name),
    department: user.department,
    status: 'Available',
    avatar: null
  });
  saveDoctors(doctors);
}

/*
  ──────────────────────────────────────────────────────────────
  ALERT HELPERS
  ──────────────────────────────────────────────────────────────
*/
function showAlert(id, message) {
  const el = document.getElementById(id);
  const msgEl = document.getElementById(id + '-msg');
  if (!el) return;
  if (msgEl) msgEl.textContent = message;
  el.classList.remove('hidden');
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/*
  ──────────────────────────────────────────────────────────────
  DEPARTMENT FIELD — show/hide based on selected role
  ──────────────────────────────────────────────────────────────
*/
function updateSpecialtyFieldVisibility() {
  const roleInput       = document.querySelector('input[name="role"]:checked');
  const role             = roleInput ? roleInput.value : '';
  const departmentField  = document.getElementById('department-field');
  const departmentSelect = document.getElementById('reg-department');
  if (!departmentField || !departmentSelect) return;

  if (role === 'doctor') {
    departmentField.classList.remove('hidden');
    departmentSelect.setAttribute('required', 'required');
  } else {
    departmentField.classList.add('hidden');
    departmentSelect.removeAttribute('required');
    departmentSelect.value = '';
  }
}

/*
  ──────────────────────────────────────────────────────────────
  REGISTER HANDLER
  ──────────────────────────────────────────────────────────────
*/
function handleRegister(event) {
  event.preventDefault();

  hideAlert('register-error');
  hideAlert('register-success');

  const name            = document.getElementById('reg-name').value.trim();
  const email           = document.getElementById('reg-email').value.trim().toLowerCase();
  const phone           = document.getElementById('reg-phone').value.trim();
  const password        = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  const roleInput       = document.querySelector('input[name="role"]:checked');
  const role            = roleInput ? roleInput.value : '';
  const departmentInput = document.getElementById('reg-department');
  const department      = departmentInput ? departmentInput.value : '';
  const termsAccepted   = document.getElementById('reg-terms').checked;

  if (name.length < 2) {
    showAlert('register-error', 'Name must be at least 2 characters.');
    return;
  }

  if (!isValidEmail(email)) {
    showAlert('register-error', 'Please enter a valid email address.');
    return;
  }

  if (phone.length < 7) {
    showAlert('register-error', 'Please enter a valid phone number.');
    return;
  }

  if (!isValidPassword(password)) {
    showAlert('register-error', 'Password must be at least 8 characters and include a number and a special character.');
    return;
  }

  if (password !== confirmPassword) {
    showAlert('register-error', 'Passwords do not match.');
    return;
  }

  if (!role) {
    showAlert('register-error', 'Please select whether you are registering as a Patient or Doctor.');
    return;
  }

  if (role === 'doctor' && (!department || !DEPARTMENTS.includes(department))) {
    showAlert('register-error', 'Please select your department.');
    return;
  }

  if (!termsAccepted) {
    showAlert('register-error', 'You must agree to the Terms of Service and Privacy Policy.');
    return;
  }

  // ── Check for duplicate email ────────────────────────────
  const users = getUsers();
  const alreadyExists = users.find(u => u.email === email);

  if (alreadyExists) {
    // Just show the message inline — do NOT navigate anywhere.
    showAlert('register-error', 'An account with this email already exists. Please log in.');
    return;
  }

  const newUser = {
    id:       generateId(),
    name:     name,
    email:    email,
    phone:    phone,
    password: password,   // In a real app this would be hashed!
    role:     role,
    joinedAt: new Date().toLocaleString()
  };

  // Only doctors carry a department.
  if (role === 'doctor') {
    newUser.department = department;
  }

  users.push(newUser);
  saveUsers(users);

  // Give the new account a real clinical/staff record — this is the
  // piece that makes them show up on the Doctor and Admin dashboards
  // automatically, with no manual step or database edit required.
  if (role === 'patient') {
    createPatientRecord(newUser);
  } else if (role === 'doctor') {
    createDoctorRecord(newUser);
  }

  console.log('New user registered:', newUser);

  showAlert('register-success', 'Account created successfully! Redirecting to login…');
  document.getElementById('register-form').reset();
  updateSpecialtyFieldVisibility();

  setTimeout(function () {
    window.location.href = 'login.html';
  }, 1500);
}

/*
  ──────────────────────────────────────────────────────────────
  INIT — register page only
  ──────────────────────────────────────────────────────────────
*/
document.addEventListener('DOMContentLoaded', function () {
  seedDemoAccounts();

  // NOTE: deliberately NOT auto-redirecting away from the register
  // page even if a session exists. A stale session should never
  // block someone from reaching the register form or clicking
  // through to the login page.

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }

  document.querySelectorAll('input[name="role"]').forEach(function (input) {
    input.addEventListener('change', updateSpecialtyFieldVisibility);
  });
  updateSpecialtyFieldVisibility();

  document.querySelectorAll('.password-eye').forEach(function (eye) {
    eye.addEventListener('click', function () {
      const input = eye.parentElement.querySelector('input');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });
});