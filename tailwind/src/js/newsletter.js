//NEWS LETTER FORM VALIDATION//
document.addEventListener("DOMContentLoaded", function () {
  const emailInput = document.querySelector(
    'input[placeholder="Enter your email here*"]',
  );
  const subscribeCheck = document.getElementById("subscribeCheck");
  const subscribeBtn = document.querySelector('a.border-white[href="#"]'); // the "Subscribe Now" link

  if (!emailInput || !subscribeCheck || !subscribeBtn) return;

  // Create a small feedback message under the email input
  const feedback = document.createElement("p");
  feedback.className = "text-xs mt-2 min-h-[1rem]";
  emailInput.insertAdjacentElement("afterend", feedback);

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function showFeedback(message, isError) {
    feedback.textContent = message;
    feedback.classList.toggle("text-red-300", isError);
    feedback.classList.toggle("text-green-200", !isError);
  }

  subscribeBtn.addEventListener("click", function (e) {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (email === "") {
      showFeedback("Please enter your email address.", true);
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showFeedback("Please enter a valid email address.", true);
      emailInput.focus();
      return;
    }

    if (!subscribeCheck.checked) {
      showFeedback("Please agree to receive marketing emails first.", true);
      subscribeCheck.focus();
      return;
    }

    // Validation passed — send to your backend/newsletter API here
    showFeedback("Thanks for subscribing!", false);
    emailInput.value = "";
    subscribeCheck.checked = false;
  });

  emailInput.addEventListener("input", () => (feedback.textContent = ""));
  subscribeCheck.addEventListener("change", () => (feedback.textContent = ""));
});

//CONTACT FORM VALIDATION//
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("contactForm");
  if (!form) return;

  const nameInput = form.querySelector('input[type="text"]'); // Full Name
  const emailInput = form.querySelector('input[type="email"]'); // Email
  const subjectInput = form.querySelectorAll('input[type="text"]')[1]; // Subject
  const messageInput = form.querySelector("textarea"); // Message
  const termsCheck = document.getElementById("contactTerms");
  const submitBtn = form.querySelector('button[type="submit"]');

  // Feedback message element, inserted above the submit button
  const feedback = document.createElement("p");
  feedback.className = "text-sm mt-3 min-h-[1.25rem]";
  submitBtn.insertAdjacentElement("beforebegin", feedback);

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function showFeedback(message, isError) {
    feedback.textContent = message;
    feedback.classList.toggle("text-red-600", isError);
    feedback.classList.toggle("text-green-600", !isError);
  }

  function setFieldError(field, isError) {
    field.classList.toggle("border-red-500", isError);
    field.classList.toggle("border-gray-300", !isError);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const subject = subjectInput.value.trim();
    const message = messageInput.value.trim();

    let firstInvalid = null;

    setFieldError(nameInput, false);
    setFieldError(emailInput, false);
    setFieldError(subjectInput, false);
    setFieldError(messageInput, false);

    if (name === "") {
      setFieldError(nameInput, true);
      firstInvalid = firstInvalid || nameInput;
    }
    if (email === "" || !isValidEmail(email)) {
      setFieldError(emailInput, true);
      firstInvalid = firstInvalid || emailInput;
    }
    if (subject === "") {
      setFieldError(subjectInput, true);
      firstInvalid = firstInvalid || subjectInput;
    }
    if (message === "" || message.length < 10) {
      setFieldError(messageInput, true);
      firstInvalid = firstInvalid || messageInput;
    }

    if (firstInvalid) {
      showFeedback(
        "Please fill in all required fields correctly. Message should be at least 10 characters.",
        true,
      );
      firstInvalid.focus();
      return;
    }

    if (!termsCheck.checked) {
      showFeedback(
        "Please agree to the privacy policy before submitting.",
        true,
      );
      termsCheck.focus();
      return;
    }

    // All validation passed — send data to your backend/email API here, e.g.:
    // fetch('/api/contact', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ name, email, subject, message })
    // });

    showFeedback(
      "Thanks, " +
        name +
        "! Your message has been sent. We'll get back to you within 24 hours.",
      false,
    );
    form.reset();
  });

  // Clear field error styling as the user types
  [nameInput, emailInput, subjectInput, messageInput].forEach((field) => {
    field.addEventListener("input", () => setFieldError(field, false));
  });
});

