document.addEventListener('DOMContentLoaded', function () {

  /* ============================================
     1. LIVE FAQ SEARCH
     ============================================ */
  const searchInput = document.querySelector('input[placeholder="Search your question..."]');

  if (searchInput) {
    // Create a "no results" message, hidden by default
    const noResultsMsg = document.createElement('p');
    noResultsMsg.textContent = 'No matching questions found. Try a different search term.';
    noResultsMsg.className = 'text-center text-gray-500 mt-6 hidden';
    noResultsMsg.id = 'faq-no-results';
    searchInput.closest('section').insertAdjacentElement('afterend', noResultsMsg);

    searchInput.addEventListener('input', function () {
      const query = searchInput.value.trim().toLowerCase();
      const allDetails = document.querySelectorAll('main details');
      let anyVisible = false;

      allDetails.forEach(function (detail) {
        const summaryText = detail.querySelector('summary')?.textContent.toLowerCase() || '';
        const answerText = detail.querySelector('p')?.textContent.toLowerCase() || '';
        const matches = query === '' || summaryText.includes(query) || answerText.includes(query);

        detail.style.display = matches ? '' : 'none';
        if (matches) anyVisible = true;

        // auto-open matching results so users see the answer immediately, but only while searching
        if (query !== '' && matches) {
          detail.setAttribute('open', '');
        } else if (query === '') {
          detail.removeAttribute('open');
        }
      });

      // Hide whole category sections if every question inside is hidden
      document.querySelectorAll('main > section [id]').forEach(function (sectionBlock) {
        if (!sectionBlock.querySelector('details')) return; // skip non-FAQ blocks
        const details = sectionBlock.querySelectorAll('details');
        const visibleCount = Array.from(details).filter(d => d.style.display !== 'none').length;
        sectionBlock.style.display = visibleCount === 0 && query !== '' ? 'none' : '';
      });

      noResultsMsg.classList.toggle('hidden', anyVisible || query === '');
    });
  }

  /* ============================================
     2. "WAS THIS HELPFUL?" FEEDBACK
     ============================================ */
  const allAnswers = document.querySelectorAll('main details p');

  allAnswers.forEach(function (answerP, index) {
    const feedbackId = 'faq-feedback-' + index;

    // Skip if feedback already added (safety check)
    if (answerP.nextElementSibling && answerP.nextElementSibling.classList.contains('faq-feedback')) return;

    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'faq-feedback flex items-center gap-3 mt-3 pt-2';
    feedbackDiv.dataset.state = 'unanswered';

    feedbackDiv.innerHTML = `
      <span class="text-xs text-gray-400">Was this helpful?</span>
      <button type="button" class="faq-feedback-btn text-gray-400 hover:text-blue-600 transition text-sm" data-value="yes" aria-label="Yes, this was helpful">
        <i class="fas fa-thumbs-up"></i>
      </button>
      <button type="button" class="faq-feedback-btn text-gray-400 hover:text-blue-600 transition text-sm" data-value="no" aria-label="No, this was not helpful">
        <i class="fas fa-thumbs-down"></i>
      </button>
      <span class="faq-feedback-thanks text-xs text-blue-600 font-semibold hidden">Thanks for your feedback!</span>
    `;

    answerP.insertAdjacentElement('afterend', feedbackDiv);
  });

  // Event delegation for feedback buttons (works even though they were added dynamically)
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.faq-feedback-btn');
    if (!btn) return;

    const wrapper = btn.closest('.faq-feedback');
    if (wrapper.dataset.state === 'answered') return; // already voted, ignore further clicks

    wrapper.dataset.state = 'answered';
    wrapper.querySelectorAll('.faq-feedback-btn').forEach(b => (b.disabled = true));
    btn.classList.remove('text-gray-400');
    btn.classList.add(btn.dataset.value === 'yes' ? 'text-green-600' : 'text-red-500');
    wrapper.querySelector('.faq-feedback-thanks').classList.remove('hidden');

    // Optional: log the vote (replace with an API call if you want to collect this data)
    console.log('FAQ feedback:', btn.closest('details').querySelector('summary').textContent.trim(), '->', btn.dataset.value);
  });

});