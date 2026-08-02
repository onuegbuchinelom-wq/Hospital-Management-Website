/* ============================================================
   NeloCare Doctor Dashboard — doctorsdashboard.js
   ------------------------------------------------------------
   EVERYTHING a doctor sees — stat cards, patients, appointments,
   tasks, activity, case mix, schedule, surgeries, prescriptions,
   lab results, and messages — is read from a shared client-side
   "database" (localStorage) and joined back to the logged-in
   doctor through ONE relationship: patient.assignedDoctorId.

   Design rule: dependent records (appointments, labs, rx, tasks,
   messages, activity, surgeries) never store their own doctorId.
   They only store patientId. Ownership is *derived* by looking up
   that patient's assignedDoctorId. That's what makes "a patient
   and everything tied to that patient" travel together the moment
   an assignment happens — there's nothing else to keep in sync.

   A brand-new doctor therefore starts with every section empty,
   because every patient is seeded with assignedDoctorId: null.
============================================================ */

document.addEventListener('DOMContentLoaded', function () {

    /* ---------- SESSION / LOGGED-IN DOCTOR ---------- */
    const SESSION_KEY = 'auth_session';
    const USERS_KEY = 'auth_users';
    const DOCTOR_PROFILES_KEY = 'nelocare_doctor_profiles';
    const DOCTOR_SETTINGS_KEY = 'nelocare_doctor_settings';

    // Shared "tables". Every record that isn't a patient itself
    // only carries a patientId — no doctorId anywhere else.
    const PATIENTS_KEY = 'nelocare_patients';
    const DOCTORS_KEY = 'nelocare_doctors';
    const APPOINTMENTS_KEY = 'nelocare_appointments';
    const LABRESULTS_KEY = 'nelocare_labresults';
    const PRESCRIPTIONS_KEY = 'nelocare_prescriptions';
    const TASKS_KEY = 'nelocare_tasks';
    const MESSAGES_KEY = 'nelocare_messages';
    const ACTIVITY_KEY = 'nelocare_activity';
    const SURGERIES_KEY = 'nelocare_surgeries';
    const MEDICALRECORDS_KEY = 'nelocare_medicalrecords';

    const DEFAULT_AVATAR =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23CBD5E1'/%3E%3Ccircle cx='50' cy='38' r='18' fill='%23F1F5F9'/%3E%3Cpath d='M50 60c-20 0-35 12-35 30v10h70v-10c0-18-15-30-35-30z' fill='%23F1F5F9'/%3E%3C/svg%3E";

    const DEFAULT_SETTINGS = {
        emailNotifications: true,
        smsReminders: false,
        darkMode: false
    };

    function getSession() {
        const temporary = sessionStorage.getItem(SESSION_KEY);
        if (temporary) return JSON.parse(temporary);
        const persistent = localStorage.getItem(SESSION_KEY);
        return persistent ? JSON.parse(persistent) : null;
    }

    function getDoctorProfiles() {
        const raw = localStorage.getItem(DOCTOR_PROFILES_KEY);
        return raw ? JSON.parse(raw) : {};
    }

    function getProfileExtra(userId) {
        return getDoctorProfiles()[userId] || {};
    }

    function saveProfileExtra(userId, data) {
        const profiles = getDoctorProfiles();
        profiles[userId] = Object.assign({}, profiles[userId], data);
        localStorage.setItem(DOCTOR_PROFILES_KEY, JSON.stringify(profiles));
    }

    function getAllDoctorSettings() {
        const raw = localStorage.getItem(DOCTOR_SETTINGS_KEY);
        return raw ? JSON.parse(raw) : {};
    }

    function getDoctorSettings(userId) {
        return Object.assign({}, DEFAULT_SETTINGS, getAllDoctorSettings()[userId]);
    }

    function saveDoctorSettings(userId, data) {
        const all = getAllDoctorSettings();
        all[userId] = Object.assign({}, DEFAULT_SETTINGS, all[userId], data);
        localStorage.setItem(DOCTOR_SETTINGS_KEY, JSON.stringify(all));
        return all[userId];
    }

    const session = getSession();

    if (!session) {
        window.location.href = '/tailwind/src/pages/login.html';
        return;
    }

    const profileExtra = getProfileExtra(session.id);
    let currentSettings = getDoctorSettings(session.id);

    /* ============================================================
       SHARED STORE — read/write helpers
       NOTE: This app previously seeded 7 demo patients (and their
       matching appointments/labs/prescriptions/tasks/messages/
       activity/surgeries) into localStorage on first load via a
       seedStoresIfEmpty() function. That demo-data seeding has been
       removed entirely. Stores now start out genuinely empty and
       are only ever populated by real actions taken in the app
       (patient registration, doctor actions, etc.).
    ============================================================ */

    function readStore(key) {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }

    function writeStore(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    /* ---------- OWNERSHIP: everything joins back to patients ---------- */

    function allPatients() { return readStore(PATIENTS_KEY) || []; }
    function myPatients() {
        return allPatients().filter(function (p) { return p.assignedDoctorId === session.id; });
    }
    function unassignedPatients() {
        return allPatients().filter(function (p) { return !p.assignedDoctorId; });
    }
    function myPatientIds() { return myPatients().map(function (p) { return p.id; }); }
    function patientById(id) {
        return allPatients().find(function (p) { return p.id === id; }) || null;
    }

    // Generic "give me only the records whose patient is mine" join.
    function mine(storeKey) {
        const ids = myPatientIds();
        return (readStore(storeKey) || []).filter(function (r) { return ids.indexOf(r.patientId) !== -1; });
    }

    // Generic "attach the owning patient's name/initials" join — every
    // dependent record (appointment, task, lab, rx, message, activity,
    // surgery) only stores patientId, so they all resolve display info
    // through this one function instead of repeating the lookup.
    function withPatient(record) {
        const p = patientById(record.patientId);
        return Object.assign({}, record, {
            patientName: p ? p.name : 'Unknown patient',
            initials: p ? p.initials : '??'
        });
    }

    function myAppointments() { return mine(APPOINTMENTS_KEY).map(withPatient); }
    function myLabResults() { return mine(LABRESULTS_KEY).map(withPatient); }
    function myPrescriptions() { return mine(PRESCRIPTIONS_KEY).map(withPatient); }
    function myTasks() { return mine(TASKS_KEY).map(withPatient); }
    function myMessages() { return mine(MESSAGES_KEY).map(withPatient); }
    function myActivity() { return mine(ACTIVITY_KEY).map(withPatient); }
    function mySurgeries() { return mine(SURGERIES_KEY).map(withPatient); }
    function myMedicalRecords() { return mine(MEDICALRECORDS_KEY).map(withPatient); }

    // This is the piece that answers "how does a patient — and
    // everything tied to them — get assigned": call this from
    // wherever real assignment happens (an admin/reception screen,
    // a patient's "request doctor" action, or the demo button
    // below). Every appointment/lab/rx/task/message/activity/surgery
    // that references this patientId becomes visible to the doctor
    // automatically, because ownership is derived, not duplicated.
    window.NeloCareAssignPatientToDoctor = function (patientId, doctorId) {
        const patients = allPatients();
        const patient = patients.find(function (p) { return p.id === patientId; });
        if (!patient) return false;
        patient.assignedDoctorId = doctorId;
        writeStore(PATIENTS_KEY, patients);
        if (doctorId === session.id) renderDashboardData();
        return true;
    };

    function currentProfile() {
        return {
            name: session.name || 'Doctor',
            doctorId: '#DR' + (session.id ? session.id.slice(-6).toUpperCase() : '000000'),
            specialty: profileExtra.specialty || 'General Medicine',
            department: profileExtra.department || 'Not assigned yet',
            avatar: profileExtra.avatar || null
        };
    }

    function renderProfile() {
        const p = currentProfile();

        const welcomeHeading = document.getElementById('welcome-heading');
        if (welcomeHeading) {
            const firstName = p.name.replace(/^Dr\.?\s*/i, '').trim().split(' ')[0];
            welcomeHeading.textContent = 'Welcome Back, Dr. ' + firstName;
        }

        const modalNameEl = document.getElementById('modal-name');
        const modalIdEl = document.getElementById('modal-doctor-id');
        const modalSpecialtyEl = document.getElementById('modal-specialty');
        const modalDeptEl = document.getElementById('modal-department');
        if (modalNameEl) modalNameEl.value = p.name;
        if (modalIdEl) modalIdEl.value = p.doctorId;
        if (modalSpecialtyEl) modalSpecialtyEl.value = (p.specialty === 'General Medicine' && !profileExtra.specialty) ? '' : p.specialty;
        if (modalDeptEl) modalDeptEl.value = (p.department === 'Not assigned yet') ? '' : p.department;

        const avatarPreview = document.getElementById('modal-avatar-preview');
        if (avatarPreview) avatarPreview.src = p.avatar || DEFAULT_AVATAR;

        const topbarAvatar = document.getElementById('topbar-avatar');
        if (topbarAvatar) topbarAvatar.src = p.avatar || DEFAULT_AVATAR;
    }

    renderProfile();
    // Notification badge depends on myMessages(), which is already safe to
    // call at this point (stores are seeded, session/profile are loaded).
    // Rendering it here means it's correct immediately — before the user
    // has clicked into any section — not just after the first full
    // dashboard render further down.
    renderNotificationBadge();

    /* ---------- SIDEBAR (mobile) ---------- */
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    window.openSidebar = function () {
        if (sidebar) sidebar.classList.remove('-translate-x-full');
        if (overlay) overlay.classList.remove('hidden');
    };

    window.closeSidebar = function () {
        if (sidebar) sidebar.classList.add('-translate-x-full');
        if (overlay) overlay.classList.add('hidden');
    };

    /* ---------- PAGE NAVIGATION (SPA sections) ---------- */
    const navLinks = document.querySelectorAll('.nav-link');
    if (navLinks.length) {
        navLinks.forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                const target = link.getAttribute('data-section');
                if (!target) return;

                const currentActiveLink = document.querySelector('.nav-link.active');
                const leavingSection = currentActiveLink ? currentActiveLink.getAttribute('data-section') : null;

                document.querySelectorAll('.page-section').forEach(function (sec) {
                    sec.classList.remove('active');
                });
                const targetSection = document.getElementById('section-' + target);
                if (targetSection) targetSection.classList.add('active');

                navLinks.forEach(function (l) { l.classList.remove('active'); });
                link.classList.add('active');

                if (leavingSection === 'settings' && target !== 'settings') {
                    revertSettingsToSaved();
                }

                closeSidebar();
            });
        });
    }

    window.navigateTo = function (section) {
        const link = document.querySelector('.nav-link[data-section="' + section + '"]');
        if (link) link.click();
    };

       /* ---------- PROFILE MODAL ---------- */
    const profileModal = document.getElementById('profile-modal');
    const avatarInput = document.getElementById('modal-avatar-input');
    const avatarPreview = document.getElementById('modal-avatar-preview');
    let pendingAvatarDataUrl = null;

    if (avatarInput && avatarPreview) {
        avatarInput.addEventListener('change', function () {
            const file = avatarInput.files && avatarInput.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showToast('Please choose an image file');
                return;
            }
            const reader = new FileReader();
            reader.onload = function (e) {
                pendingAvatarDataUrl = e.target.result;
                avatarPreview.src = pendingAvatarDataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    window.openModal = function () {
        if (profileModal) profileModal.classList.remove('hidden');
        pendingAvatarDataUrl = null;
        renderProfile();
    };

    window.closeModal = function () {
        if (profileModal) profileModal.classList.add('hidden');
    };

    window.saveProfile = function () {
        const nameInput = document.getElementById('modal-name');
        const specialtyInput = document.getElementById('modal-specialty');
        const deptInput = document.getElementById('modal-department');

        const newName = nameInput ? nameInput.value.trim() : '';

        const updates = {
            specialty: specialtyInput ? specialtyInput.value.trim() : profileExtra.specialty,
            department: deptInput ? deptInput.value.trim() : profileExtra.department,
            avatar: pendingAvatarDataUrl || profileExtra.avatar
        };
        saveProfileExtra(session.id, updates);
        Object.assign(profileExtra, updates);

        if (newName && newName !== session.name) {
            session.name = newName;
            const currentSession = sessionStorage.getItem(SESSION_KEY);
            if (currentSession) {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
            } else {
                localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            }
            const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
            const idx = users.findIndex(function (u) { return u.id === session.id; });
            if (idx !== -1) {
                users[idx].name = newName;
                localStorage.setItem(USERS_KEY, JSON.stringify(users));
            }
        }

        pendingAvatarDataUrl = null;

        renderProfile();
        closeModal();
        showToast('Profile updated successfully');
    };

    /* ---------- APPOINTMENT FILTERS ---------- */
    window.filterAppts = function (btn, status) {
        document.querySelectorAll('.appt-filter').forEach(function (b) {
            b.classList.remove('bg-blue-600', 'text-white');
            b.classList.add('bg-white', 'text-slate-600', 'shadow-sm');
        });
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-white', 'text-slate-600', 'shadow-sm');

        document.querySelectorAll('#appt-table-body tr[data-status]').forEach(function (row) {
            const show = status === 'all' || row.getAttribute('data-status') === status;
            row.classList.toggle('hidden', !show);
        });
    };

    /* ============================================================
       RENDER HELPERS
    ============================================================ */

    function emptyStateRow(colspan, message) {
        return '<tr><td colspan="' + colspan + '" class="text-center py-10 text-slate-400 text-sm">' + message + '</td></tr>';
    }

    function emptyStateBlock(message) {
        return '<p class="text-center py-8 text-slate-400 text-sm">' + message + '</p>';
    }

    function initialsAvatar(initials, colorClass) {
        return '<div class="w-8 h-8 rounded-full ' + colorClass + ' flex items-center justify-center text-xs font-bold shrink-0">' + initials + '</div>';
    }

    const STATUS_BADGE = {
        Active: 'badge-green', Critical: 'badge-red', Admitted: 'badge-blue', Monitoring: 'badge-purple',
        Confirmed: 'badge-blue', Waiting: 'badge-yellow', Completed: 'badge-green', 'In Progress': 'badge-purple',
        Normal: 'badge-blue', Urgent: 'badge-red', High: 'badge-yellow',
        Abnormal: 'badge-red', Borderline: 'badge-yellow',
        Pending: 'badge-yellow', Dispensing: 'badge-blue', Review: 'badge-red', Scheduled: 'badge-blue'
    };
    function badgeClass(status) { return STATUS_BADGE[status] || 'badge-blue'; }

    /* ---------- STAT CARDS ---------- */
    function renderStatCards() {
        const patients = myPatients();
        const appointments = myAppointments();
        const prescriptions = myPrescriptions();
        const medicalRecords = myMedicalRecords();

        setText('stat-patients-today', String(patients.length).padStart(2, '0'));
        setText('stat-appointments', String(appointments.length).padStart(2, '0'));
        setText('stat-prescriptions', String(prescriptions.length).padStart(2, '0'));
        setText('stat-medical-records', String(medicalRecords.length).padStart(2, '0'));
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    /* ---------- PATIENTS TABLE ---------- */
    function renderPatientsTable() {
        const tbody = document.getElementById('patients-table-body');
        const countLabel = document.getElementById('patients-count-label');
        const patients = myPatients();

        if (countLabel) countLabel.textContent = 'Showing ' + patients.length + ' of ' + patients.length;

        if (!tbody) return;

        if (patients.length === 0) {
            tbody.innerHTML = emptyStateRow(8, 'No patients assigned to you yet. New assignments will appear here automatically.');
            return;
        }

        tbody.innerHTML = patients.map(function (p) {
            return '<tr>' +
                '<td><div class="flex items-center gap-3">' + initialsAvatar(p.initials, 'bg-blue-100 text-blue-600') +
                '<span class="font-semibold text-slate-700">' + p.name + '</span></div></td>' +
                '<td class="text-slate-500">#' + p.id + '</td>' +
                '<td>' + p.condition + '</td>' +
                '<td>' + p.blood + '</td>' +
                '<td>' + p.lastVisit + '</td>' +
                '<td>' + p.nextAppt + '</td>' +
                '<td><span class="badge ' + badgeClass(p.status) + '">' + p.status + '</span></td>' +
                '<td><button onclick="showToast(\'Viewing\')" class="text-blue-600 text-xs font-semibold hover:underline mr-2">View</button>' +
                '<button onclick="showToast(\'Editing\')" class="text-slate-400 text-xs hover:underline">Edit</button></td>' +
                '</tr>';
        }).join('');
    }

    /* ---------- APPOINTMENTS (table + overview list + schedule timeline) ---------- */
    function renderAppointmentsTable() {
        const tbody = document.getElementById('appt-table-body');
        if (!tbody) return;
        const appts = myAppointments();

        if (appts.length === 0) {
            tbody.innerHTML = emptyStateRow(6, 'No appointments yet. They will appear here once a patient is assigned to you.');
            return;
        }

        tbody.innerHTML = appts.map(function (a) {
            const statusKey = a.status.toLowerCase().replace(/\s+/g, '-');
            const isCritical = a.status === 'Critical';
            const rowClass = isCritical ? ' class="bg-red-50"' : '';
            return '<tr data-status="' + statusKey + '"' + rowClass + '>' +
                '<td><div class="flex items-center gap-3">' + initialsAvatar(a.initials, isCritical ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600') +
                '<span class="font-semibold ' + (isCritical ? 'text-red-700' : 'text-slate-700') + '">' + a.patientName + '</span></div></td>' +
                '<td><span class="badge ' + badgeClass(a.status) + '">' + a.type + '</span></td>' +
                '<td class="text-slate-500">' + a.dateLabel + ' \u00b7 ' + a.time + '</td>' +
                '<td>' + a.location + '</td>' +
                '<td><span class="badge ' + badgeClass(a.status) + '">' + a.status + '</span></td>' +
                '<td>' + (isCritical
                    ? '<button onclick="showToast(\'Go Now\')" class="text-red-600 text-xs font-semibold hover:underline mr-2">Go Now</button><button onclick="showToast(\'Delegate\')" class="text-slate-400 text-xs hover:underline">Delegate</button>'
                    : '<button onclick="showToast(\'Start\')" class="text-blue-600 text-xs font-semibold hover:underline mr-2">Start</button><button onclick="showToast(\'Cancel\')" class="text-red-400 text-xs hover:underline">Cancel</button>') +
                '</td></tr>';
        }).join('');
    }

    function renderTodaysAppointments() {
        const container = document.getElementById('todays-appointments-list');
        if (!container) return;
        const appts = myAppointments();

        if (appts.length === 0) {
            container.innerHTML = emptyStateBlock('No appointments scheduled. Assigned patients will show up here.');
            return;
        }

        container.innerHTML = appts.map(function (a) {
            const isCritical = a.status === 'Critical';
            const wrapClass = isCritical ? 'flex items-center gap-4 p-3 rounded-xl bg-red-50 border border-red-100' : 'flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition';
            const timeParts = a.time.split(' ');
            return '<div class="' + wrapClass + '">' +
                '<div class="text-center w-14 shrink-0"><p class="text-xs ' + (isCritical ? 'text-red-400' : 'text-slate-400') + '">' + (timeParts[0] || '') + '</p>' +
                '<p class="text-xs font-bold ' + (isCritical ? 'text-red-500' : 'text-slate-600') + '">' + (timeParts[1] || '') + '</p></div>' +
                '<div class="w-px h-10 ' + (isCritical ? 'bg-red-200' : 'bg-slate-200') + ' shrink-0"></div>' +
                initialsAvatar(a.initials, isCritical ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600') +
                '<div class="flex-1 min-w-0"><p class="font-semibold ' + (isCritical ? 'text-red-700' : 'text-slate-700') + ' text-sm">' + a.patientName + '</p>' +
                '<p class="text-xs ' + (isCritical ? 'text-red-400' : 'text-slate-400') + ' truncate">' + a.type + ' \u00b7 ' + a.location + (isCritical ? ' \u26a0' : '') + '</p></div>' +
                '<span class="badge ' + badgeClass(a.status) + ' shrink-0">' + a.status + '</span></div>';
        }).join('');
    }

    /* ---------- WEEKLY VISITS + THIS WEEK PANEL (derived from appointments) ---------- */
    const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    function weeklyBreakdown() {
        const appts = myAppointments();
        return WEEK_ORDER.map(function (day) {
            const dayAppts = appts.filter(function (a) { return a.dayLabel === day; });
            return { day: day, count: dayAppts.length, appts: dayAppts };
        });
    }

    function renderVisitsList() {
        const visitsList = document.getElementById('visits-list');
        if (!visitsList) return;
        const breakdown = weeklyBreakdown().filter(function (d) { return d.count > 0; });

        if (breakdown.length === 0) {
            visitsList.innerHTML = emptyStateBlock('No visit history yet.');
            return;
        }

        visitsList.innerHTML = breakdown.map(function (d) {
            return '<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0 text-sm">' +
                '<span class="text-slate-500">' + d.day.slice(0, 3) + '</span>' +
                '<span class="font-semibold text-slate-700">' + d.count + ' visit' + (d.count === 1 ? '' : 's') + '</span></div>';
        }).join('');
    }

    function renderThisWeekPanel(todayLabel) {
        const container = document.getElementById('this-week-list');
        if (!container) return;
        const breakdown = weeklyBreakdown();

        container.innerHTML = breakdown.map(function (d) {
            const isToday = d.day === todayLabel;
            const hasData = d.count > 0;
            const badge = isToday ? '<span class="badge badge-blue text-[10px]">Today</span>'
                : hasData ? '<span class="badge badge-green text-[10px]">Scheduled</span>'
                    : '<span class="badge badge-yellow text-[10px]">None</span>';
            return '<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">' +
                '<div><p class="text-sm font-semibold ' + (isToday ? 'text-slate-700' : 'text-slate-500') + '">' + d.day + '</p></div>' +
                '<div class="text-right"><p class="text-sm font-bold ' + (isToday ? 'text-blue-600' : hasData ? 'text-slate-800' : 'text-slate-400') + '">' +
                (hasData ? d.count + ' patient' + (d.count === 1 ? '' : 's') : 'No appointments') + '</p>' + badge + '</div></div>';
        }).join('');
    }

    /* ---------- SCHEDULE TIMELINE ---------- */
    const TIMELINE_DOT = {
        Confirmed: 'bg-blue-500', Waiting: 'bg-yellow-500', Critical: 'bg-red-500 animate-pulse',
        Completed: 'bg-green-500', 'In Progress': 'bg-purple-500'
    };
    const TIMELINE_PANEL = {
        Confirmed: ['bg-blue-50 border-blue-100', 'text-blue-800', 'text-blue-600'],
        Waiting: ['bg-yellow-50 border-yellow-100', 'text-yellow-800', 'text-yellow-700'],
        Critical: ['bg-red-50 border-red-200', 'text-red-700', 'text-red-500'],
        Completed: ['bg-green-50 border-green-100', 'text-green-800', 'text-green-600'],
        'In Progress': ['bg-purple-50 border-purple-100', 'text-purple-800', 'text-purple-600']
    };

    function renderScheduleTimeline(todayLabel) {
        const container = document.getElementById('schedule-timeline');
        if (!container) return;
        const todays = myAppointments().filter(function (a) { return a.dayLabel === todayLabel; });

        if (todays.length === 0) {
            container.innerHTML = emptyStateBlock('Nothing on today\u2019s timeline yet.');
            return;
        }

        container.innerHTML = todays.map(function (a, i) {
            const dot = TIMELINE_DOT[a.status] || 'bg-slate-400';
            const panel = TIMELINE_PANEL[a.status] || ['bg-slate-50 border-slate-200', 'text-slate-700', 'text-slate-500'];
            const isLast = i === todays.length - 1;
            return '<div class="flex gap-4">' +
                '<div class="w-16 text-right shrink-0 pt-1"><p class="text-xs font-bold ' + (a.status === 'Critical' ? 'text-red-500' : 'text-slate-500') + '">' + a.time + '</p></div>' +
                '<div class="flex flex-col items-center shrink-0"><div class="w-3 h-3 rounded-full ' + dot + ' mt-1"></div>' +
                (isLast ? '' : '<div class="w-0.5 flex-1 bg-slate-200 mt-1 mb-1" style="min-height:40px"></div>') + '</div>' +
                '<div class="flex-1 pb-4"><div class="' + panel[0] + ' border rounded-xl p-3">' +
                '<p class="text-sm font-bold ' + panel[1] + '">' + (a.status === 'Critical' ? '\u26a0 Critical \u2014 ' : '') + a.type + ' \u2014 ' + a.patientName + '</p>' +
                '<p class="text-xs ' + panel[2] + '">' + a.location + '</p></div></div></div>';
        }).join('');
    }

    function renderNextSurgery() {
        const container = document.getElementById('next-surgery-panel');
        if (!container) return;
        const surgeries = mySurgeries();

        if (surgeries.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400">No surgeries scheduled.</p>';
            return;
        }

        const s = surgeries[0];
        container.innerHTML = '<p class="text-xs font-bold text-blue-700">Next Surgery</p>' +
            '<p class="text-sm font-semibold text-slate-800">' + s.procedure + ' \u2014 ' + s.patientName + '</p>' +
            '<p class="text-xs text-slate-500">' + s.dateLabel + ' \u00b7 ' + s.time + ' \u00b7 ' + s.theatre + '</p>' +
            '<button onclick="showToast(\'Details\')" class="mt-3 w-full text-xs text-blue-600 font-semibold hover:underline">View Details \u2192</button>';
    }

    /* ---------- CASE MIX (derived from patient conditions) ---------- */
    const CASE_COLORS = ['#3b82f6', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

    function renderCaseLegend() {
        const caseLegend = document.getElementById('case-legend');
        if (!caseLegend) return;
        const patients = myPatients();

        if (patients.length === 0) {
            caseLegend.innerHTML = emptyStateBlock('No case data yet.');
            return;
        }

        const counts = {};
        patients.forEach(function (p) { counts[p.condition] = (counts[p.condition] || 0) + 1; });
        const total = patients.length;
        const entries = Object.keys(counts).map(function (condition, i) {
            return { label: condition, value: Math.round((counts[condition] / total) * 100), color: CASE_COLORS[i % CASE_COLORS.length] };
        });

        caseLegend.innerHTML = entries.map(function (d) {
            return '<div class="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-b-0">' +
                '<span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:' + d.color + '"></span>' + d.label + '</span>' +
                '<span class="font-semibold text-slate-600">' + d.value + '%</span></div>';
        }).join('');
    }

    /* ---------- TODAY'S TASKS ---------- */
    function renderTasks() {
        const container = document.getElementById('task-list');
        if (!container) return;
        const tasks = myTasks();

        if (tasks.length === 0) {
            container.innerHTML = emptyStateBlock('No tasks yet.');
            return;
        }

        container.innerHTML = tasks.map(function (t, i) {
            const isLast = i === tasks.length - 1;
            const borderClass = isLast ? '' : ' border-b border-slate-100';
            const checkClasses = t.done ? 'bg-blue-500 text-white' : 'text-white';
            const labelClasses = t.done ? 'text-sm text-slate-400 line-through' : 'text-sm text-slate-700';
            const badge = t.done ? '<span class="badge badge-green shrink-0 text-[10px]">Done</span>' : '<span class="badge ' + badgeClass(t.priority) + ' shrink-0 text-[10px]">' + t.priority + '</span>';
            return '<div class="task-item flex items-start gap-3 py-2' + borderClass + '" data-task-id="' + t.id + '">' +
                '<div class="task-check w-5 h-5 rounded-md border-2 border-blue-500 ' + checkClasses + ' flex items-center justify-center text-xs mt-0.5 shrink-0" onclick="toggleTask(this)">' + (t.done ? '\u2713' : '') + '</div>' +
                '<div class="flex-1 min-w-0"><p class="' + labelClasses + '">' + t.title + ' \u2014 ' + t.patientName + '</p></div>' +
                badge + '</div>';
        }).join('');
    }

    window.toggleTask = function (el) {
        const item = el.closest('.task-item');
        if (!item) return;
        const taskId = item.getAttribute('data-task-id');
        const tasks = readStore(TASKS_KEY) || [];
        const task = tasks.find(function (t) { return t.id === taskId; });
        if (!task) return;
        task.done = !task.done;
        writeStore(TASKS_KEY, tasks);
        renderTasks();
    };

    /* ---------- RECENT ACTIVITY ---------- */
    const ACTIVITY_ICON = {
        critical: ['bg-red-100', 'text-red-600', '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />'],
        prescription: ['bg-green-100', 'text-green-600', '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />'],
        lab: ['bg-blue-100', 'text-blue-600', '<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5m4.75-11.396c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 20.25a48.25 48.25 0 01-8.135-.687c-1.718-.293-2.3-2.379-1.067-3.611L5 14.5" />'],
        appointment: ['bg-purple-100', 'text-purple-600', '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />']
    };

    function renderActivity() {
        const container = document.getElementById('activity-list');
        if (!container) return;
        const items = myActivity();

        if (items.length === 0) {
            container.innerHTML = emptyStateBlock('No recent activity yet.');
            return;
        }

        container.innerHTML = items.map(function (a) {
            const icon = ACTIVITY_ICON[a.type] || ACTIVITY_ICON.appointment;
            return '<div class="flex items-center gap-4">' +
                '<div class="w-9 h-9 rounded-full ' + icon[0] + ' flex items-center justify-center shrink-0">' +
                '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="w-4 h-4 ' + icon[1] + '">' + icon[2] + '</svg></div>' +
                '<div><p class="text-sm font-semibold text-slate-700">' + a.label + ' \u2014 <span class="font-normal text-slate-400">' + a.patientName + ' \u00b7 ' + a.detail + '</span></p>' +
                '<p class="text-xs text-slate-400">' + a.whenLabel + '</p></div></div>';
        }).join('');
    }

    /* ---------- PRESCRIPTIONS ---------- */
    function renderPrescriptions() {
        const tbody = document.getElementById('prescriptions-table-body');
        if (!tbody) return;
        const rx = myPrescriptions();

        if (rx.length === 0) {
            tbody.innerHTML = emptyStateRow(8, 'No prescriptions yet. They will appear here once a patient is assigned to you.');
            return;
        }

        tbody.innerHTML = rx.map(function (r) {
            const actionButtons = r.status === 'Review'
                ? '<button onclick="showToast(\'Review\')" class="text-blue-600 text-xs font-semibold hover:underline mr-2">Review</button><button onclick="showToast(\'Renew\')" class="text-slate-400 text-xs hover:underline">Renew</button>'
                : '<button onclick="showToast(\'View\')" class="text-blue-600 text-xs font-semibold hover:underline mr-2">View</button><button onclick="showToast(\'Print\')" class="text-slate-400 text-xs hover:underline">Print</button>';
            return '<tr><td class="text-slate-400 font-mono text-xs">#' + r.id + '</td>' +
                '<td class="font-semibold text-slate-700">' + r.patientName + '</td>' +
                '<td>' + r.medication + '</td><td>' + r.dosage + '</td><td>' + r.duration + '</td><td>' + r.issued + '</td>' +
                '<td><span class="badge ' + badgeClass(r.status) + '">' + r.status + '</span></td>' +
                '<td>' + actionButtons + '</td></tr>';
        }).join('');
    }

    /* ---------- MEDICAL RECORDS ----------
       Doctor-authored only. A record is visible here — and on the
       patient's own dashboard, and inside the admin's patient view —
       the moment it's saved, because all three read the same
       nelocare_medicalrecords store joined by patientId. */
    function renderMedicalRecords() {
        const tbody = document.getElementById('medicalrecords-table-body');
        if (!tbody) return;
        const records = myMedicalRecords();

        if (records.length === 0) {
            tbody.innerHTML = emptyStateRow(5, 'No medical records yet. They will appear here once a patient is assigned to you.');
            return;
        }

        tbody.innerHTML = records.slice().reverse().map(function (r) {
            return '<tr><td class="text-slate-400 font-mono text-xs">#' + r.id + '</td>' +
                '<td class="font-semibold text-slate-700">' + r.patientName + '</td>' +
                '<td>' + r.dateLabel + '</td>' +
                '<td>' + r.diagnosis + '</td>' +
                '<td class="text-slate-500">' + (r.notes || '\u2014') + '</td></tr>';
        }).join('');
    }

    /* ---------- LAB RESULTS ---------- */
    function renderLabResults() {
        const tbody = document.getElementById('labresults-table-body');
        const awaitingStat = document.getElementById('lab-stat-awaiting');
        const reviewedStat = document.getElementById('lab-stat-reviewed');
        const abnormalStat = document.getElementById('lab-stat-abnormal');

        const labs = myLabResults();

        if (awaitingStat) awaitingStat.textContent = String(labs.filter(function (l) { return l.result !== 'Ready'; }).length).padStart(2, '0');
        if (reviewedStat) reviewedStat.textContent = String(labs.filter(function (l) { return l.result === 'Ready'; }).length).padStart(2, '0');
        if (abnormalStat) abnormalStat.textContent = String(labs.filter(function (l) { return l.flag === 'Abnormal'; }).length).padStart(2, '0');

        if (!tbody) return;
        if (labs.length === 0) {
            tbody.innerHTML = emptyStateRow(7, 'No lab results yet. They will appear here once a patient is assigned to you.');
            return;
        }

        tbody.innerHTML = labs.map(function (l) {
            return '<tr><td class="font-mono text-xs text-slate-400">#' + l.id + '</td>' +
                '<td class="font-semibold">' + l.patientName + '</td><td>' + l.test + '</td><td>' + l.ordered + '</td><td>' + l.result + '</td>' +
                '<td><span class="badge ' + badgeClass(l.flag) + '">' + l.flag + '</span></td>' +
                '<td><button onclick="showToast(\'Review\')" class="text-blue-600 text-xs font-semibold hover:underline mr-2">Review</button><button onclick="showToast(\'Share\')" class="text-slate-400 text-xs hover:underline">Share</button></td></tr>';
        }).join('');
    }

    /* ---------- MESSAGES ---------- */
    const COLOR_CLASS = { red: ['bg-red-100', 'text-red-600'], blue: ['bg-blue-100', 'text-blue-600'], slate: ['bg-slate-200', 'text-slate-600'] };
    let activeMessageId = null;

    function renderMessageList() {
        const container = document.getElementById('message-list');
        if (!container) return;
        const messages = myMessages();

        if (messages.length === 0) {
            container.innerHTML = emptyStateBlock('No messages yet.');
            renderMessageThread(null);
            renderNotificationBadge();
            return;
        }

        if (!activeMessageId || !messages.some(function (m) { return m.id === activeMessageId; })) {
            activeMessageId = messages[0].id;
        }

        container.innerHTML = messages.map(function (m) {
            const isActive = m.id === activeMessageId;
            const wrapClass = 'p-4 hover:bg-slate-50 cursor-pointer' + (isActive ? ' bg-blue-50 border-l-4 border-blue-500' : '');
            const unreadBadge = m.unread ? '<span class="badge badge-red mt-1 text-[10px]">Unread</span>' : '';
            return '<div class="' + wrapClass + '" onclick="NeloCareOpenMessage(\'' + m.id + '\')">' +
                '<div class="flex items-center justify-between mb-1"><p class="text-sm font-bold text-slate-800">' + m.from + '</p>' +
                '<p class="text-xs text-slate-400">' + m.time + '</p></div>' +
                '<p class="text-xs text-slate-600 truncate">' + m.preview + '</p>' + unreadBadge + '</div>';
        }).join('');

        renderMessageThread(activeMessageId);
        renderNotificationBadge();
    }

    function renderMessageThread(messageId) {
        const header = document.getElementById('message-thread-header');
        const body = document.getElementById('message-thread-body');
        if (!header || !body) return;

        if (!messageId) {
            header.innerHTML = '';
            body.innerHTML = emptyStateBlock('Select a conversation to view it here, once you have one.');
            return;
        }

        const all = myMessages();
        const m = all.find(function (x) { return x.id === messageId; });
        if (!m) { header.innerHTML = ''; body.innerHTML = emptyStateBlock('Conversation not found.'); return; }

        const color = COLOR_CLASS[m.fromColor] || COLOR_CLASS.slate;
        header.innerHTML = '<div class="w-10 h-10 rounded-full ' + color[0] + ' flex items-center justify-center font-bold ' + color[1] + ' text-sm">' + m.fromInitials + '</div>' +
            '<div><p class="font-bold text-slate-800 text-sm">' + m.from + '</p><p class="text-xs text-slate-400">' + m.time + '</p></div>' +
            (m.urgent ? '<span class="badge badge-red ml-auto">Urgent</span>' : '');

        body.innerHTML = m.thread.map(function (line) {
            if (line.isDoctor) {
                return '<div class="flex gap-3 justify-end"><div class="bg-blue-600 rounded-2xl rounded-tr-none px-4 py-3 max-w-sm">' +
                    '<p class="text-sm text-white">' + line.text + '</p><p class="text-xs text-blue-200 mt-2">' + line.time + '</p></div>' +
                    '<div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs shrink-0">You</div></div>';
            }
            const color2 = COLOR_CLASS[m.fromColor] || COLOR_CLASS.slate;
            return '<div class="flex gap-3"><div class="w-8 h-8 rounded-full ' + color2[0] + ' flex items-center justify-center font-bold ' + color2[1] + ' text-xs shrink-0">' + m.fromInitials + '</div>' +
                '<div class="bg-slate-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-sm"><p class="text-sm text-slate-700">' + line.text + '</p>' +
                '<p class="text-xs text-slate-400 mt-2">' + line.time + '</p></div></div>';
        }).join('');

        if (m.unread) {
            const messages = readStore(MESSAGES_KEY) || [];
            const rec = messages.find(function (x) { return x.id === messageId; });
            if (rec) { rec.unread = false; writeStore(MESSAGES_KEY, messages); }
            renderNotificationBadge();
        }
    }

    window.NeloCareOpenMessage = function (messageId) {
        activeMessageId = messageId;
        renderMessageList();
    };

    function nowTimeLabel() {
        return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    function truncatePreview(text) {
        return text.length > 60 ? text.slice(0, 60) + '\u2026' : text;
    }

    /* ---------- NOTIFICATION BADGE (derived from unread messages) ---------- */
    function renderNotificationBadge() {
        const badge = document.getElementById('notif-badge');
        if (!badge) return;
        const unreadCount = myMessages().filter(function (m) { return m.unread; }).length;
        badge.textContent = String(unreadCount);
        badge.classList.toggle('hidden', unreadCount === 0);
    }

    window.showNotifications = function () {
        const modal = document.getElementById('notifications-modal');
        const body = document.getElementById('notifications-modal-body');
        if (!modal || !body) return;

        const unread = myMessages().filter(function (m) { return m.unread; });

        if (unread.length === 0) {
            body.innerHTML = emptyStateBlock('No messages available.');
        } else {
            body.innerHTML = unread.map(function (m) {
                return '<div class="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer" onclick="closeNotificationsModal();navigateTo(\'messages\');NeloCareOpenMessage(\'' + m.id + '\')">' +
                    '<div class="flex items-center justify-between mb-1"><p class="text-sm font-bold text-slate-800">' + m.from + '</p>' +
                    '<p class="text-xs text-slate-400">' + m.time + '</p></div>' +
                    '<p class="text-xs text-slate-600 truncate">' + m.preview + '</p></div>';
            }).join('');
        }

        modal.classList.remove('hidden');
    };

    window.closeNotificationsModal = function () {
        const modal = document.getElementById('notifications-modal');
        if (modal) modal.classList.add('hidden');
    };

    /* ---------- REPLY TO EXISTING THREAD ---------- */
    window.sendReply = function () {
        const input = document.getElementById('message-reply-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        if (!activeMessageId) {
            showToast('Select a conversation first');
            return;
        }

        const messages = readStore(MESSAGES_KEY) || [];
        const m = messages.find(function (x) { return x.id === activeMessageId; });
        if (!m) return;

        const timeLabel = nowTimeLabel();
        m.thread = m.thread || [];
        m.thread.push({ sender: 'You', text: text, time: timeLabel, isDoctor: true });
        m.time = timeLabel;
        m.preview = truncatePreview(text);
        m.unread = false;

        writeStore(MESSAGES_KEY, messages);
        input.value = '';
        renderMessageList();
    };

    /* ---------- COMPOSE NEW MESSAGE ---------- */
    window.openComposeModal = function () {
        const modal = document.getElementById('compose-modal');
        if (!modal) return;

        const select = document.getElementById('compose-patient-select');
        const emptyNotice = document.getElementById('compose-empty-notice');
        const formWrap = document.getElementById('compose-form-wrap');
        const textArea = document.getElementById('compose-message-text');
        const patients = myPatients();

        if (patients.length === 0) {
            if (emptyNotice) emptyNotice.classList.remove('hidden');
            if (formWrap) formWrap.classList.add('hidden');
        } else {
            if (emptyNotice) emptyNotice.classList.add('hidden');
            if (formWrap) formWrap.classList.remove('hidden');
            if (select) {
                select.innerHTML = patients.map(function (p) {
                    return '<option value="' + p.id + '">' + p.name + '</option>';
                }).join('');
            }
        }

        if (textArea) textArea.value = '';
        modal.classList.remove('hidden');
    };

    window.closeComposeModal = function () {
        const modal = document.getElementById('compose-modal');
        if (modal) modal.classList.add('hidden');
    };

    window.sendComposeMessage = function () {
        const select = document.getElementById('compose-patient-select');
        const textArea = document.getElementById('compose-message-text');
        if (!select || !textArea) return;

        const patientId = select.value;
        const text = textArea.value.trim();

        if (!patientId) {
            showToast('Choose a patient to message');
            return;
        }
        if (!text) {
            showToast('Write a message first');
            return;
        }

        const patient = patientById(patientId);
        if (!patient) return;

        const timeLabel = nowTimeLabel();
        const messages = readStore(MESSAGES_KEY) || [];
        const newId = 'MSG' + Date.now();

        messages.unshift({
            id: newId,
            patientId: patientId,
            from: patient.name,
            fromInitials: patient.initials,
            fromColor: 'blue',
            preview: truncatePreview(text),
            time: timeLabel,
            urgent: false,
            unread: false,
            thread: [{ sender: 'You', text: text, time: timeLabel, isDoctor: true }]
        });

        writeStore(MESSAGES_KEY, messages);
        activeMessageId = newId;

        closeComposeModal();
        renderMessageList();
        showToast('Message sent');
    };

    /* ---------- NEW PRESCRIPTION ---------- */
    window.openPrescriptionModal = function () {
        const modal = document.getElementById('prescription-modal');
        if (!modal) return;

        const select = document.getElementById('rx-patient-select');
        const emptyNotice = document.getElementById('rx-empty-notice');
        const formWrap = document.getElementById('rx-form-wrap');
        const patients = myPatients();

        if (patients.length === 0) {
            if (emptyNotice) emptyNotice.classList.remove('hidden');
            if (formWrap) formWrap.classList.add('hidden');
        } else {
            if (emptyNotice) emptyNotice.classList.add('hidden');
            if (formWrap) formWrap.classList.remove('hidden');
            if (select) {
                select.innerHTML = patients.map(function (p) {
                    return '<option value="' + p.id + '">' + p.name + '</option>';
                }).join('');
            }
        }

        const medInput = document.getElementById('rx-medication');
        const dosageInput = document.getElementById('rx-dosage');
        const durationInput = document.getElementById('rx-duration');
        if (medInput) medInput.value = '';
        if (dosageInput) dosageInput.value = '';
        if (durationInput) durationInput.value = '';

        modal.classList.remove('hidden');
    };

    window.closePrescriptionModal = function () {
        const modal = document.getElementById('prescription-modal');
        if (modal) modal.classList.add('hidden');
    };

    window.savePrescription = function () {
        const select = document.getElementById('rx-patient-select');
        const medInput = document.getElementById('rx-medication');
        const dosageInput = document.getElementById('rx-dosage');
        const durationInput = document.getElementById('rx-duration');
        if (!select || !medInput || !dosageInput || !durationInput) return;

        const patientId = select.value;
        const medication = medInput.value.trim();
        const dosage = dosageInput.value.trim();
        const duration = durationInput.value.trim();

        if (!patientId) {
            showToast('Choose a patient first');
            return;
        }
        if (!medication) {
            showToast('Enter a medication');
            return;
        }
        if (!dosage) {
            showToast('Enter a dosage');
            return;
        }
        if (!duration) {
            showToast('Enter a duration');
            return;
        }

        const prescriptions = readStore(PRESCRIPTIONS_KEY) || [];
        const newId = 'RX-' + String(Date.now()).slice(-6);
        const issuedLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

        prescriptions.unshift({
            id: newId,
            patientId: patientId,
            medication: medication,
            dosage: dosage,
            duration: duration,
            issued: issuedLabel,
            status: 'Active'
        });

        writeStore(PRESCRIPTIONS_KEY, prescriptions);

        closePrescriptionModal();
        renderPrescriptions();
        showToast('Prescription issued');
    };

    /* ---------- NEW MEDICAL RECORD ---------- */
    window.openMedicalRecordModal = function () {
        const modal = document.getElementById('medical-record-modal');
        if (!modal) return;

        const select = document.getElementById('mr-patient-select');
        const emptyNotice = document.getElementById('mr-empty-notice');
        const formWrap = document.getElementById('mr-form-wrap');
        const patients = myPatients();

        if (patients.length === 0) {
            if (emptyNotice) emptyNotice.classList.remove('hidden');
            if (formWrap) formWrap.classList.add('hidden');
        } else {
            if (emptyNotice) emptyNotice.classList.add('hidden');
            if (formWrap) formWrap.classList.remove('hidden');
            if (select) {
                select.innerHTML = patients.map(function (p) {
                    return '<option value="' + p.id + '">' + p.name + '</option>';
                }).join('');
            }
        }

        const diagnosisInput = document.getElementById('mr-diagnosis');
        const notesInput = document.getElementById('mr-notes');
        if (diagnosisInput) diagnosisInput.value = '';
        if (notesInput) notesInput.value = '';

        modal.classList.remove('hidden');
    };

    window.closeMedicalRecordModal = function () {
        const modal = document.getElementById('medical-record-modal');
        if (modal) modal.classList.add('hidden');
    };

    window.saveMedicalRecord = function () {
        const select = document.getElementById('mr-patient-select');
        const diagnosisInput = document.getElementById('mr-diagnosis');
        const notesInput = document.getElementById('mr-notes');
        if (!select || !diagnosisInput) return;

        const patientId = select.value;
        const diagnosis = diagnosisInput.value.trim();
        const notes = notesInput ? notesInput.value.trim() : '';

        if (!patientId) {
            showToast('Choose a patient first');
            return;
        }
        if (!diagnosis) {
            showToast('Enter a diagnosis');
            return;
        }

        // Defensive: only allow saving for a patient actually assigned to
        // this doctor, even though the dropdown already only lists those.
        if (myPatientIds().indexOf(patientId) === -1) {
            showToast('That patient is not assigned to you');
            return;
        }

        const records = readStore(MEDICALRECORDS_KEY) || [];
        const now = new Date();
        const newId = 'MR-' + String(Date.now()).slice(-6);
        const dateLabel = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

        records.push({
            id: newId,
            patientId: patientId,
            doctorId: session.id,
            diagnosis: diagnosis,
            notes: notes,
            date: now.toISOString(),
            dateLabel: dateLabel
        });

        writeStore(MEDICALRECORDS_KEY, records);

        closeMedicalRecordModal();
        renderMedicalRecords();
        showToast('Medical record saved');
    };

    /* ============================================================
       MASTER RENDER
    ============================================================ */

    function renderDashboardData() {
        const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long' });

        renderStatCards();
        renderPatientsTable();
        renderAppointmentsTable();
        renderTodaysAppointments();
        renderVisitsList();
        renderThisWeekPanel(todayLabel);
        renderScheduleTimeline(todayLabel);
        renderNextSurgery();
        renderCaseLegend();
        renderTasks();
        renderActivity();
        renderPrescriptions();
        renderMedicalRecords();
        renderLabResults();
        renderMessageList();
        renderNotificationBadge();
    }

    renderDashboardData();

    /* ---------- SETTINGS ---------- */
    function applyDarkMode(on) {
        document.body.classList.toggle('dark-mode', !!on);
    }

    function renderSettingsToggles() {
        document.querySelectorAll('.settings-toggle').forEach(function (btn) {
            const key = btn.getAttribute('data-setting');
            const on = !!currentSettings[key];
            btn.classList.toggle('on', on);
        });
    }

    function revertSettingsToSaved() {
        currentSettings = getDoctorSettings(session.id);
        applyDarkMode(currentSettings.darkMode);
        renderSettingsToggles();
    }

    applyDarkMode(currentSettings.darkMode);
    renderSettingsToggles();

    window.toggleSetting = function (btn) {
        const key = btn.getAttribute('data-setting');
        if (!key) return;
        currentSettings[key] = !currentSettings[key];
        btn.classList.toggle('on', currentSettings[key]);
        if (key === 'darkMode') applyDarkMode(currentSettings[key]);
    };

    window.saveAllSettings = function () {
        currentSettings = saveDoctorSettings(session.id, currentSettings);
        applyDarkMode(currentSettings.darkMode);
        renderSettingsToggles();
        showToast('Settings saved');
    };

    window.resetSettingsToDefault = function () {
        currentSettings = Object.assign({}, DEFAULT_SETTINGS);
        saveDoctorSettings(session.id, currentSettings);
        applyDarkMode(currentSettings.darkMode);
        renderSettingsToggles();
        showToast('Settings reset to default');
    };

      /* ---------- DELETE ACCOUNT ---------- */
    const deleteAccountModal = document.getElementById('delete-account-modal');
    const deleteConfirmInput = document.getElementById('delete-confirm-input');
    const confirmDeleteBtn = document.getElementById('confirm-delete-account-btn');

    if (deleteConfirmInput && confirmDeleteBtn) {
        deleteConfirmInput.addEventListener('input', function () {
            confirmDeleteBtn.disabled = deleteConfirmInput.value.trim() !== 'DELETE';
        });
    }

    window.openDeleteAccountModal = function () {
        if (deleteConfirmInput) deleteConfirmInput.value = '';
        if (confirmDeleteBtn) confirmDeleteBtn.disabled = true;
        if (deleteAccountModal) deleteAccountModal.classList.remove('hidden');
    };

    window.closeDeleteAccountModal = function () {
        if (deleteAccountModal) deleteAccountModal.classList.add('hidden');
    };

    window.confirmDeleteAccount = function () {
        if (!deleteConfirmInput || deleteConfirmInput.value.trim() !== 'DELETE') return;

        // Remove this user from the master users list
        const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        const filteredUsers = users.filter(function (u) { return u.id !== session.id; });
        localStorage.setItem(USERS_KEY, JSON.stringify(filteredUsers));

        // Remove this doctor's staff record — this is what admindashboard.js
        // (and the patient-facing "book appointment" doctor list) reads from.
        // Without this, the doctor stayed visible everywhere except login.
        const doctors = JSON.parse(localStorage.getItem(DOCTORS_KEY) || '[]');
        const filteredDoctors = doctors.filter(function (d) { return d.id !== session.id; });
        localStorage.setItem(DOCTORS_KEY, JSON.stringify(filteredDoctors));

        // Unassign any patients who had this doctor assigned, so the admin's
        // Patients table doesn't keep showing a dangling assignedDoctorId
        // pointing at a doctor who no longer exists.
        const patients = JSON.parse(localStorage.getItem(PATIENTS_KEY) || '[]');
        let patientsChanged = false;
        patients.forEach(function (p) {
            if (p.assignedDoctorId === session.id) {
                p.assignedDoctorId = null;
                patientsChanged = true;
            }
        });
        if (patientsChanged) {
            localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
        }

        // Remove this user's extra profile data (blood group, doctor, avatar)
        const profiles = getDoctorProfiles();
        delete profiles[session.id];
        localStorage.setItem(DOCTOR_PROFILES_KEY, JSON.stringify(profiles));

        // Remove any per-user settings
        const allSettings = getAllDoctorSettings();
        delete allSettings[session.id];
        localStorage.setItem(DOCTOR_SETTINGS_KEY, JSON.stringify(allSettings));

        // Clear the active session from both storages
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);

        // Send them off the dashboard entirely
        window.location.href = '/tailwind/src/pages/login.html';
    };

    /* ---------- TOAST ---------- */
    window.showToast = function (message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = '\u2713 ' + message;
        toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');

        clearTimeout(toast._hideTimeout);
        toast._hideTimeout = setTimeout(function () {
            toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
        }, 2500);
    };

});