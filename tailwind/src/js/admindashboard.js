/* =====================================================================
   NeloCare — Admin Dashboard
   adminsdashboard.js

   FIX APPLIED: every place that looked up a doctor's name from an id
   (assignedDoctorId on a patient, doctorId on an appointment) was
   calling findUserById(), which only searches auth_users. But doctor
   records live in nelocare_doctors, and — as confirmed by console
   diagnostics — a doctor can exist there without ever having a
   matching auth_users entry (e.g. legacy/edited data). That mismatch
   meant the assignment was saved correctly but always rendered as
   "Unassigned". Added getDoctorById(), which searches nelocare_doctors,
   and swapped it in everywhere a doctor's name is displayed:
   renderPatients(), viewPatient(), renderUpcomingSchedule(),
   renderAppointments(), viewAppointment(). findUserById() is left in
   place only for patient contact details (getPatientContactDetails)
   and savePatientRecord(), which correctly deal with auth_users.

   UPDATE: Overview now has two additional KPI cards — Total
   Appointments and Total Prescriptions. Added PRESCRIPTIONS_KEY /
   getPrescriptions() alongside the existing store helpers, and
   extended renderKPIs() to populate #kpi-total-appointments /
   #kpi-total-prescriptions and their badges the same way the
   doctors/patients cards already work.

   UPDATE: Reports & Records is now wired up. Added AUDITLOG_KEY /
   getAuditLog() / logAudit() / renderAuditLog() to track and display
   admin-initiated actions (patient edits, settings changes, report
   exports). Added exportReport() to download a CSV snapshot of
   patients/doctors/appointments/prescriptions. Added
   renderReportsSummary() to replace the static "No reports generated
   yet" placeholder with real category counts once any data exists,
   falling back to the original empty state when everything's empty.
===================================================================== */

const USERS_KEY    = 'auth_users';
const PATIENTS_KEY = 'nelocare_patients';
const DOCTORS_KEY  = 'nelocare_doctors';
const APPOINTMENTS_KEY = 'nelocare_appointments';
const MEDICALRECORDS_KEY = 'nelocare_medicalrecords';
const PRESCRIPTIONS_KEY = 'nelocare_prescriptions';
const AUDITLOG_KEY = 'nelocare_auditlog';

document.addEventListener('DOMContentLoaded', () => {
  migrateStaleDoctorDepartments();
  initSidebar();
  initNav();
  initClock();
  initSettings();
  renderPatients();
  renderDoctors();
  renderAppointments();
  renderKPIs();
  renderRecentDoctors();
  renderRecentPatients();
  renderUpcomingSchedule();
  renderAuditLog();
  renderReportsSummary();
  filterAppts(document.querySelector('.appt-filter'), 'all'); // set initial active state
});

/* ---------------------------------------------------------------------
   ONE-TIME MIGRATION — doctors created before the specialty→department
   rename may still have a `specialty` field and a hardcoded
   department of 'Not assigned yet' (or no department at all). This
   backfills department from the old specialty value wherever
   possible, and drops the now-unused specialty field. Safe to run on
   every load: once a record is patched, there's nothing left to do
   for it on the next pass.
--------------------------------------------------------------------- */
function migrateStaleDoctorDepartments() {
  const doctors = getDoctors();
  let changed = false;

  const patched = doctors.map(d => {
    const needsBackfill = !d.department || d.department === 'Not assigned yet';
    if (needsBackfill && d.specialty) {
      changed = true;
      const { specialty, ...rest } = d;
      return { ...rest, department: specialty };
    }
    if (d.specialty) {
      // department already set correctly elsewhere — just drop the
      // stale duplicate field so records are consistent going forward
      changed = true;
      const { specialty, ...rest } = d;
      return rest;
    }
    return d;
  });

  if (changed) {
    localStorage.setItem(DOCTORS_KEY, JSON.stringify(patched));
  }
}

/* ---------------------------------------------------------------------
   SHARED STORE READ HELPERS
--------------------------------------------------------------------- */
function readStore(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function getUsers() { return readStore(USERS_KEY); }
function getPatients() { return readStore(PATIENTS_KEY); }
function getDoctors() { return readStore(DOCTORS_KEY); }
function getAppointments() { return readStore(APPOINTMENTS_KEY); }
function getMedicalRecords() { return readStore(MEDICALRECORDS_KEY); }
function getPrescriptions() { return readStore(PRESCRIPTIONS_KEY); }
function getAuditLog() { return readStore(AUDITLOG_KEY); }

function findUserById(id) {
  return getUsers().find(u => u.id === id) || null;
}

// Doctor identity (name, department, status) lives in nelocare_doctors,
// NOT auth_users — a doctor record can exist here without a matching
// auth_users entry. Any code that needs to display a doctor's name
// from an id (assignedDoctorId, doctorId) must use this, not
// findUserById().
function getDoctorById(id) {
  if (!id) return null;
  return getDoctors().find(d => String(d.id) === String(id)) || null;
}

const PATIENT_STATUS_BADGE = {
  Active: 'badge-green',
  Admitted: 'badge-blue',
  Discharged: 'badge-gray',
  Pending: 'badge-yellow',
  Critical: 'badge-red',
  Monitoring: 'badge-purple'
};

const DOCTOR_STATUS_BADGE = {
  Available: 'badge-green',
  'On Leave': 'badge-yellow',
  'In Surgery': 'badge-purple',
  'Off Duty': 'badge-gray'
};

const APPT_STATUS_BADGE = {
  Confirmed: 'badge-blue',
  Scheduled: 'badge-blue',
  Completed: 'badge-green',
  Pending: 'badge-yellow',
  Cancelled: 'badge-red',
  Critical: 'badge-red',
  Waiting: 'badge-yellow',
  'In Progress': 'badge-purple'
};

const PRESCRIPTION_STATUS_BADGE = {
  Active: 'badge-green',
  Completed: 'badge-blue',
  Pending: 'badge-yellow',
  Expired: 'badge-gray',
  Cancelled: 'badge-red'
};

/* ---------------------------------------------------------------------
   SIDEBAR (mobile open/close)
--------------------------------------------------------------------- */
function initSidebar() {
  // nothing to bind here beyond the inline onclick handlers already
  // wired to openSidebar()/closeSidebar() in the HTML
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) sidebar.classList.remove('-translate-x-full');
  if (overlay) overlay.classList.remove('hidden');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) sidebar.classList.add('-translate-x-full');
  if (overlay) overlay.classList.add('hidden');
}

