// ============================================================
// DSA Tracker — app.js
// ============================================================

let API_BASE = "http://localhost:5000";
const PROD_API_BASE = "https://dsa-progress-tracker-du91.onrender.com";

let localProblems = []; // global cache for synchronous operations
let backendOnline = false;

async function initAPI() {
  try {
    const res = await fetch(`${API_BASE}/`);
    if (res.ok) {
      console.log("Connected to local backend:", API_BASE);
      backendOnline = true;
      return;
    }
  } catch (e) {
    console.log("Local backend not reachable. Trying production backend:", PROD_API_BASE);
    try {
      const res = await fetch(`${PROD_API_BASE}/`);
      if (res.ok) {
        API_BASE = PROD_API_BASE;
        console.log("Connected to production backend:", API_BASE);
        backendOnline = true;
        return;
      }
    } catch (err) {
      console.warn("All backends offline. Running in offline/localStorage mode.");
    }
  }
  backendOnline = false;
}

async function syncWithBackend() {
  await initAPI();
  
  if (backendOnline) {
    try {
      const res = await fetch(`${API_BASE}/problems`);
      if (res.ok) {
        const backendProblems = await res.json();
        const local = JSON.parse(localStorage.getItem("dsa_problems")) || [];
        
        // If local has more problems, let's sync them to backend!
        if (local.length > backendProblems.length) {
          console.log("Local has more problems than backend. Syncing local to backend...");
          for (const p of local) {
            const exists = backendProblems.some(bp => bp.id === p.id || (bp.name === p.name && bp.topic === p.topic));
            if (!exists) {
              await fetch(`${API_BASE}/log-problem`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(p)
              });
            }
          }
          // Fetch updated list
          const updatedRes = await fetch(`${API_BASE}/problems`);
          if (updatedRes.ok) {
            saveProblems(await updatedRes.json());
          }
        } else {
          saveProblems(backendProblems);
        }
        return;
      }
    } catch (e) {
      console.warn("Failed to fetch problems from backend:", e);
    }
  }
  
  // Fallback to local storage if offline
  saveProblems(JSON.parse(localStorage.getItem("dsa_problems")) || []);
}

// ─── LOCAL STORAGE HELPERS ───────────────────────────────────

function saveProblems(problems) {
  localProblems = problems;
  localStorage.setItem("dsa_problems", JSON.stringify(problems));
}

function loadProblems() {
  return localProblems;
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
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const streak = loadStreak();

  if (streak.lastDate && streak.lastDate !== today && streak.lastDate !== yesterday) {
    // Streak broken!
    streak.count = 0;
    saveStreak(streak);
  }

  setText("streak-val", streak.count);
}

// ─── LEETCODE STATS ──────────────────────────────────────────

