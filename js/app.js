// ============================================================
// DSA Tracker — app.js
// ============================================================

const API_BASE = "https://dsa-progress-tracker-du91.onrender.com";

// ─── LOCAL STORAGE HELPERS ───────────────────────────────────

function saveProblems(problems) {
  localStorage.setItem("dsa_problems", JSON.stringify(problems));
}

function loadProblems() {
  try { return JSON.parse(localStorage.getItem("dsa_problems")) || []; }
  catch { return []; }
}

function saveTheme(isDark) {
  localStorage.setItem("dsa_theme", isDark ? "dark" : "light");
}

function loadTheme() {
  return localStorage.getItem("dsa_theme") || "light";
}

function saveStreak(data) {
  localStorage.setItem("dsa_streak", JSON.stringify(data));
}

function loadStreak() {
  try { return JSON.parse(localStorage.getItem("dsa_streak")) || { count: 0, lastDate: null }; }
  catch { return { count: 0, lastDate: null }; }
}

// ─── THEME ───────────────────────────────────────────────────
// CSS uses [data-theme="dark"] on <html>

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  saveTheme(!isDark);
}

function applyTheme() {
  const theme = loadTheme();
  document.documentElement.setAttribute("data-theme", theme);
}

// ─── TAB SWITCHING ───────────────────────────────────────────

function showTab(tabId) {
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));

  const tab = document.querySelector(`#tab-${tabId}`);
  const btn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
  if (tab) tab.classList.add("active");
  if (btn) btn.classList.add("active");

  if (tabId === "topics")  renderTopics();
  if (tabId === "next")    renderNextSteps();
  if (tabId === "log")     renderLoggedProblems();
}

// ─── STREAK ──────────────────────────────────────────────────

function updateStreak() {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const streak = loadStreak();

  if (streak.lastDate === today) {
    // already counted today
  } else if (streak.lastDate === yesterday) {
    streak.count += 1;
    streak.lastDate = today;
  } else {
    streak.count = 1;
    streak.lastDate = today;
  }

  saveStreak(streak);
  setText("streak-val", streak.count);
}

function initStreak() {
  setText("streak-val", loadStreak().count);
}

// ─── LEETCODE STATS ──────────────────────────────────────────

async function loadLeetCodeStats() {
  const input = document.getElementById("leetcodeUser");
  const username = input ? input.value.trim() : "";
  if (!username) { alert("Please enter a LeetCode username."); return; }

  try {
    const res = await fetch(`${API_BASE}/leetcode/${username}`);
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to load stats.");
      return;
    }

    const data = await res.json();
    

    setText("easy-count",   data.easy   ?? 0);
    setText("medium-count", data.medium ?? 0);
    setText("hard-count",   data.hard   ?? 0);

    // Readiness based on LeetCode solved count
    const readiness = Math.min(100, Math.floor(((data.solved || 0) / 300) * 100));
    setText("m-ready", `${readiness}%`);
    setText("m-ready-label",
      readiness >= 70 ? "interview ready!" :
      readiness >= 40 ? "good progress" : "keep going");

    // Recount local stats
    refreshLocalMetrics();
    setText("m-solved", data.solved || 0);
    const dateEl = document.getElementById("last-date");
    if (dateEl) dateEl.textContent = `Last synced: ${new Date().toLocaleDateString()}`;

    renderAll();

  } catch (err) {
    console.error("LeetCode fetch error:", err);
    alert("Could not connect to backend. Is the server running on port 5000?");
  }
}

// ─── LOCAL METRIC REFRESH ────────────────────────────────────

function refreshLocalMetrics() {
  const problems = loadProblems();
  const uniqueTopics = new Set(problems.map(p => p.topic)).size;
  const weakCount = problems.filter(p => p.confidence <= 2).length;
  setText("m-solved", problems.length);
  setText("m-topics", uniqueTopics);
  setText("m-weak",   weakCount);
}

// ─── RENDER ALL ──────────────────────────────────────────────

function renderAll() {
  renderTopicBars();
  renderRecentProblems();
  renderTopics();
  renderNextSteps();
}

// ─── TOPICS ──────────────────────────────────────────────────

const ALL_TOPICS = [
  "Arrays", "Strings", "Linked Lists", "Stacks & Queues",
  "Trees", "Graphs", "Dynamic Programming", "Binary Search",
  "Sliding Window", "Two Pointers", "Recursion", "Backtracking",
  "Heaps", "Tries", "Greedy", "Bit Manipulation", "Math"
];

const TOPIC_WEIGHTS = {
  "Arrays": 5, "Strings": 5, "Dynamic Programming": 5, "Trees": 5, "Graphs": 4,
  "Binary Search": 4, "Sliding Window": 4, "Two Pointers": 4, "Linked Lists": 3,
  "Stacks & Queues": 3, "Recursion": 3, "Backtracking": 3, "Heaps": 3,
  "Greedy": 2, "Tries": 2, "Bit Manipulation": 2, "Math": 2
};