/* ---------------------------------------------------------------------
   NAVIGATION (switching between page sections)
--------------------------------------------------------------------- */
function initNav() {
  const navLinks = document.querySelectorAll('.nav-link[data-section]');
  const pageTitle = document.getElementById('page-title');

  const titles = {
    overview: 'Doctors Overview',
    patients: 'Patient Management',
    doctors: 'Doctor Management',
    appointments: 'Appointments',
    prescriptions: 'Prescriptions',
    billing: 'Billing & Payments',
    reports: 'Reports & Records',
    settings: 'Settings'
  };

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.getAttribute('data-section');
      if (!section) return;

      // if leaving Settings without clicking Save All, snap any
      // unsaved preview (e.g. dark mode) back to the last saved state
      const currentActiveSection = document.querySelector('.page-section.active');
      const leavingSettings = currentActiveSection && currentActiveSection.id === 'section-settings' && section !== 'settings';
      if (leavingSettings) discardUnsavedSettings();

      // toggle active nav link
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // toggle active section
      document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
      const target = document.getElementById(`section-${section}`);
      if (target) target.classList.add('active');

      // update page title
      if (pageTitle && titles[section]) pageTitle.textContent = titles[section];

      // Patients/Doctors/Appointments data can change between visits
      // to these sections (e.g. someone registered or booked in
      // another tab) — refresh on entry so the admin never has to
      // reload the page.
      if (section === 'patients') renderPatients();
      if (section === 'doctors') renderDoctors();
      if (section === 'appointments') renderAppointments();
      if (section === 'prescriptions') renderPrescriptions();
      if (section === 'reports') { renderAuditLog(); renderReportsSummary(); }
      if (section === 'overview') {
        renderKPIs();
        renderRecentDoctors();
        renderRecentPatients();
        renderUpcomingSchedule();
      }

      // close sidebar on mobile after navigating
      if (window.innerWidth < 1024) closeSidebar();

      // scroll main content back to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// Lets buttons elsewhere on the page (e.g. Quick Actions) jump to a
// section the same way a sidebar click would, without duplicating the
// routing logic above.
function goToSection(section) {
  const link = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (link) link.click();
}

/* ---------------------------------------------------------------------
   LIVE CLOCK
--------------------------------------------------------------------- */
function initClock() {
  const clockEl = document.getElementById('live-clock');
  if (!clockEl) return;

  const update = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    clockEl.textContent = `${dateStr} · ${timeStr}`;
  };

  update();
  setInterval(update, 1000);
}

/* ---------------------------------------------------------------------
   TOAST NOTIFICATIONS
--------------------------------------------------------------------- */
let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = `✓ ${message}`;
  toast.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
  toast.classList.add('opacity-100', 'translate-y-0');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
  }, 2800);
}

/* ---------------------------------------------------------------------
   APPOINTMENT FILTERING
--------------------------------------------------------------------- */
function filterAppts(button, status) {
  const rows = document.querySelectorAll('#appt-table-body tr');
  rows.forEach(row => {
    const match = status === 'all' || row.getAttribute('data-status') === status;
    row.style.display = match ? '' : 'none';
  });

  document.querySelectorAll('.appt-filter').forEach(btn => {
    btn.classList.remove('bg-blue-600', 'text-white');
    btn.classList.add('bg-white', 'text-slate-600', 'shadow-sm');
  });

  if (button) {
    button.classList.remove('bg-white', 'text-slate-600', 'shadow-sm');
    button.classList.add('bg-blue-600', 'text-white');
  }
}

/* ---------------------------------------------------------------------
   SHARED MODAL (view/edit patient — reuses #app-modal-overlay markup
   already in the HTML; the overlay's onclick="closeAppModal(event)"
   had no matching function before, so nothing ever opened it).
--------------------------------------------------------------------- */
function openAppModal(html) {
  const overlay = document.getElementById('app-modal-overlay');
  const modal = document.getElementById('app-modal');
  if (!overlay || !modal) return;

  modal.innerHTML = html;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
}

function closeAppModal() {
  const overlay = document.getElementById('app-modal-overlay');
  const modal = document.getElementById('app-modal');
  if (!overlay || !modal) return;

  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
  modal.innerHTML = '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

/* ---------------------------------------------------------------------
   PATIENTS — reads nelocare_patients (written by authReg.js) and
   renders the Patient Management table, applying the existing
   search/department/status filters.
--------------------------------------------------------------------- */
const PATIENT_DEPARTMENTS = ['Cardiology', 'Neurology', 'Pediatrics', 'Orthopedics', 'Dermatology', 'Gynecology'];
const PATIENT_STATUSES = ['Active', 'Admitted', 'Discharged', 'Pending', 'Critical', 'Monitoring'];

function getPatientById(id) {
  return getPatients().find(p => String(p.id) === String(id)) || null;
}

function getPatientContactDetails(patient) {
  const user = findUserById(patient.id);
  return {
    email: patient.email || user?.email || '—',
    phone: patient.phone || user?.phone || '—'
  };
}

function savePatientRecord(updatedPatient) {
  const patients = getPatients();
  const idx = patients.findIndex(p => String(p.id) === String(updatedPatient.id));
  if (idx === -1) return false;

  patients[idx] = { ...patients[idx], ...updatedPatient };
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));

  const users = getUsers();
  const userIdx = users.findIndex(u => String(u.id) === String(updatedPatient.id));
  if (userIdx !== -1) {
    users[userIdx] = {
      ...users[userIdx],
      name: updatedPatient.name || users[userIdx].name,
      email: updatedPatient.email || users[userIdx].email,
      phone: updatedPatient.phone || users[userIdx].phone
    };
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  return true;
}

