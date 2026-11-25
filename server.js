const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ESY EARN BD Backend is running!"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    databaseConfigured: Boolean(supabase)
  });
});

app.get("/api/jobs", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      message: "Database is not configured yet."
    });
  }

  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("id,title,description,job_type,reward")
      .eq("is_active", true);

    if (error) throw error;

    res.json({ success: true, jobs: data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to load jobs."
    });
  }
});

app.listen(PORT, () => {
  console.log(`ESY EARN BD server running on port ${PORT}`);
});