function buildTopicMap(problems) {
  const map = {};
  problems.forEach(p => {
    if (!map[p.topic]) map[p.topic] = { count: 0, confSum: 0 };
    map[p.topic].count  += 1;
    map[p.topic].confSum += Number(p.confidence) || 0;
  });
  return map;
}

// ─── TOPIC BARS (Dashboard) ──────────────────────────────────

function renderTopicBars() {
  const container = document.getElementById("topic-bars");
  if (!container) return;

  const problems = loadProblems();
  const map = buildTopicMap(problems);

  if (!Object.keys(map).length) {
    container.innerHTML = `<p class="empty">No problems logged yet.</p>`;
    return;
  }

  container.innerHTML = Object.entries(map).map(([topic, d]) => {
    const avg  = d.confSum / d.count;
    const pct  = Math.round((avg / 5) * 100);
    const color = pct >= 70 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--danger)";
    const badge = pct >= 70 ? "b-strong" : pct >= 40 ? "b-ok" : "b-weak";
    const label = pct >= 70 ? "strong" : pct >= 40 ? "ok" : "weak";
    return `
      <div class="topic-row">
        <span class="topic-name">${escHtml(topic)}</span>
        <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>
        <span class="pct">${pct}%</span>
        <span class="badge ${badge}">${label}</span>
      </div>`;
  }).join("");
}

// ─── RECENT PROBLEMS (Dashboard) ─────────────────────────────

function renderRecentProblems() {
  const container = document.getElementById("recent-probs");
  if (!container) return;

  const recent = [...loadProblems()].reverse().slice(0, 5);

  if (!recent.length) {
    container.innerHTML = `<p class="empty">No problems logged yet.</p>`;
    return;
  }

  container.innerHTML = recent.map(p => probRowHTML(p)).join("");
}

// ─── TOPICS TAB ──────────────────────────────────────────────

function renderTopics() {
  const container = document.getElementById("all-topics");
  if (!container) return;

  const map = buildTopicMap(loadProblems());

  container.innerHTML = ALL_TOPICS.map(topic => {
    const d    = map[topic] || { count: 0, confSum: 0 };
    const avg  = d.count > 0 ? d.confSum / d.count : 0;
    const w    = TOPIC_WEIGHTS[topic] || 1;
    const stars = "★".repeat(w) + "☆".repeat(5 - w);

    let badgeClass, statusLabel;
    if (d.count === 0)    { badgeClass = "b-new";    statusLabel = "not started"; }
    else if (avg >= 4)    { badgeClass = "b-strong"; statusLabel = "strong"; }
    else if (avg >= 2.5)  { badgeClass = "b-ok";     statusLabel = "in progress"; }
    else                  { badgeClass = "b-weak";   statusLabel = "weak"; }

    return `
      <div class="topic-row">
        <span class="topic-name">${escHtml(topic)}</span>
        <span class="stars" title="Interview importance">${stars}</span>
        <div style="flex:1;"></div>
        <span style="font-size:12px;color:var(--text3);margin-right:12px;">${d.count} solved</span>
        <span style="font-size:12px;color:var(--text3);margin-right:12px;">avg ${d.count > 0 ? (avg).toFixed(1) : "—"}</span>
        <span class="badge ${badgeClass}">${statusLabel}</span>
      </div>`;
  }).join("");
}

// ─── NEXT STEPS TAB ──────────────────────────────────────────

function renderNextSteps() {
  const map = buildTopicMap(loadProblems());

  const priorities = ALL_TOPICS.map(topic => {
    const d   = map[topic] || { count: 0, confSum: 0 };
    const avg = d.count > 0 ? d.confSum / d.count : 0;
    const w   = TOPIC_WEIGHTS[topic] || 1;
    return { topic, count: d.count, avg, weight: w, urgency: w * (5 - avg) };
  }).sort((a, b) => b.urgency - a.urgency);

  // Top 3 cards
  const nextEl = document.getElementById("next-topics");
  if (nextEl) {
    if (!priorities.length) {
      nextEl.innerHTML = `<p class="empty">Log some problems to get recommendations.</p>`;
    } else {
      nextEl.innerHTML = priorities.slice(0, 3).map((p, i) => {
        const reason = p.count === 0
          ? `Not started — high interview importance (${"★".repeat(p.weight)})`
          : `${p.count} solved, avg confidence ${p.avg.toFixed(1)}/5`;
        return `
          <div class="next-card">
            <div class="next-num">${i + 1}</div>
            <div>
              <div class="next-title">${escHtml(p.topic)}</div>
              <div class="next-reason">${reason}</div>
            </div>
          </div>`;
      }).join("");
    }
  }

  // Priority table
  const tableEl = document.getElementById("priority-table");
  if (tableEl) {
    tableEl.innerHTML = `
      <table class="priority-table">
        <thead>
          <tr>
            <th>Topic</th>
            <th>Importance</th>
            <th>Solved</th>
            <th>Avg Conf</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          ${priorities.map(p => {
            const priClass = p.urgency > 20 ? "pri-high" : p.urgency > 10 ? "pri-med" : "pri-low";
            const priLabel = p.urgency > 20 ? "High" : p.urgency > 10 ? "Medium" : "Low";
            return `<tr>
              <td>${escHtml(p.topic)}</td>
              <td><span class="stars">${"★".repeat(p.weight)}</span></td>
              <td>${p.count}</td>
              <td>${p.count > 0 ? p.avg.toFixed(1) : "—"}</td>
              <td class="${priClass}">${priLabel}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
  }
}