function renderPatients() {
  const tbody = document.getElementById('patients-table-body');
  const countLabel = document.getElementById('patients-count-label');
  if (!tbody) return;

  const searchInput = document.getElementById('patient-search');
  const deptSelect = document.getElementById('patient-filter-dept');
  const statusSelect = document.getElementById('patient-filter-status');

  const query = (searchInput?.value || '').trim().toLowerCase();
  const dept = deptSelect?.value || '';
  const status = statusSelect?.value || '';

  const allPatients = getPatients();

  if (countLabel) {
    countLabel.textContent = `${allPatients.length} registered patient${allPatients.length === 1 ? '' : 's'}`;
  }

  const filtered = allPatients.filter(p => {
    const matchesQuery = !query || p.name.toLowerCase().includes(query);
    const matchesDept = !dept || p.department === dept;
    const matchesStatus = !status || p.status === status;
    return matchesQuery && matchesDept && matchesStatus;
  });

  if (allPatients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">
      No patients registered yet. New sign-ups will appear here automatically.
    </td></tr>`;
    return;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">
      No patients match your search or filters.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const doctor = getDoctorById(p.assignedDoctorId);
    const doctorLabel = doctor ? doctor.name : 'Unassigned';
    const badgeClass = PATIENT_STATUS_BADGE[p.status] || 'badge-gray';
    return `
      <tr>
        <td><div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">${p.initials || '??'}</div>
          <span class="font-semibold text-slate-700">${p.name}</span>
        </div></td>
        <td class="text-slate-500">#${String(p.id).slice(-6).toUpperCase()}</td>
        <td>${p.department || 'Unassigned'}</td>
        <td>${doctorLabel}</td>
        <td><span class="badge ${badgeClass}">${p.status}</span></td>
        <td>${p.lastVisit || '—'}</td>
        <td>
          <button onclick='viewPatient(${JSON.stringify(p.id)})' class="text-blue-600 text-xs font-semibold hover:underline mr-2">View</button>
          <button onclick='editPatient(${JSON.stringify(p.id)})' class="text-slate-400 text-xs hover:underline">Edit</button>
        </td>
      </tr>`;
  }).join('');
}

/* View modal: read-only details + a button into edit mode */
function viewPatient(id) {
  const patient = getPatientById(id);
  if (!patient) { showToast('Patient not found'); return; }

  const doctor = getDoctorById(patient.assignedDoctorId);
  const badgeClass = PATIENT_STATUS_BADGE[patient.status] || 'badge-gray';
  const contact = getPatientContactDetails(patient);

  const html = `
    <div class="flex items-start justify-between mb-5">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">${escapeHtml(patient.initials || '??')}</div>
        <div>
          <h3 class="text-lg font-bold text-slate-800">${escapeHtml(patient.name)}</h3>
          <p class="text-xs text-slate-400">Patient ID #${escapeHtml(String(patient.id).slice(-6).toUpperCase())}</p>
        </div>
      </div>
      <button onclick="closeAppModal()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
    </div>

    <div class="grid grid-cols-2 gap-4 text-sm mb-6">
      <div>
        <p class="text-slate-400 text-xs mb-1">Status</p>
        <span class="badge ${badgeClass}">${escapeHtml(patient.status || 'Pending')}</span>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Department</p>
        <p class="font-semibold text-slate-700">${escapeHtml(patient.department || 'Unassigned')}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Assigned Doctor</p>
        <p class="font-semibold text-slate-700">${doctor ? escapeHtml(doctor.name) : 'Unassigned'}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Last Visit</p>
        <p class="font-semibold text-slate-700">${escapeHtml(patient.lastVisit || '—')}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Email</p>
        <p class="font-semibold text-slate-700">${escapeHtml(contact.email)}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Phone</p>
        <p class="font-semibold text-slate-700">${escapeHtml(contact.phone)}</p>
      </div>
    </div>

    <div class="mb-6">
      <p class="text-slate-400 text-xs mb-2">Medical Records (read-only — added by the assigned doctor)</p>
      ${getMedicalRecordsHtml(patient)}
    </div>

    <div class="flex gap-3">
      <button onclick="closeAppModal()"
        class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-2xl font-semibold text-sm transition">Close</button>
    </div>
  `;

  openAppModal(html);
}

/* Read-only medical records for a patient — admin can view for oversight
   but never add/edit; only the assigned doctor writes these. Keeping
   this separate from viewPatient's main html builder so the "no doctor
   assigned" case still renders a clean, honest empty state. */
function getMedicalRecordsHtml(patient) {
  const records = getMedicalRecords()
    .filter(r => String(r.patientId) === String(patient.id))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (records.length === 0) {
    return `<p class="text-sm text-slate-400 text-center py-4">No medical records yet.</p>`;
  }

  return records.map(r => {
    const doctor = getDoctorById(r.doctorId);
    return `
      <div class="border border-slate-100 rounded-xl p-4 mb-3">
        <div class="flex justify-between items-start mb-1">
          <p class="font-semibold text-slate-700 text-sm">${escapeHtml(r.diagnosis)}</p>
          <span class="text-xs text-slate-400 shrink-0 ml-3">${escapeHtml(r.dateLabel || '')}</span>
        </div>
        <p class="text-xs text-slate-400 mb-2">${escapeHtml(doctor ? doctor.name : 'Unknown doctor')}</p>
        ${r.notes ? `<p class="text-sm text-slate-600">${escapeHtml(r.notes)}</p>` : ''}
      </div>`;
  }).join('');
}

/* Edit modal: same patient, editable fields, writes back to nelocare_patients */
function editPatient(id) {
  const patient = getPatientById(id);
  if (!patient) { showToast('Patient not found'); return; }

  const doctors = getDoctors();
  const contact = getPatientContactDetails(patient);

  const deptOptions = ['Unassigned', ...PATIENT_DEPARTMENTS].map(dept => {
    const value = dept === 'Unassigned' ? '' : dept;
    const selected = (patient.department || '') === value ? 'selected' : '';
    return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(dept)}</option>`;
  }).join('');

  const statusOptions = PATIENT_STATUSES.map(status => {
    const selected = (patient.status || '') === status ? 'selected' : '';
    return `<option value="${escapeHtml(status)}" ${selected}>${escapeHtml(status)}</option>`;
  }).join('');

  const doctorOptions = ['<option value="">Unassigned</option>'].concat(
    doctors.map(d => {
      const selected = String(patient.assignedDoctorId || '') === String(d.id) ? 'selected' : '';
      return `<option value="${escapeHtml(d.id)}" ${selected}>${escapeHtml(d.name)}</option>`;
    })
  ).join('');

  const html = `
    <div class="flex items-start justify-between mb-5">
      <div>
        <h3 class="text-lg font-bold text-slate-800">Edit Patient</h3>
        <p class="text-xs text-slate-400">Patient ID #${escapeHtml(String(patient.id).slice(-6).toUpperCase())}</p>
      </div>
      <button onclick="closeAppModal()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
    </div>

    <form id="patient-edit-form" class="space-y-4 text-sm" onsubmit="return false;">
      <div>
        <label class="block text-xs font-semibold text-slate-500 mb-1">Full Name</label>
        <input type="text" id="edit-patient-name" value="${escapeHtml(patient.name || '')}"
          class="w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300">
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1">Department</label>
          <select id="edit-patient-dept" class="w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300">
            ${deptOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1">Status</label>
          <select id="edit-patient-status" class="w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300">
            ${statusOptions}
          </select>
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-500 mb-1">Assigned Doctor</label>
        <select id="edit-patient-doctor" class="w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300">
          ${doctorOptions}
        </select>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1">Last Visit</label>
          <input type="text" id="edit-patient-lastvisit" placeholder="e.g. Jul 12, 2026" value="${escapeHtml(patient.lastVisit || '')}"
            class="w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
          <input type="text" id="edit-patient-phone" value="${escapeHtml(contact.phone || '')}"
            class="w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300">
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-500 mb-1">Email</label>
        <input type="email" id="edit-patient-email" value="${escapeHtml(contact.email || '')}"
          class="w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300">
      </div>
    </form>

    <div class="flex gap-3 mt-6">
      <button onclick='savePatientEdits(${JSON.stringify(patient.id)})'
        class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-2xl font-semibold text-sm transition">Save Changes</button>
      <button onclick='viewPatient(${JSON.stringify(patient.id)})'
        class="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 py-2.5 rounded-2xl font-semibold text-sm transition">Cancel</button>
    </div>
  `;

  openAppModal(html);
}

