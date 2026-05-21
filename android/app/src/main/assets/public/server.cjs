var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_firebase_admin = __toESM(require("firebase-admin"), 1);
import_dotenv.default.config();
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const saValue = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    if (saValue.startsWith("{")) {
      const serviceAccount = JSON.parse(saValue);
      import_firebase_admin.default.initializeApp({
        credential: import_firebase_admin.default.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin initialized");
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT environment variable exists but does not appear to be a JSON string. Skipping Firebase Admin initialization.");
    }
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
  }
}
var ai = new import_genai.GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
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
          responseMimeType: "application/json"
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
          responseMimeType: "application/json"
        }
      });
      const suggestion = JSON.parse(result.text);
      res.json(suggestion);
    } catch (error) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: "Failed to generate category suggestion" });
    }
  });
  app.post("/api/notifications/send", async (req, res) => {
    const { token, title, body, data } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Registration token is required" });
    }
    if (import_firebase_admin.default.apps.length === 0) {
      return res.status(501).json({ error: "FCM not configured or initialized on server" });
    }
    try {
      const message = {
        notification: { title, body },
        data: data || {},
        token
      };
      const response = await import_firebase_admin.default.messaging().send(message);
      res.json({ success: true, messageId: response });
    } catch (error) {
      console.error("FCM Error:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