// ─── LOG PROBLEM ─────────────────────────────────────────────

function logProblem() {
  const name       = getVal("prob-name");
  const topic      = getVal("prob-topic");
  const difficulty = getVal("prob-difficulty");
  const confidence = getVal("prob-confidence");
  const notes      = getVal("prob-notes");

  if (!name || !topic || !difficulty || !confidence) {
    alert("Please fill in all required fields.");
    return;
  }

  const problems = loadProblems();
  problems.push({
    id:         Date.now(),
    name,
    topic,
    difficulty,
    confidence: Number(confidence),
    notes,
    date:       new Date().toISOString()
  });

  saveProblems(problems);
  updateStreak();
  refreshLocalMetrics();
  renderAll();
  renderLoggedProblems();

  // Clear form
  setVal("prob-name", "");
  setVal("prob-notes", "");
  document.getElementById("prob-topic").selectedIndex      = 0;
  document.getElementById("prob-difficulty").selectedIndex = 0;
  document.getElementById("prob-confidence").selectedIndex = 0;

  // Show success message
  const msg = document.getElementById("log-success");
  if (msg) {
    msg.textContent = `✓ "${name}" logged!`;
    setTimeout(() => { msg.textContent = ""; }, 3000);
  }
}

// ─── LOGGED PROBLEMS LIST ────────────────────────────────────

function renderLoggedProblems() {
  const container = document.getElementById("logged-problems");
  if (!container) return;

  const search = (document.getElementById("search-input")?.value || "").toLowerCase();
  const problems = loadProblems()
    .filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.topic.toLowerCase().includes(search)
    )
    .reverse();

  if (!problems.length) {
    container.innerHTML = `<p class="empty">${search ? "No matches found." : "No problems logged yet."}</p>`;
    return;
  }

  container.innerHTML = problems.map(p => probRowHTML(p, true)).join("");
}

function deleteProblem(id) {
  const problems = loadProblems().filter(p => p.id !== id);
  saveProblems(problems);
  refreshLocalMetrics();
  renderAll();
  renderLoggedProblems();
}

// ─── SHARED PROBLEM ROW HTML ─────────────────────────────────

function probRowHTML(p, showDelete = false) {
  const diffClass = `diff-${(p.difficulty || "").toLowerCase()}`;
  const stars = "★".repeat(p.confidence) + "☆".repeat(5 - p.confidence);
  const date  = new Date(p.date).toLocaleDateString();
  const del   = showDelete
    ? `<button class="del-btn" onclick="deleteProblem(${p.id})" title="Delete">&#10005;</button>`
    : "";
  const note  = p.notes
    ? `<div class="prob-note">${escHtml(p.notes)}</div>`
    : "";
  return `
    <div class="prob-row">
      <div class="prob-info">
        <div class="prob-name">${escHtml(p.name)}</div>
        <div class="prob-meta">
          <span class="${diffClass}">${escHtml(p.difficulty)}</span>
          &nbsp;·&nbsp;${escHtml(p.topic)}
          &nbsp;·&nbsp;${date}
        </div>
        ${note}
      </div>
      <span class="stars">${stars}</span>
      ${del}
    </div>`;
}

// ─── EXPORT PDF ──────────────────────────────────────────────

function exportPDF() {
  const problems = loadProblems();
  if (!problems.length) { alert("No problems logged to export."); return; }

  const rows = problems.map(p => `
    <tr>
      <td>${escHtml(p.name)}</td>
      <td>${escHtml(p.topic)}</td>
      <td>${escHtml(p.difficulty)}</td>
      <td>${"★".repeat(p.confidence)}</td>
      <td>${new Date(p.date).toLocaleDateString()}</td>
      <td>${escHtml(p.notes || "")}</td>
    </tr>`).join("");

  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>DSA Tracker Export</title>
    <style>
      body { font-family: sans-serif; padding: 24px; font-size: 13px; }
      h1 { font-size: 18px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 7px 10px; text-align: left; }
      th { background: #f5f5f5; font-weight: 600; }
    </style></head>
    <body>
      <h1>DSA Progress Tracker &mdash; ${new Date().toLocaleDateString()}</h1>
      <table>
        <thead><tr><th>Problem</th><th>Topic</th><th>Difficulty</th><th>Confidence</th><th>Date</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`);
  win.document.close();
  win.print();
}

// ─── UTILITIES ───────────────────────────────────────────────

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── INIT ────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  initStreak();
  showTab("dashboard");

  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.addEventListener("input", renderLoggedProblems);

  refreshLocalMetrics();
  renderAll();
});