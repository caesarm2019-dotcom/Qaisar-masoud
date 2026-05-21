import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const saValue = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    if (saValue.startsWith('{')) {
      const serviceAccount = JSON.parse(saValue);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin initialized");
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT environment variable exists but does not appear to be a JSON string. Skipping Firebase Admin initialization.");
    }
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
  }
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/ai/suggest-price", async (req, res) => {
    const { itemTitle, category, condition, itemDescription } = req.body;

    if (!itemTitle) {
      return res.status(400).json({ error: "Item title is required" });
    }

    try {
      const prompt = `You are a professional market price analyst for second-hand items in Iraq.
      Given the following details, suggest a fair market price range in Iraqi Dinar (IQD).
      Item: ${itemTitle}
      Category: ${category}
      Condition: ${condition}
      Description: ${itemDescription}

      Respond with a JSON object containing:
      - minPrice: number
      - maxPrice: number
      - reasoning: string (briefly in Arabic)
      - marketTrend: string (optional, brief in Arabic)

      Do not include any other text in the response, only the JSON.`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const suggestion = JSON.parse(result.text);
      res.json(suggestion);
    } catch (error) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: "Failed to generate price suggestion" });
    }
  });

  app.post("/api/ai/suggest-category", async (req, res) => {
    const { itemTitle, itemDescription, categories } = req.body;

    if (!itemTitle) {
      return res.status(400).json({ error: "Item title is required" });
    }

    try {
      const prompt = `You are a professional classification expert for e-commerce in Iraq.
      Given the following item title and description, select the most appropriate category from the provided list.
      
      Item Title: ${itemTitle}
      Item Description: ${itemDescription}
      
      Categories: ${JSON.stringify(categories)}

      Respond with a JSON object containing:
      - categoryId: string (must be one of the IDs in the provided category list)
      - reasoning: string (briefly in Arabic explaining why this category was chosen)

      Do not include any other text in the response, only the JSON.`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const suggestion = JSON.parse(result.text);
      res.json(suggestion);
    } catch (error) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: "Failed to generate category suggestion" });
    }
  });

  app.post("/api/ai/suggest-description", async (req, res) => {
    const { itemTitle, category, condition, itemDescription } = req.body;

    if (!itemTitle) {
      return res.status(400).json({ error: "Item title is required" });
    }

    try {
      const prompt = `You are an expert sales copywriter in Iraq, specializing in classified marketplace advertisements for the "Al-Rafidain" platform.
      Given the following details, write a compelling, premium, and friendly advertisement description in warm Iraqi Arabic dialect (العامية العراقية البغدادية الراقية واللطيفة والمقنعة).
      
      Item: ${itemTitle}
      Category: ${category}
      Condition: ${condition}
      User Notes: ${itemDescription || 'لا توجد ملاحظات إضافية'}
      
      Requirements for the description:
      - Use a polite, enthusiastic, and highly professional Iraqi dialect tone (e.g., phrases like "نظيف حيل", "كلش نظيف وبدون أي عيوب", "البيع مستعجل", "الشراي يرسل عراسي").
      - Structure the description beautifully with bullet points outlining key features, condition, accessories, and location/shipping info.
      - End with a welcoming call-to-action encouraging people to chat or contact via WhatsApp.
      - Return a JSON object with a single "description" string field containing the beautifully generated Arabic description (utilizing emojis where appropriate).
      - Do not include any other text in the response, only the JSON.`;

      const result = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const suggestion = JSON.parse(result.text);
      res.json(suggestion);
    } catch (error) {
      console.error("Gemini Description Error:", error);
      res.status(500).json({ error: "Failed to generate description suggestion" });
    }
  });

  app.post("/api/ai/generate-image", async (req, res) => {
    const { prompt, category } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    try {
      console.log(`Generating image for prompt: "${prompt}", category: "${category}"`);
      const enhancedPrompt = `A high-quality, professional, realistic, studio-lit shop display or commercial product photograph of "${prompt}" in the category of "${category || 'general items'}", clean background, photorealistic, 8k resolution, commercial e-commerce presentation format.`;

      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: enhancedPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        },
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
        const base64Bytes = response.generatedImages[0].image.imageBytes;
        const imageUrl = `data:image/jpeg;base64,${base64Bytes}`;
        res.json({ imageUrl });
      } else {
        throw new Error("No images generated in Response");
      }
    } catch (error) {
      console.error("Gemini Image Generation Error:", error);
      res.status(500).json({ error: "Failed to generate realistic product image" });
    }
  });

  app.post("/api/notifications/send", async (req, res) => {
    const { token, title, body, data } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Registration token is required" });
    }

    if (admin.apps.length === 0) {
      return res.status(501).json({ error: "FCM not configured or initialized on server" });
    }

    try {
      const message = {
        notification: { title, body },
        data: data || {},
        token: token
      };

      const response = await admin.messaging().send(message);
      res.json({ success: true, messageId: response });
    } catch (error) {
      console.error("FCM Error:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
