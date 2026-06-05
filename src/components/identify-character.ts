import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AIConnection } from "./ai-connection";

const characterSchema = z.object({
  character: z.string().describe("The Chinese/Kanji/Hiragana/Katakana/Korean characters identified."),
  meaning: z.string().describe("One word English definition."),
});

export type IdentifiedCharacter = z.infer<typeof characterSchema>;

export async function identifyCharacter(aiConnection: AIConnection, imageData: string): Promise<IdentifiedCharacter> {
  const apiKey = aiConnection.getApiKey();
  if (!apiKey) {
    throw new Error("API key not found. Please connect to AI first.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const config: GenerateContentConfig = {
    responseMimeType: "application/json",
    responseJsonSchema: zodToJsonSchema(characterSchema as any),
    temperature: 0,
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.MINIMAL,
    },
  };

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
      role: "user",
      parts: [
        {
          inlineData: {
            data,
            mimeType,
          },
        },
        {
          text: `Identify the Chinese/Kanji/Hiragana/Katakana/Korean calligraphy character in this image. 
Respond in this JSON format:
{
 "character": "<the identified Chinese/Kanji/Hiragana/Katakana/Korean character(s)>",
 "meaning": "<One word English definition>"
}
`,
        },
      ],
    },
  ];

  console.time("identifyCharacter");
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    config,
    contents,
  });

  const responseText = response.text;
  console.log("Gemini Raw Response:", responseText);

  if (!responseText) {
    throw new Error("No text returned from Gemini");
  }

  const json = JSON.parse(responseText);
  const result = characterSchema.parse(json);
  console.timeEnd("identifyCharacter");

  return result;
}

export async function identifyCharacterFast(aiConnection: AIConnection, imageData: string): Promise<string> {
  const apiKey = aiConnection.getApiKey();
  if (!apiKey) {
    throw new Error("API key not found. Please connect to AI first.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const config: GenerateContentConfig = {
    responseModalities: ["text"],
    temperature: 0,
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
      role: "user",
      parts: [
        {
          inlineData: {
            data,
            mimeType,
          },
        },
        {
          text: `Identify the Chinese/Kanji/Hiragana/Katakana/Korean character in the image.
Respond in this format:
"""
Character: <Character,Kanji,Hiragana,Katakana,Korean>
Definition: <Short English definition, Sentence case>
"""
Do not preamble or say anything else; just respond with the character and definition
`.trim(),
        },
      ],
    },
  ];

  console.time("identifyCharacterFast");
  const response = await ai.models.generateContent({
    model,
    config,
    contents,
  });
  console.timeEnd("identifyCharacterFast");

  const responseText = response.text;
  if (!responseText) {
    throw new Error("No text returned from Gemini");
  }

  // Extract the definition from the response
  const definitionMatch = responseText.match(/Definition:\s*(.*)/i);
  if (definitionMatch) {
    return definitionMatch[1].trim();
  }

  return responseText.trim();
}
