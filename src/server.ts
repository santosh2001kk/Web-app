import express from "express";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
import { detectCircuitBreakers } from "./gemini";

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
});

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "../web")));

// POST /api/detect — accepts multipart image or base64 JSON body
app.post("/api/detect", upload.single("image"), async (req, res) => {
  try {
    const mode = (req.query.mode as "fast" | "standard" | "expert") || "standard";

    let base64Image: string;

    if (req.file) {
      // Multipart upload
      base64Image = req.file.buffer.toString("base64");
    } else if (req.body?.image) {
      // JSON base64
      base64Image = req.body.image;
    } else {
      res.status(400).json({ error: "No image provided" });
      return;
    }

    const result = await detectCircuitBreakers(base64Image, mode);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[detect]", msg);
    res.status(500).json({ error: msg });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`Panel detector running on http://localhost:${PORT}`);
});
