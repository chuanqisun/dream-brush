import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import { AIConnection } from "./ai-connection";

export async function generatePainting(aiConnection: AIConnection, description: string): Promise<string[]> {
  const apiKey = aiConnection.getApiKey();
  if (!apiKey) {
    throw new Error("API key not found. Please connect to AI first.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const config: GenerateContentConfig = {
    responseModalities: ["IMAGE"],
    temperature: 0.5,
  };
  const model = "gemini-2.5-flash-image";

  const response = await ai.models.generateContent({
    model,
    config,
    contents: [
      {
        role: "model",
        parts: [
          {
            text: "Create a minimalist traditional Chinese painting based on description. Borderless and Frameless. Do NOT include calligraphy, text, inscription, seal. Convert the user provided concept into graphical representation",
          },
        ],
      },
      { role: "user", parts: [{ text: `Paint the concept inspired by ${description}` }] },
    ],
  });

  const inlinedata = response.candidates?.at(0)?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (!inlinedata) return [];
  const imageUrl = `data:${inlinedata.mimeType};base64,${inlinedata.data}`;
  return [imageUrl];
}

export async function editPainting(aiConnection: AIConnection, imageData: string, description: string): Promise<string[]> {
  const apiKey = aiConnection.getApiKey();
  if (!apiKey) {
    throw new Error("API key not found. Please connect to AI first.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const config: GenerateContentConfig = {
    responseModalities: ["IMAGE"],
    temperature: 0.5,
  };
  const model = "gemini-2.5-flash-image";

  // Parse the image data (assuming it's a data URL like data:image/jpeg;base64,...)
  let data: string;
  let mimeType: string;
  if (imageData.startsWith("data:")) {
    const [mime, base64] = imageData.split(",");
    mimeType = mime.split(":")[1].split(";")[0];
    data = base64;
  } else {
    // Assume it's raw base64 data
    data = imageData;
    mimeType = "image/jpeg"; // Default assumption
  }

  const contents = [
    {
      role: "model",
      parts: [
        {
          text: "Paint over the red rectangle area. Replace the red rectangle area with a concept described by the user. Do NOT include calligraphy, text, inscription, or seal. Convert the user provided concept into painting with a style consistent with the rest of the painting.",
        },
      ],
    },
    {
      role: "user",
      parts: [
        {
          inlineData: {
            data,
            mimeType,
          },
        },
        {
          text: description,
        },
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model,
    config,
    contents,
  });

  const inlinedata = response.candidates?.at(0)?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (!inlinedata) return [];
  const imageUrl = `data:${inlinedata.mimeType};base64,${inlinedata.data}`;
  return [imageUrl];
}
