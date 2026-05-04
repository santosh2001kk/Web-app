import { GoogleGenAI, Type } from "@google/genai";

export interface BoundingBox {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  label: string;
  category: "component" | "structure";
  brand?: string;
  type_detail?: string;
  estimated_dimensions?: string;
  rating?: string;
}

export interface DetectionResponse {
  detections: BoundingBox[];
  summary?: string;
}

const MODELS = {
  fast: "gemini-2.0-flash",
  standard: "gemini-2.5-pro-preview-05-06",
  expert: "gemini-2.5-pro-preview-05-06",
};

const PROMPTS: Record<string, string> = {
  fast: `Detect quickly: power circuit breakers (MCCB/ACB), modular breakers (MCB), and columns/sections.
Return JSON with bounding boxes [ymin, xmin, ymax, xmax] normalised 0-1000.`,

  standard: `Analyse this industrial electrical panel photo.
1. Identify the following components:
   - Power circuit breakers (MCCB, ACB, large frame)
   - Modular breakers (small DIN-rail MCBs)
   - Contactors / relays
   - PLCs / automation modules
   - Meters / indicators
2. Segment ALL columns (distinct vertical sections) left to right — each gets its own bounding box.
3. If the panel is draw-out type (e.g. Okken, Blokset), segment functional drawers too.

Return coordinates [ymin, xmin, ymax, xmax] (0-1000).
Assign category 'structure' to columns and drawers only, 'component' to everything else.`,

  expert: `EXPERT analysis of this industrial electrical panel.
For each detected component:
1. Identify the precise type (ACB, MCCB, Vigi, PLC, Contactor, etc.).
2. Identify the BRAND (Schneider, ABB, Siemens, Legrand, etc.).
3. Estimate physical DIMENSIONS (Width x Height in mm).
4. Identify RATING if readable (e.g. 400A, 16A).
5. Segment ALL columns (distinct vertical sections, left to right).
6. If draw-out type (Okken, Blokset or equivalent), also segment functional drawers.

Return coordinates [ymin, xmin, ymax, xmax] (0-1000).
Be as precise as possible on technical details.
Assign category 'structure' to columns and drawers, 'component' to all others.`,
};

export async function detectCircuitBreakers(
  base64Image: string,
  mode: "fast" | "standard" | "expert" = "standard"
): Promise<DetectionResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const imageData = base64Image.includes(",")
    ? base64Image.split(",")[1]
    : base64Image;

  const response = await ai.models.generateContent({
    model: MODELS[mode],
    contents: [
      {
        parts: [
          { text: PROMPTS[mode] },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageData,
            },
          },
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
                label: { type: Type.STRING },
                category: {
                  type: Type.STRING,
                  description: "'component' or 'structure'",
                },
                brand: { type: Type.STRING },
                type_detail: { type: Type.STRING },
                estimated_dimensions: { type: Type.STRING },
                rating: { type: Type.STRING },
              },
              required: ["box_2d", "label", "category"],
            },
          },
          summary: {
            type: Type.STRING,
            description: "Brief technical summary of the panel",
          },
        },
        required: ["detections"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  return JSON.parse(text) as DetectionResponse;
}