window.savePatientEdits = function (id) {
  const patient = getPatientById(id);
  if (!patient) { showToast('Patient not found'); return; }

  const name = document.getElementById('edit-patient-name')?.value.trim();
  const department = document.getElementById('edit-patient-dept')?.value || '';
  const status = document.getElementById('edit-patient-status')?.value || patient.status;
  const assignedDoctorId = document.getElementById('edit-patient-doctor')?.value || '';
  const lastVisit = document.getElementById('edit-patient-lastvisit')?.value.trim() || '';
  const contact = getPatientContactDetails(patient);
  const phone = document.getElementById('edit-patient-phone')?.value.trim() || contact.phone || '';
  const email = document.getElementById('edit-patient-email')?.value.trim() || contact.email || '';

  if (!name) { showToast('Name cannot be empty'); return; }

  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || patient.initials;

  const updated = {
    ...patient,
    name,
    initials,
    department,
    status,
    assignedDoctorId: assignedDoctorId || null,
    lastVisit,
    phone,
    email
  };

  savePatientRecord(updated);
  logAudit(`Updated patient "${name}"`, 'Patients');
  closeAppModal();
  renderPatients();
  renderKPIs();
  renderRecentPatients();
  renderAuditLog();
  showToast('Patient updated');
};

window.editPatient = editPatient;
window.viewPatient = viewPatient;

