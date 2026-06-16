import { AIConnection } from "./ai-connection";

export async function generatePainting(aiConnection: AIConnection, description: string): Promise<string[]> {
  const apiKey = aiConnection.getFalApiKey();
  if (!apiKey) {
    throw new Error("Fal.ai API key not found. Please connect to AI first.");
  }

  const prompt = `Create a minimalist traditional Chinese painting based on description. Borderless and Frameless. Do NOT include calligraphy, text, inscription, seal. Convert the user provided concept into graphical representation: Paint the concept inspired by ${description}`;

  const response = await fetch("https://fal.run/fal-ai/flux-2/turbo", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "portrait_16_9",
      guidance_scale: 10,
      num_images: 1,
      output_format: "png",
      enable_prompt_expansion: true,
      sync_mode: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fal.ai generate API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const images: string[] = [];

  if (Array.isArray(data?.images)) {
    for (const image of data.images) {
      if (image && typeof image === "object" && image.url) {
        images.push(image.url);
      } else if (typeof image === "string") {
        images.push(image);
      }
    }
  }

  if (data?.image?.url) {
    images.push(data.image.url);
  } else if (typeof data?.image === "string") {
    images.push(data.image);
  }

  if (data?.url) {
    images.push(data.url);
  }

  return images.filter(Boolean);
}

export async function editPainting(aiConnection: AIConnection, imageData: string, description: string): Promise<string[]> {
  const apiKey = aiConnection.getFalApiKey();
  if (!apiKey) {
    throw new Error("Fal.ai API key not found. Please connect to AI first.");
  }

  const prompt = `Paint over the red rectangle area. Replace the red rectangle area with a concept described by the user: ${description}. Do NOT include calligraphy, text, inscription, or seal. Convert the user provided concept into painting with a style consistent with the rest of the painting.`;

  // Parse the image data (assuming it's a data URL like data:image/jpeg;base64,...)
  let dataUrl = imageData;
  if (!dataUrl.startsWith("data:")) {
    // If it's raw base64 data, format it as a JPEG data URL
    dataUrl = `data:image/jpeg;base64,${imageData}`;
  }

  const response = await fetch("https://fal.run/fal-ai/flux-2/turbo/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_urls: [dataUrl],
      guidance_scale: 10,
      enable_prompt_expansion: true,
      image_size: "portrait_16_9",
      num_images: 1,
      output_format: "png",
      enable_safety_checker: false,
      safety_tolerance: "6",
      sync_mode: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fal.ai edit API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const images: string[] = [];

  if (Array.isArray(data?.images)) {
    for (const image of data.images) {
      if (image && typeof image === "object" && image.url) {
        images.push(image.url);
      } else if (typeof image === "string") {
        images.push(image);
      }
    }
  }

  if (data?.image?.url) {
    images.push(data.image.url);
  } else if (typeof data?.image === "string") {
    images.push(data.image);
  }

  if (data?.url) {
    images.push(data.url);
  }

  return images.filter(Boolean);
}
