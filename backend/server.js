const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

app.get("/", (req, res) => {
  res.send("Backend Running");
});

app.get("/leetcode/:username", async (req, res) => {
  const username = req.params.username;

  res.json({
    username: username,
    solved: 123,
    easy: 50,
    medium: 60,
    hard: 13
  });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});