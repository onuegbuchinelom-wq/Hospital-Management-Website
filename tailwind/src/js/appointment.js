//APPOINTMENT FORM VALIDATION//
document.getElementById('appointmentForm').addEventListener('submit', function (e) {
  e.preventDefault(); // stop the page from reloading

  const form = e.target;

  // Let the browser run native required-field validation first
  if (!form.checkValidity()) {
    form.reportValidity(); // shows the built-in "please fill out this field" bubbles
    return;
  }

  // Collect the form values
  const data = {
    fullName: form.querySelector('input[type="text"]').value.trim(),
    email: form.querySelector('input[type="email"]').value.trim(),
    phone: form.querySelector('input[type="tel"]').value.trim(),
    department: form.querySelectorAll('select')[0].value,
    doctor: form.querySelectorAll('select')[1].value,
    date: form.querySelector('input[type="date"]').value,
    time: form.querySelectorAll('select')[2].value,
    reason: form.querySelector('textarea').value.trim(),
    agreedToTerms: form.querySelector('#termsCheck').checked
  };

  // At this point you'd normally send `data` to a backend, e.g.:
  // fetch('/api/appointments', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(data)
  // });

  console.log('Appointment submitted:', data);

  alert(
    `Thank you, ${data.fullName}!\n\n` +
    `Your appointment with ${data.doctor} (${data.department}) is set for ` +
    `${data.date} at ${data.time}.\n\nA confirmation email will be sent to ${data.email}.`
  );

  form.reset();
});

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