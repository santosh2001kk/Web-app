const express = require("express");
const multer  = require("multer");
const path    = require("path");
require("dotenv").config();

const { detectCircuitBreakers } = require("./gemini");

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "../web")));

app.post("/api/detect", upload.single("image"), async (req, res) => {
  try {
    const mode = req.query.mode || "standard";

    let base64Image;
    if (req.file) {
      base64Image = req.file.buffer.toString("base64");
    } else if (req.body?.image) {
      base64Image = req.body.image;
    } else {
      return res.status(400).json({ error: "No image provided" });
    }

    const workZone    = req.body?.workZone    || null;
    const safetyBuffer = req.body?.safetyBuffer || null;
    const result = await detectCircuitBreakers(base64Image, workZone, safetyBuffer);
    res.json(result);
  } catch (err) {
    console.error("[detect]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => console.log(`Panel detector running on http://localhost:${PORT}`));
