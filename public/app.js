/* ================================================================
   MoodBoard — app.js
   Frontend logic: fetch, submit, upvote (once), search, filter,
   sort, dark/light mode, mood, auto-poll, scroll-to-top
   ================================================================ */

const API = '/api/posts';
const POLL_INTERVAL = 8000;       // auto-refresh every 8s
const UPVOTED_KEY = 'moodboard_upvoted';  // localStorage key

// ── State ──────────────────────────────────────────────────────────
let allPosts       = [];
let activeCategory = 'All';
let activeSort     = 'hot';
let searchQuery    = '';
let selectedMood   = '';
let pollTimer      = null;

// ── DOM refs ───────────────────────────────────────────────────────
const form            = document.getElementById('post-form');
const messageInput    = document.getElementById('message-input');
const categorySelect  = document.getElementById('category-select');
const submitBtn       = document.getElementById('submit-btn');
const postsContainer  = document.getElementById('posts-container');
const emptyState      = document.getElementById('empty-state');
const loadingState    = document.getElementById('loading-state');
const postCountEl     = document.getElementById('post-count');
const charUsed        = document.getElementById('char-used');
const toastEl         = document.getElementById('toast');
const searchInput     = document.getElementById('search-input');
const categoryTabs    = document.getElementById('category-tabs');
const sortToggle      = document.getElementById('sort-toggle');
const themeToggle     = document.getElementById('theme-toggle');
const themeIcon       = document.getElementById('theme-icon');
const moodSelector    = document.getElementById('mood-selector');
const statPosts       = document.getElementById('stat-posts');
const statUpvotes     = document.getElementById('stat-upvotes');

// ── Helpers ────────────────────────────────────────────────────────

function getUpvotedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(UPVOTED_KEY) || '[]'));
  } catch { return new Set(); }
}

function saveUpvoted(set) {
  localStorage.setItem(UPVOTED_KEY, JSON.stringify([...set]));
}

function hasUpvoted(id) {
  return getUpvotedSet().has(id);
}

function markUpvoted(id) {
  const set = getUpvotedSet();
  set.add(id);
  saveUpvoted(set);
}

function showToast(msg, durationMs = 2800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), durationMs);
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60)    return 'just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60)       return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)        return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)       return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function categoryMeta(cat) {
  const data = {
    Course:   { icon: '📚', cls: 'badge--course' },
    Facility: { icon: '🏢', cls: 'badge--facility' },
    General:  { icon: '🌐', cls: 'badge--general' },
    Food:     { icon: '🍔', cls: 'badge--food' },
    Events:   { icon: '🎉', cls: 'badge--events' },
  };
  return data[cat] || data.General;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function isHotPost(post) {
  const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / 3600000;
  return post.upvotes >= 5 || (post.upvotes >= 3 && ageHours < 6);
}

// ── Filter & Sort ──────────────────────────────────────────────────

function getFilteredPosts() {
  let posts = [...allPosts];

  // Category filter
  if (activeCategory !== 'All') {
    posts = posts.filter(p => p.category === activeCategory);
  }

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    posts = posts.filter(p =>
      p.message.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.mood && p.mood.includes(q))
    );
  }

  // Sort
  if (activeSort === 'hot') {
    posts.sort((a, b) => {
      // Hot score: upvotes weighted by recency
      const ageA = (Date.now() - new Date(a.createdAt).getTime()) / 3600000;
      const ageB = (Date.now() - new Date(b.createdAt).getTime()) / 3600000;
      const scoreA = a.upvotes / (1 + ageA * 0.1);
      const scoreB = b.upvotes / (1 + ageB * 0.1);
      return scoreB - scoreA;
    });
  } else {
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return posts;
}

// ── Render ──────────────────────────────────────────────────────────

function renderPost(post, idx) {
  const card = document.createElement('div');
  card.className = 'post-card';
  if (isHotPost(post)) card.classList.add('hot');
  card.style.animationDelay = `${idx * 0.05}s`;

  const voted = hasUpvoted(post._id);
  const meta = categoryMeta(post.category);

  card.innerHTML = `
    <div class="upvote-col">
      <button class="upvote-btn ${voted ? 'voted' : ''}" data-id="${post._id}" title="${voted ? 'Already upvoted' : 'Upvote'}" aria-label="Upvote" ${voted ? 'disabled' : ''}>
        <i class="ph ph-arrow-fat-up"></i>
      </button>
      <span class="upvote-count">${post.upvotes}</span>
    </div>
    <div class="post-body">
      ${post.mood ? `<span class="post-mood">${post.mood}</span>` : ''}
      <p class="post-message">${escapeHtml(post.message)}</p>
      <div class="post-meta">
        <span class="badge ${meta.cls}">${meta.icon} ${post.category}</span>
        ${isHotPost(post) ? '<span class="hot-badge">🔥 Hot</span>' : ''}
        <span class="post-time"><i class="ph ph-clock"></i> ${timeAgo(post.createdAt)}</span>
      </div>
    </div>
  `;
  return card;
}

