/* ============================================================
   NeloCare Patient Dashboard — dashboard.js
   Merge this into your shared script file if needed.
   Every block below is guarded so pages missing these elements
   won't throw errors (same pattern used in newsletter.js).

   FIX APPLIED: the assigned doctor is now read live from
   nelocare_patients[].assignedDoctorId (joined against
   nelocare_doctors) instead of the disconnected
   nelocare_profiles[].doctor text field. That old field was only
   ever updated by bookAppointment() or by the patient typing a
   name into their own profile modal — so an admin assigning a
   doctor from the admin dashboard never showed up here. Now both
   sides read the same record, so admin assignments reflect
   immediately (after a refresh/re-render).
============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  /* ---------- SESSION / LOGGED-IN USER ---------- */
  const SESSION_KEY = "auth_session";
  const USERS_KEY = "auth_users";
  const PROFILES_KEY = "nelocare_profiles";
  const DOCTORS_KEY = "nelocare_doctors";
  const PATIENTS_KEY = "nelocare_patients";
  const APPOINTMENTS_KEY = "nelocare_appointments";
  const PRESCRIPTIONS_KEY = "nelocare_prescriptions";
  const MEDICALRECORDS_KEY = "nelocare_medicalrecords";
  const MESSAGES_KEY = "nelocare_messages";

  function getSession() {
    const temporary = sessionStorage.getItem(SESSION_KEY);
    if (temporary) return JSON.parse(temporary);
    const persistent = localStorage.getItem(SESSION_KEY);
    return persistent ? JSON.parse(persistent) : null;
  }

  function getProfiles() {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  function getProfileExtra(userId) {
    return getProfiles()[userId] || {};
  }

  function saveProfileExtra(userId, data) {
    const profiles = getProfiles();
    profiles[userId] = Object.assign({}, profiles[userId], data);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }

  // Generic shared-store read/write helpers, used for doctors,
  // patients, and appointments — the tables shared across the
  // patient / doctor / admin dashboards.
  function readStore(key) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  }

  function writeStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  const session = getSession();

  // Nobody logged in? Don't show a dashboard with no owner —
  // send them back to the login page instead.
  if (!session) {
    window.location.href = "/tailwind/src/pages/login.html";
    return;
  }

  // Blood group / avatar aren't collected at registration, so they're
  // stored separately per-user and default sensibly until the patient
  // fills them in via "Update Profile". (Doctor used to live here too,
  // but it's now derived from nelocare_patients.assignedDoctorId — see
  // getAssignedDoctorName() below.)
  const profileExtra = getProfileExtra(session.id);

  // Single source of truth for "who is this patient's doctor": reads
  // assignedDoctorId off this patient's record in nelocare_patients
  // (set by admin's savePatientEdits(), or by this patient's own first
  // booking) and joins it against nelocare_doctors for the display name.
  function getAssignedDoctorName() {
    const patients = readStore(PATIENTS_KEY);
    const record = patients.find(function (p) {
      return p.id === session.id;
    });
    if (!record || !record.assignedDoctorId) return "Not assigned yet";

    const doctors = readStore(DOCTORS_KEY);
    const doc = doctors.find(function (d) {
      return d.id === record.assignedDoctorId;
    });
    return doc ? doc.name : "Not assigned yet";
  }

  function currentProfile() {
    return {
      name: session.name || "Patient",
      patientId:
        "#NC" + (session.id ? session.id.slice(-6).toUpperCase() : "000000"),
      blood: profileExtra.blood || "Not set",
      doctor: getAssignedDoctorName(),
      avatar: profileExtra.avatar || null,
    };
  }

  function renderProfile() {
    const p = currentProfile();

    const welcomeHeading = document.getElementById("welcome-heading");
    if (welcomeHeading) {
      const firstName = p.name.split(" ")[0];
      welcomeHeading.textContent = "Welcome Back, " + firstName;
    }

    const nameEl = document.getElementById("profile-name");
    if (nameEl) nameEl.textContent = p.name;

    const idEl = document.getElementById("profile-patient-id");
    if (idEl) idEl.textContent = "Patient ID: " + p.patientId;

    const bloodEl = document.getElementById("profile-blood");
    if (bloodEl) bloodEl.textContent = p.blood;

    const doctorEl = document.getElementById("profile-doctor");
    if (doctorEl) doctorEl.textContent = p.doctor;

    const avatarEl = document.getElementById("profile-avatar");
    if (avatarEl && p.avatar) avatarEl.src = p.avatar;

    const modalIdEl = document.getElementById("modal-patient-id");
    if (modalIdEl) modalIdEl.value = p.patientId;
  }

  renderProfile();

  /* ---------- SIDEBAR (mobile) ---------- */
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");

  window.openSidebar = function () {
    if (sidebar) sidebar.classList.remove("-translate-x-full");
    if (overlay) overlay.classList.remove("hidden");
  };

  window.closeSidebar = function () {
    if (sidebar) sidebar.classList.add("-translate-x-full");
    if (overlay) overlay.classList.add("hidden");
  };

  /* ---------- PAGE NAVIGATION (SPA sections) ---------- */
  const navLinks = document.querySelectorAll(".nav-link");
  if (navLinks.length) {
    navLinks.forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const target = link.getAttribute("data-section");
        if (!target) return;

        // Leaving Settings without clicking "Save All Settings"?
        // Discard the unsaved toggle changes instead of letting them
        // silently carry over — reload whatever was last saved.
        const leavingSection = document.querySelector(".page-section.active");
        if (
          leavingSection &&
          leavingSection.id === "section-settings" &&
          target !== "settings"
        ) {
          loadSettings();
        }

        // Swap active section
        document.querySelectorAll(".page-section").forEach(function (sec) {
          sec.classList.remove("active");
        });
        const targetSection = document.getElementById("section-" + target);
        if (targetSection) targetSection.classList.add("active");

        // Billing always re-opens on the dashboard sub-view, not Claims Center
        if (target === "billing") {
          closeClaimsCenter();
        }

        // Patient/doctor assignment data can change between visits to
        // this dashboard (e.g. admin assigned a doctor while the
        // patient had this tab open) — refresh the profile/overview
        // cards on every nav click so the patient never has to
        // manually reload the page to see it.
        renderProfile();
        updateStats();
        renderPrescriptions();
        renderMedicalRecords();
        populateDoctorSelect();
        populateMessageRecipient();

        // Update active nav styling
        navLinks.forEach(function (l) {
          l.classList.remove("bg-white", "text-blue-500", "shadow");
          l.classList.add("hover:bg-blue-600");
        });
        link.classList.add("bg-white", "text-blue-500", "shadow");
        link.classList.remove("hover:bg-blue-600");

        // Close sidebar on mobile after navigating
        closeSidebar();
      });
    });
  }

  /* ---------- NOTIFICATIONS ---------- */
  const notifDropdown = document.getElementById("notif-dropdown");
  const notifList = document.getElementById("notif-list");
  const notifEmpty = document.getElementById("notif-empty");
  const notifBadge = document.getElementById("notif-badge");

  function updateNotifBadge(count) {
    if (!notifBadge) return;
    notifBadge.textContent = String(count);
    notifBadge.classList.toggle("hidden", count <= 0);
    notifBadge.classList.toggle("flex", count > 0);
  }

  window.toggleNotifications = function () {
    if (notifDropdown) notifDropdown.classList.toggle("hidden");
  };

  window.clearNotifications = function () {
    if (notifList) notifList.innerHTML = "";
    if (notifEmpty) notifEmpty.classList.remove("hidden");
    updateNotifBadge(0);
  };

  // Nothing seeded on load — badge stays hidden until a real notification exists.
  updateNotifBadge(0);

  // Close notif dropdown when clicking outside
  document.addEventListener("click", function (e) {
    if (!notifDropdown || notifDropdown.classList.contains("hidden")) return;
    const notifBtn = document.getElementById("notif-btn");
    if (!notifDropdown.contains(e.target) && e.target !== notifBtn) {
      notifDropdown.classList.add("hidden");
    }
  });

  /* ---------- PROFILE MODAL ---------- */
  const profileModal = document.getElementById("profile-modal");
  const avatarInput = document.getElementById("modal-avatar-input");
  const avatarPreview = document.getElementById("modal-avatar-preview");
  let pendingAvatarDataUrl = null;

  if (avatarInput && avatarPreview) {
    avatarInput.addEventListener("change", function () {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        showToast("Please choose an image file");
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
    if (profileModal) profileModal.classList.remove("hidden");
    // Reset the modal preview to whatever the current dashboard avatar is
    const dashboardAvatar = document.getElementById("profile-avatar");
    if (avatarPreview && dashboardAvatar) {
      avatarPreview.src = dashboardAvatar.src;
    }
    pendingAvatarDataUrl = null;

    // Pre-fill the editable fields with this user's current details
    // instead of leaving stale placeholders in place.
    const p = currentProfile();
    const nameInput = document.getElementById("modal-name");
    const bloodInput = document.getElementById("modal-blood");
    const doctorInput = document.getElementById("modal-doctor");
    if (nameInput) nameInput.value = p.name === "Patient" ? "" : p.name;
    if (bloodInput) bloodInput.value = p.blood !== "Not set" ? p.blood : "";
    if (doctorInput) {
      // Doctor is no longer a free-text field the patient can type into —
      // it's assigned by admin or established by booking. Show it
      // read-only so the modal can't drift out of sync with the real
      // assignedDoctorId again.
      doctorInput.value = p.doctor;
      doctorInput.readOnly = true;
      doctorInput.disabled = true;
    }
  };

  window.closeModal = function () {
    if (profileModal) profileModal.classList.add("hidden");
  };

  window.saveProfile = function () {
    const nameInput = document.getElementById("modal-name");
    const bloodInput = document.getElementById("modal-blood");

    const newName = nameInput ? nameInput.value.trim() : "";

    // Persist blood group / avatar against this user's id so they
    // survive a page refresh. Doctor is intentionally NOT written here
    // anymore — it's derived live from assignedDoctorId, so there's
    // nothing to save for it, and it can no longer be overwritten with
    // an arbitrary typed name.
    const updates = {
      blood: bloodInput ? bloodInput.value : profileExtra.blood,
      avatar: pendingAvatarDataUrl || profileExtra.avatar,
    };
    saveProfileExtra(session.id, updates);
    Object.assign(profileExtra, updates);

    // Keep a name change in sync with the session (and the master
    // users list) so it's consistent on next login and elsewhere in the app.
    if (newName && newName !== session.name) {
      session.name = newName;

      const currentSession = sessionStorage.getItem(SESSION_KEY);
      if (currentSession) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }

      const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
      const idx = users.findIndex(function (u) {
        return u.id === session.id;
      });
      if (idx !== -1) {
        users[idx].name = newName;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
      }
    }

    renderProfile();
    updateStats();
    closeModal();
    showToast("Profile updated successfully");
  };

  /* ---------- APPOINTMENTS ----------
       Loaded from the shared nelocare_appointments store, filtered to
       this patient's own records via patientId, so they persist across
       refresh and are visible to the doctor/admin dashboards too. */
  let appointments = readStore(APPOINTMENTS_KEY).filter(function (a) {
    return a.patientId === session.id;
  });

  function updateCountdownText(dateStr) {
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) return { text: "In " + diffDays + " days", past: false };
    if (diffDays === 1) return { text: "Tomorrow", past: false };
    if (diffDays === 0) return { text: "Today", past: false };
    return { text: "Past appointment", past: true };
  }

  function renderDashboardAppointments() {
    const list = document.getElementById("dashboard-appointments-list");
    const empty = document.getElementById("dashboard-appointments-empty");
    if (!list) return;

    list.innerHTML = "";

    const upcoming = appointments.slice().sort(function (a, b) {
      return (
        new Date(a.date + "T" + (a.time || "00:00")) -
        new Date(b.date + "T" + (b.time || "00:00"))
      );
    });

    if (empty) empty.classList.toggle("hidden", upcoming.length > 0);

    upcoming.forEach(function (appt) {
      const dateObj = new Date(appt.date + "T" + (appt.time || "00:00"));
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        month: "long",
        day: "2-digit",
        year: "numeric",
      });
      const formattedTime = appt.time
        ? dateObj.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      const countdown = updateCountdownText(appt.date);

      const card = document.createElement("div");
      card.className =
        "border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center hover:shadow-lg transition";
      card.innerHTML =
        "<div>" +
        '<h3 class="font-bold text-lg">' +
        escapeHtml(appt.doctor) +
        "</h3>" +
        '<p class="text-slate-500">' +
        escapeHtml(appt.specialty || "General Consultation") +
        "</p>" +
        (appt.reason
          ? '<p class="text-slate-400 text-sm mt-1">' +
            escapeHtml(appt.reason) +
            "</p>"
          : "") +
        "</div>" +
        '<div class="mt-4 md:mt-0 text-right">' +
        '<p class="font-semibold">' +
        formattedDate +
        "</p>" +
        '<p class="text-slate-500">' +
        formattedTime +
        "</p>" +
        '<p class="text-xs font-medium mt-1 ' +
        (countdown.past ? "text-slate-400" : "text-blue-500") +
        '">' +
        countdown.text +
        "</p>" +
        "</div>";
      list.appendChild(card);
    });
  }

  function renderAppointmentsSection() {
    const box = document.getElementById("appointments-list-box");
    const empty = document.getElementById("appointments-list-empty");
    if (!box) return;

    box.innerHTML = "";

    const sorted = appointments.slice().sort(function (a, b) {
      return (
        new Date(a.date + "T" + (a.time || "00:00")) -
        new Date(b.date + "T" + (b.time || "00:00"))
      );
    });

    if (empty) empty.classList.toggle("hidden", sorted.length > 0);
    box.classList.toggle("hidden", sorted.length === 0);

    sorted.forEach(function (appt) {
      const dateObj = new Date(appt.date + "T" + (appt.time || "00:00"));
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        month: "long",
        day: "2-digit",
        year: "numeric",
      });
      const entry = document.createElement("p");
      entry.className = "font-medium";
      entry.textContent =
        formattedDate +
        " — " +
        appt.doctor +
        (appt.specialty ? " (" + appt.specialty + ")" : "") +
        (appt.reason ? ": " + appt.reason : "");
      box.appendChild(entry);
    });
  }

  function renderNextAppointmentOnProfile() {
    const el = document.getElementById("profile-next-appt");
    if (!el) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = appointments
      .filter(function (a) {
        return new Date(a.date) >= today;
      })
      .sort(function (a, b) {
        return (
          new Date(a.date + "T" + (a.time || "00:00")) -
          new Date(b.date + "T" + (b.time || "00:00"))
        );
      });

    if (upcoming.length === 0) {
      el.textContent = "No appointments scheduled";
      return;
    }
    const next = upcoming[0];
    const dateObj = new Date(next.date + "T" + (next.time || "00:00"));
    el.textContent = dateObj.toLocaleDateString("en-US", {
      month: "long",
      day: "2-digit",
      year: "numeric",
    });
  }

  function renderAppointments() {
    renderDashboardAppointments();
    renderAppointmentsSection();
    renderNextAppointmentOnProfile();
  }

  renderAppointments();

  /* ---------- APPOINTMENT MODAL ---------- */
  const appointmentModal = document.getElementById("appointment-modal");

  // Doctors available to book with — read live from the shared
  // nelocare_doctors store (managed via admin), not hardcoded.
  const doctorSelect = document.getElementById("appt-doctor");
  const specialtySelect = document.getElementById("appt-specialty");

  // FIX: this used to list EVERY doctor in nelocare_doctors, letting a
  // patient book with (and thereby self-assign) any doctor in the
  // system, even before an admin had assigned one. Doctor assignment
  // is admin-only — the dropdown must only ever offer the doctor
  // already on this patient's assignedDoctorId, never the full roster.
  function getMyAssignedDoctor() {
    const patients = readStore(PATIENTS_KEY);
    const record = patients.find(function (p) {
      return p.id === session.id;
    });
    if (!record || !record.assignedDoctorId) return null;

    const doctors = readStore(DOCTORS_KEY);
    return (
      doctors.find(function (d) {
        return d.id === record.assignedDoctorId;
      }) || null
    );
  }

  function populateDoctorSelect() {
    if (!doctorSelect) return;
    const doctor = getMyAssignedDoctor();

    if (!doctor) {
      doctorSelect.innerHTML =
        '<option value="">No doctor assigned yet</option>';
      doctorSelect.disabled = true;
      if (specialtySelect) specialtySelect.value = "";
      return;
    }

    doctorSelect.innerHTML =
      '<option value="' +
      doctor.id +
      '">' +
      escapeHtml(doctor.name) +
      "</option>";
    doctorSelect.disabled = false;
    doctorSelect.value = doctor.id;
    if (specialtySelect)
      specialtySelect.value = doctor.department || "General Medicine";
  }
  populateDoctorSelect();

  if (doctorSelect && specialtySelect) {
    doctorSelect.addEventListener("change", function () {
      const doctors = readStore(DOCTORS_KEY);
      const match = doctors.find(function (d) {
        return d.id === doctorSelect.value;
      });
      specialtySelect.value = match
        ? match.department || "General Medicine"
        : "";
    });
  }

  // Messages' "To:" dropdown — same rule as the appointment doctor
  // select: only the admin-assigned doctor (if any) ever appears here,
  // so it now actually reflects assignment instead of staying empty forever.
  const msgRecipientSelect = document.getElementById("msg-recipient");

  function populateMessageRecipient() {
    if (!msgRecipientSelect) return;
    const doctor = getMyAssignedDoctor();

    if (!doctor) {
      msgRecipientSelect.innerHTML =
        '<option value="">No doctor has been assigned to you yet</option>';
      msgRecipientSelect.disabled = true;
      return;
    }

    msgRecipientSelect.disabled = false;
    msgRecipientSelect.innerHTML =
      '<option value="">Select doctor</option>' +
      '<option value="' +
      escapeHtml(doctor.name) +
      '">' +
      escapeHtml(doctor.name) +
      "</option>";
  }
  populateMessageRecipient();

  window.openAppointmentModal = function () {
    populateDoctorSelect();
    if (!getMyAssignedDoctor()) {
      showToast("No doctor assigned yet — please wait for admin to assign one");
      return;
    }
    if (appointmentModal) appointmentModal.classList.remove("hidden");
  };

  window.closeAppointmentModal = function () {
    if (appointmentModal) appointmentModal.classList.add("hidden");
  };

  /* ---------- BOOK NEW APPOINTMENT ---------- */
  window.bookAppointment = function () {
    const dateInput = document.getElementById("appt-date");
    const timeInput = document.getElementById("appt-time");
    const reasonInput = document.getElementById("appt-reason");
    if (!dateInput || !timeInput) return;

    // FIX: the doctor is no longer read from the <select> value — that
    // let a patient book (and thereby self-assign) any doctor. The
    // doctor is always the one on this patient's assignedDoctorId,
    // full stop. If there isn't one, booking is blocked entirely.
    const doctor = getMyAssignedDoctor();
    if (!doctor) {
      showToast("No doctor assigned yet — please wait for admin to assign one");
      return;
    }

    const date = dateInput.value;
    const time = timeInput.value;
    const reason = reasonInput ? reasonInput.value.trim() : "";

    if (!date || !time) {
      showToast("Please choose a date and time");
      return;
    }

    const dateObj = new Date(date + "T" + time);
    const dayLabel = dateObj.toLocaleDateString("en-US", { weekday: "long" });
    const dateLabel = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    });

    const record = {
      id: "appt-" + Date.now(),
      patientId: session.id,
      doctorId: doctor.id,
      doctor: doctor.name,
      specialty: doctor.department || "General Medicine",
      type: "Consultation",
      status: "Confirmed",
      date: date,
      time: time,
      dayLabel: dayLabel,
      dateLabel: dateLabel,
      location: (doctor.department || "General Medicine") + " Dept.",
      reason: reason,
    };

    // Write to the shared store so admin/doctor dashboards can see it too
    const allAppointments = readStore(APPOINTMENTS_KEY);
    allAppointments.push(record);
    writeStore(APPOINTMENTS_KEY, allAppointments);

    // NOTE: assignedDoctorId is intentionally never written from here.
    // Doctor assignment is admin-only (via savePatientEdits() on the
    // admin dashboard) — this patient can only ever book with whichever
    // doctor is already on their record.

    // Keep this session's in-memory list in sync for the current page view
    appointments.push(record);

    dateInput.value = "";
    timeInput.value = "";
    if (reasonInput) reasonInput.value = "";

    closeAppointmentModal();
    renderAppointments();
    renderProfile();
    updateStats();
    showToast("Appointment booked with " + doctor.name);
  };

  /* ---------- DASHBOARD STATS ---------- */
  function updateStats() {
    const statVisits = document.getElementById("stat-visits");
    const statDoctors = document.getElementById("stat-doctors");
    const statRecords = document.getElementById("stat-records");
    const statMeds = document.getElementById("stat-meds");

    if (statVisits) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcoming = appointments.filter(function (a) {
        return new Date(a.date) >= today;
      }).length;
      statVisits.textContent = String(upcoming).padStart(2, "0");
    }

    if (statDoctors) {
      // Unique doctors the patient actually has a relationship with:
      // their assigned doctor (from assignedDoctorId), plus anyone
      // they've booked with.
      const names = new Set();
      const assigned = getAssignedDoctorName();
      if (assigned !== "Not assigned yet") names.add(assigned);
      appointments.forEach(function (a) {
        names.add(a.doctor);
      });
      statDoctors.textContent = String(names.size).padStart(2, "0");
    }

    if (statRecords) {
      const recordsList = document.getElementById("records-list");
      const count = recordsList ? recordsList.children.length : 0;
      statRecords.textContent = String(count).padStart(2, "0");
    }

    if (statMeds) {
      const rxList = document.getElementById("prescription-list");
      const count = rxList ? rxList.children.length : 0;
      statMeds.textContent = String(count).padStart(2, "0");
    }
  }

  /* ---------- PRESCRIPTIONS ---------- */
  function renderPrescriptions() {
    const list = document.getElementById("prescription-list");
    const empty = document.getElementById("prescription-empty");
    if (!list) return;

    const allPrescriptions = readStore(PRESCRIPTIONS_KEY);
    const myPrescriptions = (allPrescriptions || [])
      .filter(function (rx) {
        return rx.patientId === session.id;
      })
      .sort(function (a, b) {
        const aDate = new Date(a.issued || 0);
        const bDate = new Date(b.issued || 0);
        return bDate - aDate;
      });

    if (empty) empty.classList.toggle("hidden", myPrescriptions.length > 0);

    if (myPrescriptions.length === 0) {
      list.innerHTML = "";
      updateStats();
      return;
    }

    list.innerHTML = myPrescriptions
      .map(function (rx) {
        const status = rx.status || "Active";
        const statusColors = {
          Active: "bg-green-100 text-green-700",
          "Refill soon": "bg-yellow-100 text-yellow-700",
          Expired: "bg-red-100 text-red-700",
        };

        return (
          '<li class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 border border-slate-200 rounded-xl px-4 py-3">' +
          "<div>" +
          '<p class="font-semibold text-slate-800">' +
          escapeHtml(rx.medication || "Medication") +
          "</p>" +
          '<p class="text-sm text-slate-500">' +
          escapeHtml(rx.dosage || "—") +
          (rx.duration ? " • " + escapeHtml(rx.duration) : "") +
          "</p>" +
          '<p class="text-xs text-slate-400 mt-1">' +
          escapeHtml(rx.issued || "") +
          "</p>" +
          "</div>" +
          '<span class="text-xs font-semibold px-3 py-1 rounded-full self-start ' +
          (statusColors[status] || "bg-slate-100 text-slate-600") +
          '">' +
          escapeHtml(status) +
          "</span>" +
          "</li>"
        );
      })
      .join("");

    updateStats();
  }
  renderPrescriptions();

  window.addPrescription = function () {
    const nameInput = document.getElementById("med-name");
    const dosageInput = document.getElementById("med-dosage");
    const statusInput = document.getElementById("med-status");
    if (!nameInput || !dosageInput || !statusInput) return;

    const name = nameInput.value.trim();
    const dosage = dosageInput.value.trim();
    const status = statusInput.value;
    if (!name) {
      showToast("Please enter a medication name");
      return;
    }

    const prescriptions = readStore(PRESCRIPTIONS_KEY) || [];
    prescriptions.unshift({
      id: "RX-" + String(Date.now()).slice(-6),
      patientId: session.id,
      medication: name,
      dosage: dosage || "—",
      duration: "",
      issued: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
      status: status,
    });

    writeStore(PRESCRIPTIONS_KEY, prescriptions);
    nameInput.value = "";
    dosageInput.value = "";
    renderPrescriptions();
    showToast("Prescription added");
  };

  /* ---------- MEDICAL RECORDS ----------
     Read-only for patients — entries are written only by the doctor
     dashboard into the shared nelocare_medicalrecords store, keyed by
     patientId. Nothing here ever creates or edits a record; this only
     displays what a doctor has saved for this patient. */
  window.addEventListener("storage", function (event) {
    if (event.key === PRESCRIPTIONS_KEY || event.key === MEDICALRECORDS_KEY) {
      renderPrescriptions();
      renderMedicalRecords();
      updateStats();
    }
  });

  function renderMedicalRecords() {
    const list = document.getElementById("records-list");
    const empty = document.getElementById("records-empty");
    if (!list) return;

    const allRecords = readStore(MEDICALRECORDS_KEY);
    const myRecords = allRecords
      .filter(function (r) {
        return r.patientId === session.id;
      })
      .sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
      });

    if (empty) empty.classList.toggle("hidden", myRecords.length > 0);

    if (myRecords.length === 0) {
      list.innerHTML = "";
      return;
    }

    const doctors = readStore(DOCTORS_KEY);

    list.innerHTML = myRecords
      .map(function (r) {
        const doctor = doctors.find(function (d) {
          return d.id === r.doctorId;
        });
        const doctorName = doctor ? doctor.name : "Care team";
        return (
          '<div class="border border-slate-200 rounded-2xl p-5">' +
          '<div class="flex justify-between items-start mb-1">' +
          '<h4 class="font-semibold text-slate-800">' +
          escapeHtml(r.diagnosis) +
          "</h4>" +
          '<span class="text-xs text-slate-400 shrink-0 ml-3">' +
          escapeHtml(r.dateLabel || "") +
          "</span>" +
          "</div>" +
          '<p class="text-xs text-slate-400 mb-2">' +
          escapeHtml(doctorName) +
          "</p>" +
          (r.notes
            ? '<p class="text-sm text-slate-600">' +
              escapeHtml(r.notes) +
              "</p>"
            : "") +
          "</div>"
        );
      })
      .join("");
  }
  renderMedicalRecords();

  /* ---------- MESSAGES ----------
     FIX: this used to only ever append one locally-built DOM bubble at
     send time — it never read nelocare_messages back, so on refresh
     the whole conversation vanished, and a doctor's reply (written by
     doctorsDashboard.js into the same store) never appeared here at
     all. renderMessages() now reads the actual conversation thread
     for this patient and re-draws it in full, every time — on load,
     after sending, on nav click, and when another tab writes to
     localStorage (see the "storage" event listener near the bottom). */
  function getMyConversation() {
    const messages = readStore(MESSAGES_KEY);
    return (
      messages.find(function (m) {
        return m.patientId === session.id;
      }) || null
    );
  }

  function renderMessages() {
    const list = document.getElementById("messages-list");
    const empty = document.getElementById("messages-empty");
    if (!list) return;

    const conversation = getMyConversation();
    const thread = (conversation && conversation.thread) || [];

    if (empty) empty.classList.toggle("hidden", thread.length > 0);

    list.innerHTML = thread
      .map(function (line) {
        const senderLabel = line.isDoctor ? line.sender || "Doctor" : "You";
        return (
          '<div class="border border-slate-200 rounded-xl p-4">' +
          '<div class="flex justify-between items-center mb-1">' +
          '<h4 class="font-semibold text-slate-800">' +
          escapeHtml(senderLabel) +
          "</h4>" +
          '<span class="text-xs text-slate-400">' +
          escapeHtml(line.time || "") +
          "</span>" +
          "</div>" +
          '<p class="text-sm text-slate-600">' +
          escapeHtml(line.text) +
          "</p>" +
          "</div>"
        );
      })
      .join("");

    // Reading the thread marks any doctor replies as seen.
    if (conversation && conversation.unread) {
      const messages = readStore(MESSAGES_KEY);
      const rec = messages.find(function (m) {
        return m.id === conversation.id;
      });
      if (rec) {
        rec.unread = false;
        writeStore(MESSAGES_KEY, messages);
      }
    }
  }
  renderMessages();

  window.addMessage = function () {
    const recipientSelect = document.getElementById("msg-recipient");
    const textInput = document.getElementById("msg-text");
    if (!recipientSelect || !textInput) return;

    const recipient = recipientSelect.value;
    const text = textInput.value.trim();
    if (!recipient || !text) {
      showToast("Please choose a doctor and enter a message");
      return;
    }

    // Only allowed to message the doctor actually assigned to this

    const doctor = getMyAssignedDoctor();
    if (!doctor) {
      showToast("No doctor assigned yet — please wait for admin to assign one");
      return;
    }

    // The patient's own name is pulled from the profile already on the page —
    // never typed in, so it can't be spoofed.
    const profileNameEl = document.getElementById("profile-name");
    const patientName = profileNameEl
      ? profileNameEl.textContent.trim()
      : "You";

    const timeLabel = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const patients = readStore(PATIENTS_KEY);
    const myPatientRecord = patients.find(function (p) {
      return p.id === session.id;
    });
    const initials =
      (myPatientRecord && myPatientRecord.initials) ||
      patientName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(function (w) {
          return w[0].toUpperCase();
        })
        .join("") ||
      "??";

    const messages = readStore(MESSAGES_KEY);
    let record = messages.find(function (m) {
      return m.patientId === session.id;
    });

    if (record) {
      record.thread = record.thread || [];
      record.thread.push({
        sender: patientName,
        text: text,
        time: timeLabel,
        isDoctor: false,
      });
      record.time = timeLabel;
      record.preview = text.length > 60 ? text.slice(0, 60) + "…" : text;
      record.unread = true;
    } else {
      record = {
        id: "MSG" + Date.now(),
        patientId: session.id,
        from: patientName,
        fromInitials: initials,
        fromColor: "blue",
        preview: text.length > 60 ? text.slice(0, 60) + "…" : text,
        time: timeLabel,
        urgent: false,
        unread: true,
        thread: [
          { sender: patientName, text: text, time: timeLabel, isDoctor: false },
        ],
      };
      messages.unshift(record);
    }
    writeStore(MESSAGES_KEY, messages);

    renderMessages();
    recipientSelect.value = "";
    textInput.value = "";
    showToast("Message sent to " + recipient);
  };

  /* ---------- SETTINGS ---------- */
  const settingButtons = {
    email: document.getElementById("btn-email"),
    sms: document.getElementById("btn-sms"),
    dark: document.getElementById("btn-dark"),
  };

  function applyToggleState(key, isOn) {
    const btn = settingButtons[key];
    if (!btn) return;
    btn.textContent = isOn ? "ON" : "OFF";
    btn.classList.toggle("on", isOn);
    btn.classList.toggle("off", !isOn);

    if (key === "dark") {
      document.body.classList.toggle("dark-mode", isOn);
    }
  }

  function loadSettings() {
    const saved = JSON.parse(localStorage.getItem("nelocare-settings") || "{}");
    const defaults = { email: true, sms: true, dark: false };
    const settings = Object.assign({}, defaults, saved);
    Object.keys(settingButtons).forEach(function (key) {
      applyToggleState(key, settings[key]);
    });
  }

  window.toggleSetting = function (key) {
    const btn = settingButtons[key];
    if (!btn) return;
    const isCurrentlyOn = btn.classList.contains("on");
    applyToggleState(key, !isCurrentlyOn);
  };

  window.saveAllSettings = function () {
    const settings = {};
    Object.keys(settingButtons).forEach(function (key) {
      const btn = settingButtons[key];
      settings[key] = btn ? btn.classList.contains("on") : true;
    });
    localStorage.setItem("nelocare-settings", JSON.stringify(settings));
    showToast("Settings saved");
  };

  window.resetSettings = function () {
    const defaults = { email: true, sms: true, dark: false };
    Object.keys(settingButtons).forEach(function (key) {
      applyToggleState(key, defaults[key]);
    });
    localStorage.setItem("nelocare-settings", JSON.stringify(defaults));
    showToast("Settings reset to default");
  };

  if (Object.values(settingButtons).some(Boolean)) {
    loadSettings();
  }

  /* ---------- DELETE ACCOUNT ---------- */
  const deleteAccountModal = document.getElementById("delete-account-modal");
  const deleteConfirmInput = document.getElementById("delete-confirm-input");
  const confirmDeleteBtn = document.getElementById(
    "confirm-delete-account-btn",
  );

  if (deleteConfirmInput && confirmDeleteBtn) {
    deleteConfirmInput.addEventListener("input", function () {
      confirmDeleteBtn.disabled = deleteConfirmInput.value.trim() !== "DELETE";
    });
  }

  window.openDeleteAccountModal = function () {
    if (deleteConfirmInput) deleteConfirmInput.value = "";
    if (confirmDeleteBtn) confirmDeleteBtn.disabled = true;
    if (deleteAccountModal) deleteAccountModal.classList.remove("hidden");
  };

  window.closeDeleteAccountModal = function () {
    if (deleteAccountModal) deleteAccountModal.classList.add("hidden");
  };

  window.confirmDeleteAccount = function () {
    if (!deleteConfirmInput || deleteConfirmInput.value.trim() !== "DELETE")
      return;

    // Remove this user from the master users list
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    const filteredUsers = users.filter(function (u) {
      return u.id !== session.id;
    });
    localStorage.setItem(USERS_KEY, JSON.stringify(filteredUsers));

    // Remove this patient's extra profile data (blood group, avatar)
    const profiles = getProfiles();
    delete profiles[session.id];
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

    // Remove this patient's record from the shared patients store
    const patients = readStore(PATIENTS_KEY);
    const filteredPatients = patients.filter(function (p) {
      return p.id !== session.id;
    });
    writeStore(PATIENTS_KEY, filteredPatients);

    // Remove this patient's appointments from the shared appointments store
    const allAppointments = readStore(APPOINTMENTS_KEY);
    const filteredAppointments = allAppointments.filter(function (a) {
      return a.patientId !== session.id;
    });
    writeStore(APPOINTMENTS_KEY, filteredAppointments);

    // Clear the active session from both storages
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);

    // Send them off the dashboard entirely
    window.location.href = "/tailwind/src/pages/login.html";
  };

  /* ---------- TOAST ---------- */
  window.showToast = function (message) {
    let toast = document.getElementById("nelocare-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "nelocare-toast";
      toast.className =
        "fixed bottom-6 right-6 bg-slate-800 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl z-50 opacity-0 translate-y-2 transition duration-300";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("opacity-0", "translate-y-2");

    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(function () {
      toast.classList.add("opacity-0", "translate-y-2");
    }, 2500);
  };

  /* ---------- HELPERS ---------- */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Run once on load in case dashboard stat elements need initial values
  updateStats();
});
