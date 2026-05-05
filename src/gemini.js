const { GoogleGenAI, Type } = require("@google/genai");

const MODEL = "gemini-3.1-pro-preview";

const PROMPT = `You are an expert electrical panel inspector.

COMPONENT LABELS — use these exact names:
- MasterPact MTZ or MasterPact NT  (large draw-out ACB)
- Compact NSX or Compact NS        (medium MCCB)
- Acti9 / iC60 / Multi9            (small DIN rail MCB)
- Contactor / Relay / PLC / Meter  (other devices)
- Column                           (vertical cubicle section — category = structure)
- Drawer                           (draw-out tray in Okken panel — category = structure)

DO NOT label cable ducts, wires, or bare enclosure panels.

DETECTION RULES:
1. Draw a TIGHT box_2d [ymin, xmin, ymax, xmax] (0-1000) around each individual component body.
2. Detect EVERY visible component — do not skip any.
3. For each vertical cubicle column add one entry: label="Column", category="structure".
4. For Okken drawers add: label="Drawer", category="structure".
5. Read rating (e.g. "400A") and brand from the device face if visible.
6. One entry per individual device — do NOT group multiple devices into one box.`;

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
