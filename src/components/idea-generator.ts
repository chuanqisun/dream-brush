import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { JSONParser } from "@streamparser/json";
import { Observable, scan, switchMap } from "rxjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const conceptSchema = z.object({
  ideas: z
    .array(
      z.object({
        character: z.string().describe("A single Chinese character"),
        meaning: z.string().describe("Short English definition, one-word"),
      }),
    )
    .min(5)
    .max(7),
});

/**
 * Uses gemini-3-flash-preview JSON structured output to suggest 5-7 concepts based on previously recognized concepts.
 * The suggestioned concepts must be relevant to Chinese traditional culture and painting
 * Each concept is a single Chinese character
 */
export function startIdeaGeneration(
  recognizedConcepts: Observable<{ character: string; meaning: string }>,
): Observable<{ character: string; meaning: string }> {
  const apiKey = localStorage.getItem("google_ai_api_key") || "";
  const ai = new GoogleGenAI({ apiKey });

  return recognizedConcepts.pipe(
    scan((acc, curr) => [...acc, curr], [] as { character: string; meaning: string }[]),
    switchMap((concepts) => {
      return new Observable<{ character: string; meaning: string }>((subscriber) => {
        const prompt = `Based on related concepts from a painting session:
"""
${concepts.map((c) => `${c.character} (${c.meaning})`).join("\n")}
"""

Suggest 7 new objects that would be relevant to Chinese traditional culture and painting.
Represent each object with a *single* Chinese character and Single word/phrase English definition. Respond in this JSON format:
[
  {
    "character": "<single character>",
    "meaning": "<one-word English definition>"
  },
  ...
]
`;

        const parser = new JSONParser();
        parser.onValue = ({ value, key }) => {
          if (typeof key === "number" && value && typeof value === "object") {
            const item = value as { character: string; meaning: string };
            if (item.character && item.meaning) {
              subscriber.next(item);
            }
          }
        };

        let alive = true;

        (async () => {
          try {
            const stream = await ai.models.generateContentStream({
              model: "gemini-3.5-flash",
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: {
                thinkingConfig: {
                  thinkingLevel: ThinkingLevel.MINIMAL,
                },
                responseMimeType: "application/json",
                responseJsonSchema: zodToJsonSchema(conceptSchema as any),
              },
            });

            for await (const chunk of stream) {
              if (!alive) break;
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                parser.write(text);
              }
            }
            if (alive) subscriber.complete();
          } catch (error) {
            if (alive) subscriber.error(error);
          }
        })();

        return () => {
          alive = false;
        };
      });
    }),
  );
}