function renderPosts() {
  const posts = getFilteredPosts();
  postsContainer.innerHTML = '';

  // Update hero stats
  const totalUpvotes = allPosts.reduce((s, p) => s + p.upvotes, 0);
  statPosts.textContent = allPosts.length;
  statUpvotes.textContent = totalUpvotes;

  // Filtered count
  postCountEl.textContent = `${posts.length} post${posts.length !== 1 ? 's' : ''}`;

  if (posts.length === 0) {
    emptyState.hidden = false;
    if (searchQuery || activeCategory !== 'All') {
      // Show "no results" instead of "no posts"
      postsContainer.innerHTML = `
        <div class="no-results">
          <i class="ph ph-magnifying-glass"></i>
          <p>No posts match your filters.</p>
        </div>`;
      emptyState.hidden = true;
    }
  } else {
    emptyState.hidden = true;
    posts.forEach((p, i) => postsContainer.appendChild(renderPost(p, i)));
  }
}

// ── Load Posts ──────────────────────────────────────────────────────

async function loadPosts(showSpinner = true) {
  if (showSpinner) {
    loadingState.hidden = false;
    emptyState.hidden   = true;
  }

  try {
    const res   = await fetch(API);
    const posts = await res.json();
    allPosts = posts;
    renderPosts();
  } catch (err) {
    if (showSpinner) showToast('Failed to load posts');
    console.error(err);
  } finally {
    loadingState.hidden = true;
  }
}

// ── Auto-poll (real-time feel) ─────────────────────────────────────

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => loadPosts(false), POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
}

// ── Submit a new post ──────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message  = messageInput.value.trim();
  const category = categorySelect.value;
  if (!message) return;

  submitBtn.disabled = true;

  try {
    const body = { message, category };
    if (selectedMood) body.mood = selectedMood;

    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Failed to create post');

    const newPost = await res.json();

    // Optimistic UI: add to local state immediately
    allPosts.unshift(newPost);
    renderPosts();

    messageInput.value     = '';
    charUsed.textContent   = '0';
    selectedMood = '';
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
    showToast('Posted anonymously ✅');
  } catch (err) {
    showToast('Something went wrong 😕');
    console.error(err);
  } finally {
    submitBtn.disabled = false;
  }
});

// ── Upvote (event delegation, one-vote-per-post) ──────────────────

postsContainer.addEventListener('click', async (e) => {
  const btn = e.target.closest('.upvote-btn');
  if (!btn) return;

  const id = btn.dataset.id;

  // Already upvoted? Block it.
  if (hasUpvoted(id)) {
    showToast('You already upvoted this 👍');
    return;
  }

  btn.disabled = true;

  try {
    const res = await fetch(`${API}/${id}/upvote`, { method: 'PUT' });
    if (!res.ok) throw new Error();

    const updated = await res.json();

    // Mark as upvoted in localStorage
    markUpvoted(id);

    // Update local state
    const idx = allPosts.findIndex(p => p._id === id);
    if (idx !== -1) allPosts[idx] = updated;

    // Update UI in-place
    btn.classList.add('voted');
    btn.disabled = true;
    btn.title = 'Already upvoted';

    const countEl = btn.nextElementSibling;
    countEl.textContent = updated.upvotes;
    countEl.classList.add('bump');
    setTimeout(() => countEl.classList.remove('bump'), 400);

    // Update stats
    const totalUpvotes = allPosts.reduce((s, p) => s + p.upvotes, 0);
    statUpvotes.textContent = totalUpvotes;
  } catch {
    showToast('Could not upvote');
    btn.disabled = false;
  }
});

// ── Mood selector ──────────────────────────────────────────────────

moodSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('.mood-btn');
  if (!btn) return;

  const mood = btn.dataset.mood;
  if (selectedMood === mood) {
    selectedMood = '';
    btn.classList.remove('selected');
  } else {
    selectedMood = mood;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }
});

// ── Category tabs ──────────────────────────────────────────────────

categoryTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;

  activeCategory = tab.dataset.cat;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  renderPosts();
});

// ── Sort toggle ────────────────────────────────────────────────────

sortToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;

  activeSort = btn.dataset.sort;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPosts();
});

// ── Search ─────────────────────────────────────────────────────────

let searchDebounce = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = searchInput.value.trim();
    renderPosts();
  }, 250);
});

// ── Character counter ──────────────────────────────────────────────

messageInput.addEventListener('input', () => {
  charUsed.textContent = messageInput.value.length;
});

// ── Theme toggle ───────────────────────────────────────────────────

function getTheme() {
  return localStorage.getItem('moodboard_theme') || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.className = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
  localStorage.setItem('moodboard_theme', theme);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ── Scroll-to-top button ───────────────────────────────────────────

const scrollBtn = document.createElement('button');
scrollBtn.className = 'scroll-top';
scrollBtn.innerHTML = '<i class="ph ph-arrow-up"></i>';
scrollBtn.title = 'Back to top';
scrollBtn.setAttribute('aria-label', 'Scroll to top');
document.body.appendChild(scrollBtn);

scrollBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

window.addEventListener('scroll', () => {
  scrollBtn.classList.toggle('visible', window.scrollY > 400);
}, { passive: true });

// ── Visibility-based polling ───────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    loadPosts(false);
    startPolling();
  }
});

// ── Init ───────────────────────────────────────────────────────────

applyTheme(getTheme());
loadPosts();
startPolling();
