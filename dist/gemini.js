const { GoogleGenAI, Type } = require("@google/genai");

const MODELS = {
  fast: "gemini-2.0-flash",
  standard: "gemini-2.5-pro-preview-05-06",
  expert: "gemini-2.5-pro-preview-05-06",
};

const PROMPTS = {
  fast: `Detect quickly: power circuit breakers (MCCB/ACB), modular breakers (MCB), and columns/sections.
Return JSON with bounding boxes [ymin, xmin, ymax, xmax] normalised 0-1000.`,

  standard: `Analyse this industrial electrical panel photo.
1. Identify: power breakers (MCCB/ACB), modular breakers (MCB), contactors, relays, PLCs, meters.
2. Segment ALL vertical columns left to right — each gets its own bounding box.
3. If draw-out type (Okken, Blokset), segment functional drawers too.
Return coordinates [ymin, xmin, ymax, xmax] (0-1000).
category = 'structure' for columns/drawers only, 'component' for everything else.`,

  expert: `EXPERT analysis of this industrial electrical panel.
For each detected component:
1. Precise type (ACB, MCCB, Vigi, PLC, Contactor, etc.)
2. Brand (Schneider, ABB, Siemens, Legrand, etc.)
3. Physical dimensions estimate (Width x Height mm)
4. Rating if readable (e.g. 400A, 16A)
5. Segment ALL vertical columns left to right.
6. If draw-out type (Okken, Blokset), segment functional drawers too.
Return coordinates [ymin, xmin, ymax, xmax] (0-1000).
category = 'structure' for columns/drawers, 'component' for all others.`,
};

async function detectCircuitBreakers(base64Image, mode = "standard") {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const imageData = base64Image.includes(",")
    ? base64Image.split(",")[1]
    : base64Image;

  const response = await ai.models.generateContent({
    model: MODELS[mode] || MODELS.standard,
    contents: [
      {
        parts: [
          { text: PROMPTS[mode] || PROMPTS.standard },
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
