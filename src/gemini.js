const { GoogleGenAI, Type } = require("@google/genai");

const MODEL = "gemini-3.1-pro-preview";

const PROMPT = `Analyse this industrial electrical panel photo.

1. Detect ALL visible components and segments. For the label field use the SPECIFIC type name — never generic names like "power breaker" or "circuit breaker":
   - Large frame breaker on cradle → "ACB" or specific model if readable (e.g. "MasterPact MTZ", "MasterPact NT")
   - Medium frame bolted breaker → "MCCB" or specific model (e.g. "Compact NSX", "Compact NS")
   - Small DIN-rail breaker → "MCB" or specific model (e.g. "Acti9", "iC60", "Multi9")
   - Switching device with coil → "Contactor"
   - Protection relay → "Relay"
   - Automation module → "PLC"
   - Measurement device → "Meter"
   - Vertical panel section → "Column" (category = structure)
   - Draw-out tray (Okken) → "Drawer" (category = structure)

2. For each component also fill: brand (Schneider/ABB/Siemens/Legrand/other), rating if readable (e.g. "400A"), type_detail if you can read the exact model.
3. Draw a TIGHT box_2d [ymin, xmin, ymax, xmax] (0-1000) around each individual device body.
4. One entry per device — do NOT group multiple into one box.
category = 'structure' for Column/Drawer only, 'component' for everything else.`;

async function detectCircuitBreakers(base64Image, workZone = null, safetyBuffer = null) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const imageData = base64Image.includes(",")
    ? base64Image.split(",")[1]
    : base64Image;

  let zoneText = "";
  if (workZone && safetyBuffer) {
    zoneText = `
WORK ZONE (yellow box — engineer works here): ymin=${workZone.ymin} xmin=${workZone.xmin} ymax=${workZone.ymax} xmax=${workZone.xmax}
SAFETY BUFFER (red box — extended detection zone): ymin=${safetyBuffer.ymin} xmin=${safetyBuffer.xmin} ymax=${safetyBuffer.ymax} xmax=${safetyBuffer.xmax}

IMPORTANT: Only detect components whose bounding box overlaps with the Safety Buffer. Ignore everything outside.
`;
  }

  const fullPrompt = PROMPT + zoneText;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        parts: [
          { text: fullPrompt },
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
