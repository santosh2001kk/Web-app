const { GoogleGenAI, Type } = require("@google/genai");

const MODEL = "gemini-3.1-pro-preview";

const PROMPT = `You are an expert Schneider Electric panel inspector.

STEP 1 — IDENTIFY PANEL TYPE (pick exactly one):
- "Okken"      : Very large dark-grey cabinet, DOUBLE hinged doors per section, floor-standing industrial.
- "PrismaSeT P": Has a large draw-out ACB (MasterPact on cradle) OR a narrow BLANK solid door on one side (VBB compartment).
- "PrismaSeT G": Only compact fixed MCCBs/MCBs bolted to busbar, no ACB, no blank side compartment.
- "Unknown"    : Cannot determine from the image.

STEP 2 — DETECT ALL components. Use SPECIFIC type names — never "power breaker" or "circuit breaker":
   - Large draw-out ACB on cradle → "ACB" or exact model (e.g. "MasterPact MTZ", "MasterPact NT")
   - Medium frame bolted MCCB → "MCCB" or exact model (e.g. "Compact NSX", "Compact NS")
   - Small DIN-rail MCB → "MCB" or exact model (e.g. "Acti9", "iC60", "Multi9")
   - Switching device with coil → "Contactor"
   - Protection relay → "Relay"
   - Automation module → "PLC"
   - Measurement device → "Meter"
   - Vertical panel section → "Column" (category = structure)
   - Draw-out tray in Okken → "Drawer" (category = structure)

STEP 3 — For each component fill: brand, rating if readable (e.g. "400A"), type_detail if exact model visible.
Draw a TIGHT box_2d [ymin, xmin, ymax, xmax] (0-1000) per device. One entry per device, no grouping.
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
          panel_type: { type: Type.STRING, description: "Okken, PrismaSeT P, PrismaSeT G, or Unknown" },
        },
        required: ["detections", "panel_type"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  return JSON.parse(text);
}

module.exports = { detectCircuitBreakers };