// --- DOCTOR SEARCH & FILTER LOGIC//

// --- Debounce helper ---
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// --- Elements ---
const searchInput = document.getElementById("doctorSearchInput");
const departmentFilter = document.getElementById("departmentFilter");
const availabilityFilter = document.getElementById("availabilityFilter");
const searchBtn = document.getElementById("searchDoctorsBtn");
const doctorGrid = document.getElementById("doctorGrid");
const noResultsMsg = document.getElementById("noResultsMsg");
const doctorCards = Array.from(doctorGrid.querySelectorAll(".doctor-card"));

// --- Client-side filter logic ---
// (Swap the body of this function for a fetch() call to a real API
// once you have a backend endpoint returning doctor data.)
function filterDoctors() {
  const query = searchInput.value.trim().toLowerCase();
  const department = departmentFilter.value;
  const availability = availabilityFilter.value;

  let visibleCount = 0;

  doctorCards.forEach((card) => {
    const name = (card.dataset.name || "").toLowerCase();
    const cardDept = card.dataset.department || "";
    const cardAvailability = card.dataset.availability || "";

    const matchesName = !query || name.includes(query);
    const matchesDept = !department || cardDept === department;
    const matchesAvailability =
      !availability || cardAvailability === availability;

    const isMatch = matchesName && matchesDept && matchesAvailability;
    card.style.display = isMatch ? "" : "none";
    if (isMatch) visibleCount++;
  });

  noResultsMsg.classList.toggle("hidden", visibleCount !== 0);
}

const debouncedFilter = debounce(filterDoctors, 400);

// Live search as user types
searchInput.addEventListener("input", debouncedFilter);

// Instant filtering when dropdowns change
departmentFilter.addEventListener("change", filterDoctors);
availabilityFilter.addEventListener("change", filterDoctors);

// Manual trigger via button
searchBtn.addEventListener("click", (e) => {
  e.preventDefault();
  filterDoctors();
});

// --- View All Specialists (reveal / collapse extra doctors) ---
const viewAllBtn = document.getElementById("viewAllBtn");
const viewAllBtnText = document.getElementById("viewAllBtnText");
const extraDoctors = doctorGrid.querySelectorAll(".extra-doctor");
let allRevealed = false;

viewAllBtn.addEventListener("click", (e) => {
  e.preventDefault(); // stop the "#" link from jumping the page

  allRevealed = !allRevealed;

  extraDoctors.forEach((card) => {
    card.classList.toggle("hidden", !allRevealed);
  });

  viewAllBtnText.textContent = allRevealed
    ? "Show Less"
    : "View All Specialists";

  // Re-apply any active search/filter so newly revealed cards
  // are correctly shown or hidden based on the current filters.
  filterDoctors();

  if (!allRevealed) {
    // Scroll back up to the doctors section when collapsing,
    // so the user isn't left staring at a spot below the fold.
    document
      .getElementById("doctors-section")
      .scrollIntoView({ behavior: "smooth" });
  }
});

//PHONE NUMBER LINKING & COPY TO CLIPBOARD//
document.addEventListener("DOMContentLoaded", function () {
  const phoneLinks = document.querySelectorAll(".phone-link");

  // crude mobile detection — tel: links work natively on phones
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  phoneLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      if (isMobile) return; // let the tel: link behave normally

      e.preventDefault();
      const number = link.getAttribute("href").replace("tel:", "");

      navigator.clipboard
        .writeText(number)
        .then(function () {
          showCopiedTooltip(link);
        })
        .catch(function () {
          // clipboard API failed (e.g. insecure context) — fall back to nothing extra
        });
    });
  });

  function showCopiedTooltip(link) {
    const tip = document.createElement("span");
    tip.textContent = "Copied!";
    tip.className =
      "ml-2 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full";
    link.insertAdjacentElement("afterend", tip);
    setTimeout(() => tip.remove(), 1500);
  }
});