async function loadLeetCodeStats(username, isAuto = false) {
  const input = document.getElementById("leetcodeUser");
  if (!username) {
    username = input ? input.value.trim() : "";
  }
  if (!username) {
    if (!isAuto) alert("Please enter a LeetCode username.");
    return;
  }

  if (input && input.value !== username) {
    input.value = username;
  }

  try {
    const res = await fetch(`${API_BASE}/leetcode/${username}`);
    if (!res.ok) {
      const err = await res.json();
      if (!isAuto) alert(err.error || "Failed to load stats.");
      return;
    }

    const data = await res.json();
    
    // Save username on successful fetch
    localStorage.setItem("dsa_leetcode_username", username);

    setText("easy-count",   data.easy   ?? 0);
    setText("medium-count", data.medium ?? 0);
    setText("hard-count",   data.hard   ?? 0);
    setText("lc-total-count", data.solved ?? 0);

    // Readiness based on LeetCode solved count
    const readiness = Math.min(100, Math.floor(((data.solved || 0) / 300) * 100));
    setText("m-ready", `${readiness}%`);
    setText("m-ready-label",
      readiness >= 70 ? "interview ready!" :
      readiness >= 40 ? "good progress" : "keep going");

    // Recount local stats
    refreshLocalMetrics();
    
    const dateEl = document.getElementById("last-date");
    if (dateEl) dateEl.textContent = `Last synced: ${new Date().toLocaleDateString()}`;

    renderAll();

  } catch (err) {
    console.error("LeetCode fetch error:", err);
    if (!isAuto) {
      alert("Could not connect to backend. Is the server running on port 5000?");
    }
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

const TOPIC_RESOURCES = {
  "Arrays": {
    problems: [
      { name: "Two Sum", url: "https://leetcode.com/problems/two-sum/" },
      { name: "Contains Duplicate", url: "https://leetcode.com/problems/contains-duplicate/" },
      { name: "Best Time to Buy and Sell Stock", url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/" }
    ],
    resource: { name: "NeetCode: Array & Hashing", url: "https://www.youtube.com/watch?v=Wd44W0W-U80" }
  },
  "Strings": {
    problems: [
      { name: "Valid Anagram", url: "https://leetcode.com/problems/valid-anagram/" },
      { name: "Group Anagrams", url: "https://leetcode.com/problems/group-anagrams/" },
      { name: "Valid Parentheses", url: "https://leetcode.com/problems/valid-parentheses/" }
    ],
    resource: { name: "NeetCode: Strings", url: "https://www.youtube.com/watch?v=g3WZJBvN48E" }
  },
  "Linked Lists": {
    problems: [
      { name: "Reverse Linked List", url: "https://leetcode.com/problems/reverse-linked-list/" },
      { name: "Merge Two Sorted Lists", url: "https://leetcode.com/problems/merge-two-sorted-lists/" },
      { name: "Linked List Cycle", url: "https://leetcode.com/problems/linked-list-cycle/" }
    ],
    resource: { name: "NeetCode: Linked List Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Stacks & Queues": {
    problems: [
      { name: "Valid Parentheses", url: "https://leetcode.com/problems/valid-parentheses/" },
      { name: "Min Stack", url: "https://leetcode.com/problems/min-stack/" },
      { name: "Implement Queue using Stacks", url: "https://leetcode.com/problems/implement-queue-using-stacks/" }
    ],
    resource: { name: "NeetCode: Stack Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVflZf2X4OAdHnphfGwtZ_hB" }
  },
  "Trees": {
    problems: [
      { name: "Invert Binary Tree", url: "https://leetcode.com/problems/invert-binary-tree/" },
      { name: "Maximum Depth of Binary Tree", url: "https://leetcode.com/problems/maximum-depth-of-binary-tree/" },
      { name: "Validate Binary Search Tree", url: "https://leetcode.com/problems/validate-binary-search-tree/" }
    ],
    resource: { name: "NeetCode: Trees Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVfPjjzf68Z8E2fPL2S5U4vM" }
  },
  "Graphs": {
    problems: [
      { name: "Clone Graph", url: "https://leetcode.com/problems/clone-graph/" },
      { name: "Number of Islands", url: "https://leetcode.com/problems/number-of-islands/" },
      { name: "Course Schedule", url: "https://leetcode.com/problems/course-schedule/" }
    ],
    resource: { name: "NeetCode: Graph Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Dynamic Programming": {
    problems: [
      { name: "Climbing Stairs", url: "https://leetcode.com/problems/climbing-stairs/" },
      { name: "Coin Change", url: "https://leetcode.com/problems/coin-change/" },
      { name: "Longest Common Subsequence", url: "https://leetcode.com/problems/longest-common-subsequence/" }
    ],
    resource: { name: "NeetCode: DP Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Binary Search": {
    problems: [
      { name: "Binary Search", url: "https://leetcode.com/problems/binary-search/" },
      { name: "Search in Rotated Sorted Array", url: "https://leetcode.com/problems/search-in-rotated-sorted-array/" },
      { name: "Find Minimum in Rotated Sorted Array", url: "https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/" }
    ],
    resource: { name: "NeetCode: Binary Search Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Sliding Window": {
    problems: [
      { name: "Best Time to Buy and Sell Stock", url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/" },
      { name: "Longest Substring Without Repeating Characters", url: "https://leetcode.com/problems/longest-substring-without-repeating-characters/" },
      { name: "Longest Repeating Character Replacement", url: "https://leetcode.com/problems/longest-repeating-character-replacement/" }
    ],
    resource: { name: "NeetCode: Sliding Window Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Two Pointers": {
    problems: [
      { name: "Valid Palindrome", url: "https://leetcode.com/problems/valid-palindrome/" },
      { name: "Two Sum II", url: "https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/" },
      { name: "Container With Most Water", url: "https://leetcode.com/problems/container-with-most-water/" }
    ],
    resource: { name: "NeetCode: Two Pointers Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Recursion": {
    problems: [
      { name: "Fibonacci Number", url: "https://leetcode.com/problems/fibonacci-number/" },
      { name: "Merge Two Sorted Lists", url: "https://leetcode.com/problems/merge-two-sorted-lists/" },
      { name: "Power of Two", url: "https://leetcode.com/problems/power-of-two/" }
    ],
    resource: { name: "Recursion Explained", url: "https://www.youtube.com/watch?v=ngCos392W4w" }
  },
  "Backtracking": {
    problems: [
      { name: "Subsets", url: "https://leetcode.com/problems/subsets/" },
      { name: "Combination Sum", url: "https://leetcode.com/problems/combination-sum/" },
      { name: "Word Search", url: "https://leetcode.com/problems/word-search/" }
    ],
    resource: { name: "NeetCode: Backtracking Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Heaps": {
    problems: [
      { name: "Kth Largest Element in an Array", url: "https://leetcode.com/problems/kth-largest-element-in-an-array/" },
      { name: "Top K Frequent Elements", url: "https://leetcode.com/problems/top-k-frequent-elements/" },
      { name: "Find Median from Data Stream", url: "https://leetcode.com/problems/find-median-from-data-stream/" }
    ],
    resource: { name: "NeetCode: Heap Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Tries": {
    problems: [
      { name: "Implement Trie (Prefix Tree)", url: "https://leetcode.com/problems/implement-trie-prefix-tree/" },
      { name: "Design Add and Search Words", url: "https://leetcode.com/problems/design-add-and-search-words-data-structure/" },
      { name: "Word Search II", url: "https://leetcode.com/problems/word-search-ii/" }
    ],
    resource: { name: "NeetCode: Trie Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Greedy": {
    problems: [
      { name: "Maximum Subarray", url: "https://leetcode.com/problems/maximum-subarray/" },
      { name: "Jump Game", url: "https://leetcode.com/problems/jump-game/" },
      { name: "Gas Station", url: "https://leetcode.com/problems/gas-station/" }
    ],
    resource: { name: "NeetCode: Greedy Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Bit Manipulation": {
    problems: [
      { name: "Number of 1 Bits", url: "https://leetcode.com/problems/number-of-1-bits/" },
      { name: "Counting Bits", url: "https://leetcode.com/problems/counting-bits/" },
      { name: "Reverse Bits", url: "https://leetcode.com/problems/reverse-bits/" }
    ],
    resource: { name: "NeetCode: Bit Manipulation Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  },
  "Math": {
    problems: [
      { name: "Happy Number", url: "https://leetcode.com/problems/happy-number/" },
      { name: "Plus One", url: "https://leetcode.com/problems/plus-one/" },
      { name: "Pow(x, n)", url: "https://leetcode.com/problems/powx-n/" }
    ],
    resource: { name: "NeetCode: Math & Geometry Playlist", url: "https://www.youtube.com/playlist?list=PLot-Xpkr5xVf5d-jV3G267K6T6S5o5fQz" }
  }
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

        const resInfo = TOPIC_RESOURCES[p.topic];
        let resourcesHtml = "";
        if (resInfo) {
          const probLinks = resInfo.problems.map(pr => 
            `<a href="${pr.url}" target="_blank" class="res-link">${escHtml(pr.name)}</a>`
          ).join("");
          
          resourcesHtml = `
            <div class="next-resources">
              <div class="res-title">Suggested Problems:</div>
              <div class="res-links">${probLinks}</div>
              <div class="res-title" style="margin-top: 6px;">Video Tutorial:</div>
              <a href="${resInfo.resource.url}" target="_blank" class="res-video">&#9658; ${escHtml(resInfo.resource.name)}</a>
            </div>
          `;
        }

        return `
          <div class="next-card">
            <div class="next-num">${i + 1}</div>
            <div style="flex: 1;">
              <div class="next-title">${escHtml(p.topic)}</div>
              <div class="next-reason">${reason}</div>
              ${resourcesHtml}
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

async function logProblem() {
  const name       = getVal("prob-name");
  const topic      = getVal("prob-topic");
  const difficulty = getVal("prob-difficulty");
  const confidence = getVal("prob-confidence");
  const notes      = getVal("prob-notes");

  if (!name || !topic || !difficulty || !confidence) {
    alert("Please fill in all required fields.");
    return;
  }

  const newProblem = {
    id:         Date.now(),
    name,
    topic,
    difficulty,
    confidence: Number(confidence),
    notes,
    date:       new Date().toISOString()
  };

  if (backendOnline) {
    try {
      const res = await fetch(`${API_BASE}/log-problem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProblem)
      });
      if (res.ok) {
        const data = await res.json();
        const problems = loadProblems();
        problems.push(data.problem || newProblem);
        saveProblems(problems);
      } else {
        throw new Error("Backend log failed");
      }
    } catch (e) {
      console.warn("Backend log failed, saving locally:", e);
      const problems = loadProblems();
      problems.push(newProblem);
      saveProblems(problems);
    }
  } else {
    const problems = loadProblems();
    problems.push(newProblem);
    saveProblems(problems);
  }

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

async function deleteProblem(id) {
  if (backendOnline) {
    try {
      const res = await fetch(`${API_BASE}/problems/${id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Backend delete failed");
    } catch (e) {
      console.warn("Backend delete failed, removing locally:", e);
    }
  }
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
    ? `<div class="prob-note">${formatNotes(p.notes)}</div>`
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

function formatNotes(notes) {
  if (!notes) return "";
  
  // 1. Escape HTML for security
  let html = escHtml(notes);

  // 2. Parse multi-line code blocks (marked by ```)
  const codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre class="code-block"><code>${code.trim()}</code></pre>`);
    return placeholder;
  });

  // 3. Parse inline code (marked by `)
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 4. Parse bold text (marked by **)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 5. Parse bullet lists
  const lines = html.split("\n");
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const itemText = line.substring(2);
      let itemHtml = `<li>${itemText}</li>`;
      if (!inList) {
        inList = true;
        itemHtml = '<ul class="notes-list">' + itemHtml;
      }
      lines[i] = itemHtml;
    } else {
      if (inList) {
        inList = false;
        lines[i] = '</ul>' + lines[i];
      }
    }
  }
  if (inList) {
    lines[lines.length - 1] += '</ul>';
  }
  html = lines.join("\n");

  // 6. Convert newlines to <br> outside of pre blocks
  html = html.replace(/\n/g, "<br>");

  // 7. Restore multi-line code blocks
  codeBlocks.forEach((block, index) => {
    html = html.replace(`__CODE_BLOCK_${index}__`, block);
  });

  return html;
}

// ─── TOPIC AUTO DETECTION ─────────────────────────────────────

const POPULAR_PROBLEMS = {
  "two sum": "Arrays",
  "3sum": "Two Pointers",
  "three sum": "Two Pointers",
  "container with most water": "Two Pointers",
  "group anagrams": "Arrays",
  "valid anagram": "Strings",
  "valid palindrome": "Two Pointers",
  "valid parentheses": "Stacks & Queues",
  "climbing stairs": "Dynamic Programming",
  "coin change": "Dynamic Programming",
  "longest common subsequence": "Dynamic Programming",
  "longest consecutive sequence": "Arrays",
  "house robber": "Dynamic Programming",
  "house robber ii": "Dynamic Programming",
  "merge intervals": "Arrays",
  "insert interval": "Arrays",
  "non-overlapping intervals": "Arrays",
  "meeting rooms": "Arrays",
  "meeting rooms ii": "Arrays",
  "best time to buy and sell stock": "Arrays",
  "best time to buy and sell stock ii": "Arrays",
  "reverse linked list": "Linked Lists",
  "merge two sorted lists": "Linked Lists",
  "merge k sorted lists": "Linked Lists",
  "remove nth node from end of list": "Linked Lists",
  "reorder list": "Linked Lists",
  "linked list cycle": "Linked Lists",
  "lru cache": "Linked Lists",
  "invert binary tree": "Trees",
  "maximum depth of binary tree": "Trees",
  "same tree": "Trees",
  "subtree of another tree": "Trees",
  "binary tree level order traversal": "Trees",
  "lowest common ancestor of a binary search tree": "Trees",
  "lowest common ancestor of a binary tree": "Trees",
  "construct binary tree from preorder and inorder traversal": "Trees",
  "binary tree maximum path sum": "Trees",
  "validate binary search tree": "Trees",
  "kth smallest element in a bst": "Trees",
  "clone graph": "Graphs",
  "course schedule": "Graphs",
  "number of islands": "Graphs",
  "pacific atlantic water flow": "Graphs",
  "number of connected components in an undirected graph": "Graphs",
  "graph valid tree": "Graphs",
  "longest substring without repeating characters": "Sliding Window",
  "longest repeating character replacement": "Sliding Window",
  "minimum window substring": "Sliding Window",
  "kth largest element in an array": "Heaps",
  "top k frequent elements": "Heaps",
  "find median from data stream": "Heaps",
  "word search": "Backtracking",
  "implement trie (prefix tree)": "Tries",
  "search in rotated sorted array": "Binary Search",
  "find minimum in rotated sorted array": "Binary Search",
  "word search ii": "Tries"
};

function detectTopic() {
  const nameEl = document.getElementById("prob-name");
  const statusEl = document.getElementById("detect-status");
  const topicSelect = document.getElementById("prob-topic");

  if (!nameEl || !statusEl || !topicSelect) return;

  const rawName = nameEl.value.trim();
  if (!rawName) {
    statusEl.textContent = "Please enter a problem name first.";
    statusEl.className = "detect-status fail";
    return;
  }

  const name = rawName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ");

  // 1. Direct Lookup
  let detectedTopic = POPULAR_PROBLEMS[name];

  // 2. Keyword rules if direct lookup fails
  if (!detectedTopic) {
    const rules = [
      { keys: ["trie", "prefix tree"], topic: "Tries" },
      { keys: ["binary search tree", "bst", "lowest common ancestor", "preorder", "inorder", "postorder", "subtree"], topic: "Trees" },
      { keys: ["binary tree", "tree", "depth of", "height of", "path sum"], topic: "Trees" },
      { keys: ["graph", "island", "course schedule", "dfs", "bfs", "dijkstra", "shortest path", "network delay"], topic: "Graphs" },
      { keys: ["linked list", "list node", "cycle", "reverse list", "middle of list", "merge lists"], topic: "Linked Lists" },
      { keys: ["stack", "queue", "parentheses", "histogram", "sliding window maximum"], topic: "Stacks & Queues" },
      { keys: ["dynamic programming", "dp", "climbing stairs", "coin change", "knapsack", "subsequence", "robber", "lcs"], topic: "Dynamic Programming" },
      { keys: ["greedy", "jump game", "gas station", "interval"], topic: "Greedy" },
      { keys: ["heap", "priority queue", "kth largest", "top k", "median"], topic: "Heaps" },
      { keys: ["binary search", "search in rotated", "rotated sorted", "find minimum in"], topic: "Binary Search" },
      { keys: ["sliding window", "longest substring", "character replacement", "min window"], topic: "Sliding Window" },
      { keys: ["two pointer", "two sum", "3sum", "three sum", "pointers", "palindrome", "most water"], topic: "Two Pointers" },
      { keys: ["backtrack", "permutation", "combination", "subset", "n-queens"], topic: "Backtracking" },
      { keys: ["bit", "binary operations", "xor", "number of 1 bits", "reverse bits"], topic: "Bit Manipulation" },
      { keys: ["string", "anagram", "palindrome", "char"], topic: "Strings" },
      { keys: ["array", "matrix", "grid", "row", "col", "element", "sum", "duplicate", "product"], topic: "Arrays" },
      { keys: ["recurse", "recursion", "memoization"], topic: "Recursion" },
      { keys: ["math", "gcd", "lcm", "number", "prime", "digit", "calculator"], topic: "Math" }
    ];

    for (const rule of rules) {
      if (rule.keys.some(key => name.includes(key))) {
        detectedTopic = rule.topic;
        break;
      }
    }
  }

  // 3. Update dropdown and status
  if (detectedTopic) {
    let found = false;
    for (let i = 0; i < topicSelect.options.length; i++) {
      if (topicSelect.options[i].value === detectedTopic || topicSelect.options[i].text === detectedTopic) {
        topicSelect.selectedIndex = i;
        found = true;
        break;
      }
    }

    if (found) {
      statusEl.textContent = `✓ Detected Topic: "${detectedTopic}"`;
      statusEl.className = "detect-status success";
    } else {
      statusEl.textContent = `Could not select detected topic: "${detectedTopic}"`;
      statusEl.className = "detect-status fail";
    }
  } else {
    statusEl.textContent = `Could not auto-detect topic. Please select manually.`;
    statusEl.className = "detect-status fail";
  }
}

// ─── INIT ────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  initStreak();
  showTab("dashboard");

  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.addEventListener("input", renderLoggedProblems);

  await syncWithBackend();
  refreshLocalMetrics();
  renderAll();

  // Load LeetCode username and auto-sync
  const savedUsername = localStorage.getItem("dsa_leetcode_username") || "khwlsarthak";
  const input = document.getElementById("leetcodeUser");
  if (input) {
    input.value = savedUsername;
  }
  if (savedUsername && backendOnline) {
    loadLeetCodeStats(savedUsername, true);
  }
});