/* ---------------------------------------------------------------------
   DOCTORS — reads nelocare_doctors (written by authReg.js), builds
   the doctor cards, and applies the existing search/department/status
   filters. (Previously this only filtered cards that were never
   created — patientsData/doctors had no data source at all.)
--------------------------------------------------------------------- */
function renderDoctors() {
  const grid = document.getElementById('doctors-grid');
  const countLabel = document.getElementById('doctors-count-label');
  if (!grid) return;

  const searchInput = document.getElementById('doctor-search');
  const deptSelect = document.getElementById('doctor-filter-dept');
  const statusSelect = document.getElementById('doctor-filter-status');

  const query = (searchInput?.value || '').trim().toLowerCase();
  const dept = deptSelect?.value || '';
  const status = statusSelect?.value || '';

  const allDoctors = getDoctors();

  if (countLabel) {
    countLabel.textContent = `${allDoctors.length} active staff member${allDoctors.length === 1 ? '' : 's'}`;
  }

  if (allDoctors.length === 0) {
    grid.innerHTML = `<div class="empty-state col-span-full">
      <p class="title">No doctors registered yet</p>
      <p class="desc">New doctor sign-ups will appear here automatically.</p>
    </div>`;
    return;
  }

  const filtered = allDoctors.filter(d => {
    const matchesQuery = !query || d.name.toLowerCase().includes(query);
    const matchesDept = !dept || d.department === dept;
    const matchesStatus = !status || d.status === status;
    return matchesQuery && matchesDept && matchesStatus;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state col-span-full">
      <p class="title">No doctors match your search or filters</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(d => {
    const badgeClass = DOCTOR_STATUS_BADGE[d.status] || 'badge-gray';
    return `
      <div data-doctor-card data-name="${d.name.toLowerCase()}" data-department="${d.department || ''}" data-status="${d.status || ''}"
        class="bg-white rounded-3xl shadow-lg p-5 flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">${d.initials || '??'}</div>
          <div class="min-w-0">
            <p class="font-bold text-slate-800 truncate">${d.name}</p>
            <p class="text-xs text-slate-400 truncate">${d.department || 'General Medicine'}</p>
          </div>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-500">${d.department || 'Not assigned yet'}</span>
          <span class="badge ${badgeClass}">${d.status || 'Available'}</span>
        </div>
      </div>`;
  }).join('');
}

/* Doctors created within the last 7 days count as "new". Doctor
   records don't currently guarantee a created-at field, so this
   checks the handful of likely field names and falls back to false
   (not new) rather than guessing or crashing when none are present. */
function isRecentlyAddedDoctor(doctor) {
  const raw = doctor.createdAt || doctor.dateAdded || doctor.joinedAt || doctor.dateJoined || doctor.joinDate || null;
  if (!raw) return false;

  const created = new Date(raw);
  if (Number.isNaN(created.getTime())) return false;

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return (Date.now() - created.getTime()) <= sevenDaysMs;
}

function formatLastActive(doctor) {
  const raw = doctor.lastActive || doctor.lastActiveAt || doctor.lastSeen || null;
  if (!raw) return '—';

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------------------------------------------------------------------
   RECENT DOCTORS (Doctors Overview) — a lightweight table of the most
   recently added doctors, replacing the old "Recent Activity" feed.
--------------------------------------------------------------------- */
function renderRecentDoctors() {
  const tbody = document.getElementById('recent-doctors-body');
  if (!tbody) return;

  const doctors = getDoctors();

  if (doctors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400 text-sm">
      No doctors registered yet. New sign-ups will appear here automatically.
    </td></tr>`;
    return;
  }

  const recent = doctors.slice(-5).reverse();

  tbody.innerHTML = recent.map(d => {
    const badgeClass = DOCTOR_STATUS_BADGE[d.status] || 'badge-gray';
    return `
      <tr>
        <td><div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">${d.initials || '??'}</div>
          <span class="font-semibold text-slate-700">${d.name}</span>
        </div></td>
        <td class="text-slate-500">${d.department || 'General Medicine'}</td>
        <td>${d.department || 'Unassigned'}</td>
        <td><span class="badge ${badgeClass}">${d.status || 'Available'}</span></td>
        <td class="text-slate-500">${formatLastActive(d)}</td>
      </tr>`;
  }).join('');
}

/* ---------------------------------------------------------------------
   RECENT PATIENTS (Doctors Overview) — most recently registered
   patients, mirroring renderRecentDoctors() above. Rows are clickable
   and open the same view modal used by the main Patients table.
--------------------------------------------------------------------- */
function renderRecentPatients() {
  const tbody = document.getElementById('recent-patients-body');
  if (!tbody) return;

  const patients = getPatients();

  if (patients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center py-10 text-slate-400 text-sm">
      No patients registered yet. New sign-ups will appear here automatically.
    </td></tr>`;
    return;
  }

  const recent = patients.slice(-5).reverse();

  tbody.innerHTML = recent.map(p => {
    const badgeClass = PATIENT_STATUS_BADGE[p.status] || 'badge-gray';
    return `
      <tr onclick='viewPatient(${JSON.stringify(p.id)})' class="cursor-pointer">
        <td><div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">${p.initials || '??'}</div>
          <span class="font-semibold text-slate-700">${p.name}</span>
        </div></td>
        <td class="text-slate-500">${p.department || 'Unassigned'}</td>
        <td><span class="badge ${badgeClass}">${p.status || 'Pending'}</span></td>
      </tr>`;
  }).join('');
}

/* ---------------------------------------------------------------------
   UPCOMING SCHEDULE (Doctors Overview) — pulled from the same shared
   nelocare_appointments store as the Appointments tab, filtered to
   today and sorted by time. Falls back to an honest empty state when
   there's nothing scheduled for today.
--------------------------------------------------------------------- */
function renderUpcomingSchedule() {
  const list = document.getElementById('upcoming-schedule-list');
  if (!list) return;

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const todays = getAppointments()
    .filter(a => a.date === todayStr)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  if (todays.length === 0) {
    list.innerHTML = `
      <div class="empty-state !py-6">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
        <p class="title">No appointments scheduled yet</p>
        <p class="desc">Today's bookings will show up here as patients schedule visits.</p>
      </div>`;
    return;
  }

  list.innerHTML = todays.map(a => {
    const patient = getPatientById(a.patientId);
    const doctor = getDoctorById(a.doctorId);
    const timeLabel = a.time
      ? new Date(a.date + 'T' + a.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : '—';

    return `
      <div class="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">${patient ? (patient.initials || '??') : '??'}</div>
          <div class="min-w-0">
            <p class="font-semibold text-slate-700 text-sm truncate">${patient ? escapeHtml(patient.name) : 'Unknown patient'}</p>
            <p class="text-xs text-slate-400 truncate">${escapeHtml(doctor ? doctor.name : (a.doctor || 'Unassigned'))}</p>
          </div>
        </div>
        <span class="text-xs font-semibold text-slate-500 shrink-0">${timeLabel}</span>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------------------
   APPOINTMENTS — reads nelocare_appointments (written by patients when
   they book, from patientDashboard's dashboard.js) and renders the
   Appointments table. Records only store patientId/doctorId, so names
   are joined in live from nelocare_patients / nelocare_doctors — same
   join pattern the doctor dashboard uses.
--------------------------------------------------------------------- */
function renderAppointments() {
  const tbody = document.getElementById('appt-table-body');
  const countLabel = document.getElementById('appts-count-label');
  if (!tbody) return;

  const appointments = getAppointments();

  if (countLabel) {
    countLabel.textContent = `${appointments.length} scheduled`;
  }

  if (appointments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">
      No appointments booked yet. New bookings from patients will appear here automatically.
    </td></tr>`;
    return;
  }

  // Most recent first
  const sorted = appointments.slice().sort((a, b) => {
    return new Date(b.date + 'T' + (b.time || '00:00')) - new Date(a.date + 'T' + (a.time || '00:00'));
  });

  tbody.innerHTML = sorted.map(a => {
    const patient = getPatientById(a.patientId);
    const doctor = getDoctorById(a.doctorId);

    const patientName = patient ? patient.name : 'Unknown patient';
    const patientInitials = patient ? (patient.initials || '??') : '??';
    const doctorName = doctor ? doctor.name : (a.doctor || 'Unassigned');
    const department = a.specialty || (patient && patient.department) || 'Unassigned';

    const dateObj = new Date(a.date + 'T' + (a.time || '00:00'));
    const dateTimeLabel = isNaN(dateObj.getTime())
      ? (a.dateLabel || a.date || '—')
      : dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' · ' + dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    const status = a.status || 'Scheduled';
    const statusKey = status.toLowerCase().replace(/\s+/g, '');
    const badgeClass = APPT_STATUS_BADGE[status] || 'badge-gray';

    return `
      <tr data-status="${statusKey}">
        <td><div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">${patientInitials}</div>
          <span class="font-semibold text-slate-700">${patientName}</span>
        </div></td>
        <td>${doctorName}</td>
        <td>${department}</td>
        <td class="text-slate-500">${dateTimeLabel}</td>
        <td>${a.type || 'Consultation'}</td>
        <td><span class="badge ${badgeClass}">${status}</span></td>
        <td>
          <button onclick='viewAppointment(${JSON.stringify(a.id)})' class="text-blue-600 text-xs font-semibold hover:underline mr-2">View</button>
        </td>
      </tr>`;
  }).join('');
}

/* Simple read-only view modal, reusing the shared #app-modal machinery */
function viewAppointment(id) {
  const appt = getAppointments().find(a => String(a.id) === String(id));
  if (!appt) { showToast('Appointment not found'); return; }

  const patient = getPatientById(appt.patientId);
  const doctor = getDoctorById(appt.doctorId);
  const status = appt.status || 'Scheduled';
  const badgeClass = APPT_STATUS_BADGE[status] || 'badge-gray';

  const dateObj = new Date(appt.date + 'T' + (appt.time || '00:00'));
  const dateTimeLabel = isNaN(dateObj.getTime())
    ? (appt.dateLabel || appt.date || '—')
    : dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
      ' at ' + dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const html = `
    <div class="flex items-start justify-between mb-5">
      <div>
        <h3 class="text-lg font-bold text-slate-800">Appointment Details</h3>
        <p class="text-xs text-slate-400">${escapeHtml(dateTimeLabel)}</p>
      </div>
      <button onclick="closeAppModal()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
    </div>

    <div class="grid grid-cols-2 gap-4 text-sm mb-2">
      <div>
        <p class="text-slate-400 text-xs mb-1">Patient</p>
        <p class="font-semibold text-slate-700">${escapeHtml(patient ? patient.name : 'Unknown patient')}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Doctor</p>
        <p class="font-semibold text-slate-700">${escapeHtml(doctor ? doctor.name : (appt.doctor || 'Unassigned'))}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Department</p>
        <p class="font-semibold text-slate-700">${escapeHtml(appt.specialty || 'Unassigned')}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Status</p>
        <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
      </div>
      <div class="col-span-2">
        <p class="text-slate-400 text-xs mb-1">Reason for Visit</p>
        <p class="font-semibold text-slate-700">${escapeHtml(appt.reason || '—')}</p>
      </div>
    </div>

    <div class="flex gap-3 mt-6">
      <button onclick="closeAppModal()"
        class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-2xl font-semibold text-sm transition">Close</button>
    </div>
  `;

  openAppModal(html);
}

window.viewAppointment = viewAppointment;

/* ---------------------------------------------------------------------
   PRESCRIPTIONS — reads nelocare_prescriptions and renders the
   Prescriptions table, joining patient/doctor names the same way
   renderAppointments() does. Mirrors that function's structure so the
   two stay easy to keep in sync.
--------------------------------------------------------------------- */
function renderPrescriptions() {
  const tbody = document.getElementById('prescriptions-table-body');
  const countLabel = document.getElementById('prescriptions-count-label');
  if (!tbody) return;

  const prescriptions = getPrescriptions();
  const activeCount = prescriptions.filter(rx => (rx.status || 'Active') === 'Active').length;

  if (countLabel) {
    countLabel.textContent = `${activeCount} active prescription${activeCount === 1 ? '' : 's'}`;
  }

  if (prescriptions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400 text-sm">
      No prescriptions issued yet. New prescriptions from doctors will appear here automatically.
    </td></tr>`;
    return;
  }

  const sorted = prescriptions.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  tbody.innerHTML = sorted.map(rx => {
    const patient = getPatientById(rx.patientId);
    const doctor = getDoctorById(rx.doctorId);
    const status = rx.status || 'Active';
    const badgeClass = PRESCRIPTION_STATUS_BADGE[status] || 'badge-gray';

    return `
      <tr>
        <td class="text-slate-500">#${String(rx.id).slice(-6).toUpperCase()}</td>
        <td>${patient ? escapeHtml(patient.name) : 'Unknown patient'}</td>
        <td>${doctor ? escapeHtml(doctor.name) : (rx.doctor || 'Unassigned')}</td>
        <td>${escapeHtml(rx.medication || '—')}</td>
        <td>${escapeHtml(rx.dosage || '—')}</td>
        <td>${escapeHtml(rx.duration || '—')}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(status)}</span></td>
        <td>
          <button onclick='viewPrescription(${JSON.stringify(rx.id)})' class="text-blue-600 text-xs font-semibold hover:underline mr-2">View</button>
        </td>
      </tr>`;
  }).join('');
}

/* Simple read-only view modal, reusing the shared #app-modal machinery */
function viewPrescription(id) {
  const rx = getPrescriptions().find(r => String(r.id) === String(id));
  if (!rx) { showToast('Prescription not found'); return; }

  const patient = getPatientById(rx.patientId);
  const doctor = getDoctorById(rx.doctorId);
  const status = rx.status || 'Active';
  const badgeClass = PRESCRIPTION_STATUS_BADGE[status] || 'badge-gray';

  const html = `
    <div class="flex items-start justify-between mb-5">
      <div>
        <h3 class="text-lg font-bold text-slate-800">Prescription Details</h3>
        <p class="text-xs text-slate-400">RX #${escapeHtml(String(rx.id).slice(-6).toUpperCase())}</p>
      </div>
      <button onclick="closeAppModal()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
    </div>

    <div class="grid grid-cols-2 gap-4 text-sm mb-2">
      <div>
        <p class="text-slate-400 text-xs mb-1">Patient</p>
        <p class="font-semibold text-slate-700">${escapeHtml(patient ? patient.name : 'Unknown patient')}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Prescribed By</p>
        <p class="font-semibold text-slate-700">${escapeHtml(doctor ? doctor.name : (rx.doctor || 'Unassigned'))}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Medication</p>
        <p class="font-semibold text-slate-700">${escapeHtml(rx.medication || '—')}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Dosage</p>
        <p class="font-semibold text-slate-700">${escapeHtml(rx.dosage || '—')}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Duration</p>
        <p class="font-semibold text-slate-700">${escapeHtml(rx.duration || '—')}</p>
      </div>
      <div>
        <p class="text-slate-400 text-xs mb-1">Status</p>
        <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
      </div>
      ${rx.notes ? `<div class="col-span-2">
        <p class="text-slate-400 text-xs mb-1">Notes</p>
        <p class="font-semibold text-slate-700">${escapeHtml(rx.notes)}</p>
      </div>` : ''}
    </div>

    <div class="flex gap-3 mt-6">
      <button onclick="closeAppModal()"
        class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-2xl font-semibold text-sm transition">Close</button>
    </div>
  `;

  openAppModal(html);
}

window.viewPrescription = viewPrescription;

/* ---------------------------------------------------------------------
   KPI CARDS (Doctors Overview) — Total Doctors / Total Patients /
   Total Appointments / Total Prescriptions, all derived live from
   their respective localStorage stores.
--------------------------------------------------------------------- */
function renderKPIs() {
  const doctors = getDoctors();
  const patients = getPatients();
  const appointments = getAppointments();
  const prescriptions = getPrescriptions();

  const totalDoctors = doctors.length;
  const activeDoctors = doctors.filter(d => d.status === 'Available' || d.status === 'In Surgery').length;

  const totalPatients = patients.length;
  const activePatients = patients.filter(p => ['Active', 'Admitted', 'Monitoring'].includes(p.status)).length;

  const totalAppointments = appointments.length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysAppointments = appointments.filter(a => a.date === todayStr).length;

  const totalPrescriptions = prescriptions.length;
  const activePrescriptions = prescriptions.filter(rx => (rx.status || 'Active') === 'Active').length;

  const totalDoctorsEl = document.getElementById('kpi-total-doctors');
  const activeDoctorsEl = document.getElementById('kpi-active-doctors');
  const totalPatientsEl = document.getElementById('kpi-total-patients');
  const activePatientsEl = document.getElementById('kpi-active-patients');
  const totalAppointmentsEl = document.getElementById('kpi-total-appointments');
  const totalPrescriptionsEl = document.getElementById('kpi-total-prescriptions');

  if (totalDoctorsEl) totalDoctorsEl.textContent = String(totalDoctors);
  if (activeDoctorsEl) activeDoctorsEl.textContent = String(activeDoctors);
  if (totalPatientsEl) totalPatientsEl.textContent = String(totalPatients);
  if (activePatientsEl) activePatientsEl.textContent = String(activePatients);
  if (totalAppointmentsEl) totalAppointmentsEl.textContent = String(totalAppointments);
  if (totalPrescriptionsEl) totalPrescriptionsEl.textContent = String(totalPrescriptions);

  const totalDoctorsBadge = document.getElementById('kpi-total-doctors-badge');
  const activeDoctorsBadge = document.getElementById('kpi-active-doctors-badge');
  const totalPatientsBadge = document.getElementById('kpi-total-patients-badge');
  const activePatientsBadge = document.getElementById('kpi-active-patients-badge');
  const totalAppointmentsBadge = document.getElementById('kpi-total-appointments-badge');
  const totalPrescriptionsBadge = document.getElementById('kpi-total-prescriptions-badge');

  if (totalDoctorsBadge) {
    totalDoctorsBadge.textContent = totalDoctors === 0 ? 'No doctors yet' : 'On staff';
    totalDoctorsBadge.className = `badge mt-3 ${totalDoctors === 0 ? 'badge-gray' : 'badge-blue'}`;
  }
  if (activeDoctorsBadge) {
    activeDoctorsBadge.textContent = activeDoctors === 0 ? 'None on duty' : 'On duty right now';
    activeDoctorsBadge.className = `badge mt-3 ${activeDoctors === 0 ? 'badge-gray' : 'badge-green'}`;
  }
  if (totalPatientsBadge) {
    totalPatientsBadge.textContent = totalPatients === 0 ? 'No patients yet' : 'Registered';
    totalPatientsBadge.className = `badge mt-3 ${totalPatients === 0 ? 'badge-gray' : 'badge-blue'}`;
  }
  if (activePatientsBadge) {
    activePatientsBadge.textContent = activePatients === 0 ? 'No active cases' : 'Active or admitted';
    activePatientsBadge.className = `badge mt-3 ${activePatients === 0 ? 'badge-gray' : 'badge-green'}`;
  }
  if (totalAppointmentsBadge) {
    totalAppointmentsBadge.textContent = totalAppointments === 0
      ? 'No appointments yet'
      : `${todaysAppointments} today`;
    totalAppointmentsBadge.className = `badge mt-3 ${totalAppointments === 0 ? 'badge-gray' : 'badge-blue'}`;
  }
  if (totalPrescriptionsBadge) {
    totalPrescriptionsBadge.textContent = totalPrescriptions === 0
      ? 'No prescriptions yet'
      : `${activePrescriptions} active`;
    totalPrescriptionsBadge.className = `badge mt-3 ${totalPrescriptions === 0 ? 'badge-gray' : 'badge-purple'}`;
  }
}

/* ---------------------------------------------------------------------
   AUDIT LOG — nelocare_auditlog. Tracks admin-initiated changes only
   (patient edits, settings changes, report exports). Rendered on the
   Reports & Records page.
--------------------------------------------------------------------- */
function logAudit(action, module) {
  const log = getAuditLog();
  log.push({
    id: 'AUD-' + Date.now(),
    timestamp: new Date().toISOString(),
    user: 'Admin',
    action,
    module
  });
  const trimmed = log.slice(-200); // keep the log from growing unbounded
  localStorage.setItem(AUDITLOG_KEY, JSON.stringify(trimmed));
}

function renderAuditLog() {
  const tbody = document.getElementById('audit-log-body');
  if (!tbody) return;

  const log = getAuditLog().slice().reverse(); // most recent first

  if (log.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-slate-400 text-sm">
      No activity logged yet. Actions taken in this dashboard will appear here.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = log.map(entry => {
    const date = new Date(entry.timestamp);
    const label = isNaN(date.getTime())
      ? entry.timestamp
      : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <tr>
        <td class="text-slate-500">${escapeHtml(label)}</td>
        <td>${escapeHtml(entry.user)}</td>
        <td>${escapeHtml(entry.action)}</td>
        <td class="text-slate-500">${escapeHtml(entry.module)}</td>
      </tr>`;
  }).join('');
}

/* ---------------------------------------------------------------------
   REPORTS SUMMARY — replaces the static empty-state with real
   category breakdowns once any data exists across the platform.
--------------------------------------------------------------------- */
function renderReportsSummary() {
  const container = document.getElementById('reports-summary-container');
  if (!container) return;

  const patients = getPatients();
  const doctors = getDoctors();
  const appointments = getAppointments();
  const prescriptions = getPrescriptions();

  const totalRecords = patients.length + doctors.length + appointments.length + prescriptions.length;

  if (totalRecords === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p class="title">No reports generated yet</p>
        <p class="desc">Reports will appear here once patients, doctors, billing, and prescription data start coming in from real activity on the platform.</p>
      </div>`;
    return;
  }

  const activePatients = patients.filter(p => ['Active', 'Admitted', 'Monitoring'].includes(p.status)).length;
  const activeDoctors = doctors.filter(d => d.status === 'Available' || d.status === 'In Surgery').length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysAppointments = appointments.filter(a => a.date === todayStr).length;
  const activeRx = prescriptions.filter(rx => (rx.status || 'Active') === 'Active').length;

  const rows = [
    { label: 'Patients', total: patients.length, detail: `${activePatients} active/admitted` },
    { label: 'Doctors', total: doctors.length, detail: `${activeDoctors} currently on duty` },
    { label: 'Appointments', total: appointments.length, detail: `${todaysAppointments} scheduled today` },
    { label: 'Prescriptions', total: prescriptions.length, detail: `${activeRx} active` }
  ];

  container.innerHTML = `
    <div class="p-6">
      <h3 class="font-bold text-slate-800 text-lg mb-1">Platform Summary</h3>
      <p class="text-xs text-slate-400 mb-5">Snapshot generated ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${rows.map(r => `
          <div class="border border-slate-100 rounded-2xl p-4">
            <p class="text-slate-400 text-xs mb-1">${escapeHtml(r.label)}</p>
            <p class="text-2xl font-bold text-slate-800">${r.total}</p>
            <p class="text-xs text-slate-500 mt-1">${escapeHtml(r.detail)}</p>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------
   EXPORT REPORT — bundles current Patients / Doctors / Appointments /
   Prescriptions into a single downloadable CSV.
--------------------------------------------------------------------- */
function toCsvRow(values) {
  return values.map(v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

function exportReport() {
  const patients = getPatients();
  const doctors = getDoctors();
  const appointments = getAppointments();
  const prescriptions = getPrescriptions();

  const lines = [];
  lines.push(`NeloCare Admin Report — generated ${new Date().toLocaleString()}`);
  lines.push('');

  lines.push('PATIENTS');
  lines.push(toCsvRow(['Name', 'ID', 'Department', 'Status', 'Last Visit']));
  patients.forEach(p => lines.push(toCsvRow([p.name, p.id, p.department || '', p.status || '', p.lastVisit || ''])));
  lines.push('');

  lines.push('DOCTORS');
  lines.push(toCsvRow(['Name', 'ID', 'Department', 'Status']));
  doctors.forEach(d => lines.push(toCsvRow([d.name, d.id, d.department || '', d.status || ''])));
  lines.push('');

  lines.push('APPOINTMENTS');
  lines.push(toCsvRow(['Patient ID', 'Doctor ID', 'Date', 'Time', 'Type', 'Status']));
  appointments.forEach(a => lines.push(toCsvRow([a.patientId, a.doctorId, a.date || '', a.time || '', a.type || '', a.status || ''])));
  lines.push('');

  lines.push('PRESCRIPTIONS');
  lines.push(toCsvRow(['RX ID', 'Patient ID', 'Doctor ID', 'Medication', 'Dosage', 'Duration', 'Status']));
  prescriptions.forEach(rx => lines.push(toCsvRow([rx.id, rx.patientId, rx.doctorId, rx.medication || '', rx.dosage || '', rx.duration || '', rx.status || ''])));

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nelocare-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  logAudit('Exported admin report', 'Reports');
  renderAuditLog();
  showToast('Report exported');
}

window.exportReport = exportReport;

/* ---------------------------------------------------------------------
   SETTINGS (email notifications, SMS reminders, dark mode)
--------------------------------------------------------------------- */
const SETTINGS_KEY = 'neloCareAdminSettings';

const defaultSettings = {
  emailNotifications: true,
  smsReminders: false,
  darkMode: false
};

// savedSettings = last persisted state (source of truth to fall back to)
// draftSettings = whatever is currently being previewed on screen
let savedSettings = { ...defaultSettings };
let draftSettings = { ...defaultSettings };

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return stored ? { ...defaultSettings, ...stored } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

function persistSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettingsToUI(settings) {
  Object.keys(settings).forEach(key => {
    const toggle = document.querySelector(`[data-setting="${key}"]`);
    if (!toggle) return;
    toggle.classList.toggle('on', !!settings[key]);
  });

  document.body.classList.toggle('dark-mode', !!settings.darkMode);
}

function initSettings() {
  savedSettings = loadSettings();
  draftSettings = { ...savedSettings };
  applySettingsToUI(draftSettings);
}

// Toggling previews the change live (e.g. dark mode switches right away)
// but does NOT persist it — if the admin leaves Settings without saving,
// discardUnsavedSettings() below puts everything back to normal.
function toggleSetting(button) {
  const key = button.getAttribute('data-setting');
  if (!key) return;

  draftSettings[key] = !draftSettings[key];
  applySettingsToUI(draftSettings);
}

function saveAllSettings() {
  persistSettings(draftSettings);
  savedSettings = { ...draftSettings };
  applySettingsToUI(savedSettings);
  logAudit('Updated dashboard settings', 'Settings');
  renderAuditLog();
  showToast('Settings saved');
}

function resetSettingsToDefault() {
  draftSettings = { ...defaultSettings };
  persistSettings(draftSettings);
  savedSettings = { ...draftSettings };
  applySettingsToUI(draftSettings);
  logAudit('Reset settings to default', 'Settings');
  renderAuditLog();
  showToast('Settings reset to default');
}

// Called when the admin navigates away from the Settings page without
// clicking Save All — snaps the preview (and dark mode) back to whatever
// was last actually saved.
function discardUnsavedSettings() {
  const hasUnsaved = Object.keys(defaultSettings).some(key => draftSettings[key] !== savedSettings[key]);
  if (!hasUnsaved) return;

  draftSettings = { ...savedSettings };
  applySettingsToUI(draftSettings);
}