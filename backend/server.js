const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, "problems.json");

function loadProblemsFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(data) || [];
    }
  } catch (err) {
    console.error("Error reading data file:", err);
  }
  return [];
}

function saveProblemsToFile(problems) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(problems, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing data file:", err);
  }
}

// Persisted store
let loggedProblems = loadProblemsFromFile();

app.get("/", (req, res) => {
  res.send("Backend Running");
});

// ─── LEETCODE STATS ───────────────────────────────────────────
app.get("/leetcode/:username", async (req, res) => {
  const username = req.params.username;

  const query = `
    query userProfile($username: String!) {
      matchedUser(username: $username) {
        profile {
          ranking
        }
        submitStats {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      "https://leetcode.com/graphql",
      { query, variables: { username } },
      { headers: { "Content-Type": "application/json" } }
    );

    const user = response.data.data.matchedUser;

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const stats = user.submitStats.acSubmissionNum;
    const ranking = user.profile.ranking;

    const easy   = stats.find(x => x.difficulty === "Easy")?.count   || 0;
    const medium = stats.find(x => x.difficulty === "Medium")?.count || 0;
    const hard   = stats.find(x => x.difficulty === "Hard")?.count   || 0;
    const solved = easy + medium + hard;

    let level = "Beginner";
    if (solved >= 300) level = "Advanced";
    else if (solved >= 100) level = "Intermediate";

    let nextTopic = "Arrays";
    if (solved < 50)       nextTopic = "Sliding Window";
    else if (solved < 100) nextTopic = "Binary Search";
    else if (solved < 200) nextTopic = "Trees";
    else                   nextTopic = "Dynamic Programming";

    res.json({
      username,
      solved,
      easy,
      medium,
      hard,
      ranking,
      level,
      nextTopic,
      roadmap: [
        "Arrays",
        "Hashing",
        "Two Pointers",
        "Sliding Window",
        "Binary Search",
        "Trees",
        "Graphs",
        "Dynamic Programming"
      ]
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── LOG PROBLEM ──────────────────────────────────────────────
app.post("/log-problem", (req, res) => {
  const { name, topic, difficulty, confidence, notes } = req.body;

  if (!name || !topic || !difficulty || !confidence) {
    return res.status(400).json({ error: "Missing required fields: name, topic, difficulty, confidence" });
  }

  const problem = {
    id: Date.now(),
    name,
    topic,
    difficulty,
    confidence: Number(confidence),
    notes: notes || "",
    date: new Date().toISOString()
  };

  loggedProblems.push(problem);
  saveProblemsToFile(loggedProblems);

  res.status(201).json({ success: true, problem });
});

// ─── GET ALL LOGGED PROBLEMS ──────────────────────────────────
app.get("/problems", (req, res) => {
  res.json(loggedProblems);
});

// ─── DELETE A PROBLEM ─────────────────────────────────────────
app.delete("/problems/:id", (req, res) => {
  const id = Number(req.params.id);
  const before = loggedProblems.length;
  loggedProblems = loggedProblems.filter(p => p.id !== id);

  if (loggedProblems.length === before) {
    return res.status(404).json({ error: "Problem not found" });
  }

  saveProblemsToFile(loggedProblems);

  res.json({ success: true });
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});