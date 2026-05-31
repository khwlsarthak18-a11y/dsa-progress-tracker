const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());

app.get("/", (req, res) => {
  res.send("Backend Running");
});

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
      {
        query,
        variables: { username }
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const stats =
      response.data.data.matchedUser.submitStats.acSubmissionNum;
     
    const ranking =
  response.data.data.matchedUser.profile.ranking;
    const easy = stats.find(x => x.difficulty === "Easy")?.count || 0;
    const medium = stats.find(x => x.difficulty === "Medium")?.count || 0;
    const hard = stats.find(x => x.difficulty === "Hard")?.count || 0;
    const solved = easy + medium + hard;
    let level = "Beginner";

if (solved >= 300) level = "Advanced";
else if (solved >= 100) level = "Intermediate";
let nextTopic = "Arrays";

if (solved < 50) nextTopic = "Sliding Window";
else if (solved < 100) nextTopic = "Binary Search";
else if (solved < 200) nextTopic = "Trees";
else nextTopic = "Dynamic Programming";

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
    console.log(err.response?.data || err.message);;

    res.status(500).json({
      error: err.message
    });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});