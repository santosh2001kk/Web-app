const { GoogleGenAI, Type } = require("@google/genai");

const MODEL = "gemini-3.1-pro-preview";

const PROMPT = `Analyse this industrial electrical panel photo.
1. Identify all components: power breakers (MCCB/ACB), modular breakers (MCB), contactors, relays, PLCs, meters.
2. For each component identify: precise type, brand (Schneider/ABB/Siemens/Legrand), rating if readable (e.g. 400A).
3. Segment ALL vertical columns left to right — each gets its own bounding box.
4. If draw-out type (Okken, Blokset), segment functional drawers too.
Return coordinates [ymin, xmin, ymax, xmax] (0-1000).
category = 'structure' for columns/drawers only, 'component' for everything else.`;

async function detectCircuitBreakers(base64Image) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const imageData = base64Image.includes(",")
    ? base64Image.split(",")[1]
    : base64Image;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType: "image/jpeg", data: imageData } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                  description: "[ymin, xmin, ymax, xmax] from 0 to 1000",
                },
                label:               { type: Type.STRING },
                category:            { type: Type.STRING },
                brand:               { type: Type.STRING },
                type_detail:         { type: Type.STRING },
                estimated_dimensions:{ type: Type.STRING },
                rating:              { type: Type.STRING },
              },
              required: ["box_2d", "label", "category"],
            },
          },
          summary: { type: Type.STRING },
        },
        required: ["detections"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  return JSON.parse(text);
}

module.exports = { detectCircuitBreakers };
