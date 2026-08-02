

const GNEWS_API_KEY = "enter your api key";
const GNEWS_ENDPOINT = "https://gnews.io/api/v4/top-headlines";
const ARTICLE_COUNT = 9; 
const VISIBLE_ROW_COUNT = 3; 
// Rotate a category tag color per article for visual variety, matching the site's existing badge style
const BADGE_COLORS = ["bg-red-500", "bg-green-500", "bg-sky-500", "bg-blue-500", "bg-orange-500", "bg-purple-500"];

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function estimateReadTime(text) {
  if (!text) return "3 min read";
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

function buildArticleCard(article, index) {
  const badgeColor = BADGE_COLORS[index % BADGE_COLORS.length];
  const image = article.image || "/tailwind/src/images/service1.png";
  const title = article.title || "Untitled article";
  const description = article.description
    ? article.description.slice(0, 140) + (article.description.length > 140 ? "…" : "")
    : "";
  const sourceName = (article.source && article.source.name) || "Health News";
  const link = article.url || "#";
  const date = formatDate(article.publishedAt);
  const readTime = estimateReadTime(article.description);

  const el = document.createElement("article");
  el.className =
    "bg-white rounded-3xl shadow-md overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-xl";

  el.innerHTML = `
    <div class="relative h-40 overflow-hidden">
      <img class="w-full h-full object-cover" src="${image}" alt="${title.replace(/"/g, "&quot;")}"
        onerror="this.src='/tailwind/src/images/service1.png'">
      <div class="absolute top-4 left-4 ${badgeColor} text-white px-3 py-1 rounded-full text-xs font-semibold">
        ${sourceName}
      </div>
    </div>
    <div class="p-6">
      <div class="flex items-center gap-3 text-xs text-gray-400 mb-2">
        <span>${date}</span>
        <span>•</span>
        <span>${readTime}</span>
      </div>
      <h3 class="font-bold text-blue-700 text-xl">${title}</h3>
      <p class="font-light text-gray-600 text-sm mt-2 leading-relaxed">${description}</p>
      <a href="${link}" target="_blank" rel="noopener noreferrer"
        class="inline-flex items-center gap-1 mt-4 text-blue-700 font-bold text-sm hover:text-blue-400 transition">
        Read Article →
      </a>
    </div>
  `;

  return el;
}

/**
 * Hides every card after the first VISIBLE_ROW_COUNT and wires up a
 * "See More" / "Show Less" toggle button below the grid.
 * Safe to call whether the grid ended up with live articles or the
 * original static cards — it only adds a toggle if there's a second row.
 */
function setupRowToggle() {
  const grid = document.getElementById("health-news-grid");
  if (!grid) return;

  const cards = Array.from(grid.children);
  if (cards.length <= VISIBLE_ROW_COUNT) return; // nothing to hide, no button needed

  const hiddenCards = cards.slice(VISIBLE_ROW_COUNT);
  hiddenCards.forEach((card) => card.classList.add("hidden"));

  // Avoid creating a duplicate button if this ever runs twice
  let wrapper = document.getElementById("articles-toggle-wrapper");
  if (wrapper) wrapper.remove();

  wrapper = document.createElement("div");
  wrapper.id = "articles-toggle-wrapper";
  wrapper.className = "flex justify-center mt-8";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className =
    "text-blue-700 border border-blue-200 bg-blue-100 text-md font-bold py-3 px-8 rounded-full hover:bg-blue-400 hover:text-white transition";
  toggleBtn.textContent = "See More";

  toggleBtn.addEventListener("click", () => {
    const isCurrentlyHidden = hiddenCards[0].classList.contains("hidden");
    hiddenCards.forEach((card) => card.classList.toggle("hidden", !isCurrentlyHidden));
    toggleBtn.textContent = isCurrentlyHidden ? "Show Less" : "See More";
  });

  wrapper.appendChild(toggleBtn);
  grid.insertAdjacentElement("afterend", wrapper);
}

async function loadLiveHealthArticles() {
  const grid = document.getElementById("health-news-grid");
  if (!grid) return;

  if (!GNEWS_API_KEY || GNEWS_API_KEY === "YOUR_API_KEY_HERE") {
    console.info("[article.js] No GNews API key set — keeping static articles.");
    setupRowToggle();
    return;
  }

  const url = `${GNEWS_ENDPOINT}?category=health&lang=en&max=${ARTICLE_COUNT}&apikey=${encodeURIComponent(GNEWS_API_KEY)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GNews responded with ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data.articles) || data.articles.length === 0) {
      throw new Error("No articles returned");
    }

    const articles = data.articles
      .filter((a) => a.title && a.url)
      .slice(0, ARTICLE_COUNT);

    if (articles.length === 0) throw new Error("No usable articles after filtering");

    // Only replace the grid once we know we have good data
    grid.innerHTML = "";
    articles.forEach((article, i) => grid.appendChild(buildArticleCard(article, i)));
  } catch (err) {
    console.warn("[article.js] Falling back to static articles:", err.message);
    // Static cards already in the HTML remain untouched
  } finally {
    setupRowToggle();
  }
}

document.addEventListener("DOMContentLoaded", loadLiveHealthArticles);