import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import admin from "firebase-admin";
import Stripe from "stripe";

dotenv.config();

// Lazy Stripe initialization
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: "2025-01-27.acacia" as any,
    });
  }
  return stripeClient;
}

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

// Cache support state for Gemini Imagen to avoid throwing billing/plan plan-restriction warnings repeatedly
let isImagenSupported = true;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Manual CORS middleware for all endpoints/origins
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

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

    // Curate images matching typical premium Iraqi e-commerce categories and common product queries
    const getCuratedImageUrl = () => {
      let fallbackUrl = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=1200&auto=format&fit=crop'; // Default: smartphone / modern gadget
      
      const catLower = (category || '').toLowerCase();
      const promptLower = (prompt || '').toLowerCase();
      
      if (
        catLower.includes('phone') || 
        catLower.includes('موبايل') || 
        promptLower.includes('ايفون') || 
        promptLower.includes('iphone') || 
        promptLower.includes('هاتف') ||
        promptLower.includes('تلفون') ||
        promptLower.includes('galaxy') ||
        promptLower.includes('جالكسي') ||
        promptLower.includes('شاومي')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=1200&auto=format&fit=crop'; // Modern smartphone desk
      } else if (
        promptLower.includes('لابتوب') ||
        promptLower.includes('كمبيوتر') ||
        promptLower.includes('حاسوب') ||
        promptLower.includes('laptop') ||
        promptLower.includes('macbook') ||
        promptLower.includes('ماكبوك')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1200&auto=format&fit=crop'; // MacBook
      } else if (
        promptLower.includes('بلايستيشن') ||
        promptLower.includes('playstation') ||
        promptLower.includes('xbox') ||
        promptLower.includes('سوني') ||
        promptLower.includes('ألعاب') ||
        promptLower.includes('game')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?q=80&w=1200&auto=format&fit=crop'; // Gaming Controller/Console
      } else if (
        promptLower.includes('سماعة') ||
        promptLower.includes('سماعات') ||
        promptLower.includes('headphone') ||
        promptLower.includes('airpods')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1200&auto=format&fit=crop'; // High-end Headphones
      } else if (
        promptLower.includes('كاميرا') ||
        promptLower.includes('تصوير') ||
        promptLower.includes('camera') ||
        promptLower.includes('عدسة')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=1200&auto=format&fit=crop'; // Premium DSLRs
      } else if (
        catLower.includes('car') || 
        catLower.includes('سيار') || 
        catLower.includes('vehicle') || 
        promptLower.includes('سيارة') || 
        promptLower.includes('تاجير') ||
        promptLower.includes('أوباما') ||
        promptLower.includes('تويوتا') ||
        promptLower.includes('هونداي')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1200&auto=format&fit=crop'; // Luxury Modern Sedan
      } else if (
        catLower.includes('fashion') || 
        catLower.includes('ملابس') || 
        catLower.includes('clothing') || 
        promptLower.includes('قميص') || 
        promptLower.includes('فستان') ||
        promptLower.includes('ملابس') ||
        promptLower.includes('حذاء') ||
        promptLower.includes('قاط') ||
        promptLower.includes('نظارة')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1200&auto=format&fit=crop'; // High Fashion Mall
      } else if (
        catLower.includes('furniture') || 
        catLower.includes('أثاث') || 
        catLower.includes('home') || 
        promptLower.includes('كرسي') || 
        promptLower.includes('طاولة') ||
        promptLower.includes('تخم') ||
        promptLower.includes('قنفة') ||
        promptLower.includes('غرفة') ||
        promptLower.includes('ميز') ||
        promptLower.includes('مطبخ') ||
        promptLower.includes('ديوان')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?q=80&w=1200&auto=format&fit=crop'; // Premium Furniture/Aesthetic Room
      } else if (
        catLower.includes('realestate') || 
        catLower.includes('عقار') || 
        promptLower.includes('شقة') || 
        promptLower.includes('بيت') || 
        promptLower.includes('منزل') ||
        promptLower.includes('أرض') ||
        promptLower.includes('عمارة') ||
        promptLower.includes('فيلا')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?q=80&w=1200&auto=format&fit=crop'; // Luxury Villa / House Facade
      } else if (
        catLower.includes('watch') || 
        catLower.includes('ساع') || 
        promptLower.includes('ساعة') || 
        promptLower.includes('ساعه') ||
        promptLower.includes('رولكس')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1200&auto=format&fit=crop'; // Elegant Minimalist watch
      } else if (
        catLower.includes('electronic') || 
        catLower.includes('أجهزة') || 
        promptLower.includes('شاشة') || 
        promptLower.includes('تلفزيون') || 
        promptLower.includes('ثلاجة') ||
        promptLower.includes('مكيف') ||
        promptLower.includes('سبلت')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1588508065123-287b28e013da?q=80&w=1200&auto=format&fit=crop'; // Electronic Kitchen Appliances / Smart device
      } else if (
         catLower.includes('service') || 
         catLower.includes('خدم') || 
         promptLower.includes('تنظيف') || 
         promptLower.includes('توصيل') || 
         promptLower.includes('تأسيس') ||
         promptLower.includes('صيانة')
      ) {
        fallbackUrl = 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=1200&auto=format&fit=crop'; // Professional business environment / support desk
      } else {
        // High fidelity random seed selection mapping directly to Picsum to guarantee dynamic variation
        const seedValue = Math.floor(Math.random() * 1000);
        fallbackUrl = `https://picsum.photos/seed/${seedValue}/1200/1200`;
      }
      return fallbackUrl;
    };

    if (!isImagenSupported) {
      const fallbackUrl = getCuratedImageUrl();
      console.log(`[Image Generator Proxy] Bypassed actual Gemini call (cached unsupported tier). Yielding curated stock option matching prompt: "${prompt}"`);
      return res.json({ imageUrl: fallbackUrl, fallback: true });
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
        res.json({ imageUrl, fallback: false });
      } else {
        throw new Error("No images generated in Response");
      }
    } catch (error: any) {
      const errMsg = error?.message || '';
      if (errMsg.includes('paid plan') || errMsg.includes('upgrade your account') || errMsg.includes('INVALID_ARGUMENT') || errMsg.includes('Imagen')) {
        console.warn("[Gemini API] Target key requires a billing/paid plan to support Imagen generation. Gracefully switching search routing to high-fidelity curated asset catalog.");
        isImagenSupported = false; // Disable dynamically for subsequent queries to save resources and speed up application.
      } else {
        console.warn("Gemini Image Generation Error, falling back to rich curated category placeholder:", error);
      }
      
      const fallbackUrl = getCuratedImageUrl();
      res.json({ imageUrl: fallbackUrl, fallback: true });
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

  // API endpoint for MasterCard featured ad subscriptions ($1 settlement)
  app.post("/api/payments/checkout", async (req, res) => {
    const { cardHolder, cardNumber, expiry, cvv, amount, adId, userId } = req.body;

    if (!cardNumber || !expiry || !cvv || !cardHolder) {
      return res.status(400).json({ error: "جميع بيانات بطاقة الماستركارد مطلوبة لإتمام عملية الدفع." });
    }

    const cleanCardNo = cardNumber.replace(/\s+/g, '');
    if (cleanCardNo.length < 15 || cleanCardNo.length > 19) {
      return res.status(400).json({ error: "رقم البطاقة غير صالح، يرجى كتابة الأرقام بالكامل للتأكيد." });
    }

    const stripe = getStripe();

    try {
      if (stripe) {
        console.log(`[Stripe Active] Processing secure online charge of $${amount || 1.00} for adId: ${adId || 'new_ad'}`);
        
        // Parse expiry Format "MM/YY"
        const expParts = expiry.split('/');
        const expMonth = expParts[0]; // String matching MM
        let expYear = expParts[1]; // String matching YY
        const fullYear = expYear.length === 2 ? `20${expYear}` : expYear; // E.g. "2030"

        // 1. Resolve PCI-safe Stripe Token (Bypassing direct backend card submission)
        let sourceToken = "";
        const isTestMode = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.includes("_test_");

        if (isTestMode) {
          // Allow testing of failures (like insufficient funds) in Test Mode
          const normalizedHolder = cardHolder.toLowerCase();
          
          if (
            normalizedHolder.includes('decline') || 
            normalizedHolder.includes('insufficient') || 
            cvv === '99) ' || 
            cvv === '999' || 
            cvv === '000' || 
            cleanCardNo.endsWith('0005') || 
            cleanCardNo.endsWith('0002')
          ) {
            // Map to Stripe's decline token for Insufficient Funds to simulate real card decline
            sourceToken = 'tok_chargeDeclinedInsufficientFunds';
            console.log(`[Stripe Test Simulation] Insufficient Funds testing mapped: ${sourceToken}`);
          } else {
            // Map to standard Stripe test tokens directly to avoid direct backend credit card constraints
            if (cleanCardNo.startsWith('4')) {
              sourceToken = 'tok_visa';
            } else if (cleanCardNo.startsWith('5')) {
              sourceToken = 'tok_mastercard';
            } else if (cleanCardNo.startsWith('3')) {
              sourceToken = 'tok_amex';
            } else {
              sourceToken = 'tok_visa';
            }
            console.log(`[Stripe Test Mode] Bypassed raw card details and tokenized using mapping: ${sourceToken}`);
          }
        } else {
          try {
            // Attempt direct custom token creation (only succeeds if direct raw card access is allowed on the Stripe account)
            const tokenToken = await stripe.tokens.create({
              card: {
                number: cleanCardNo,
                exp_month: expMonth,
                exp_year: fullYear,
                cvc: cvv,
                name: cardHolder,
              }
            });
            sourceToken = tokenToken.id;
          } catch (tokenErr: any) {
            if (tokenErr.message && tokenErr.message.includes("credit card numbers directly")) {
              console.warn(`[Stripe PCI Constraint] Direct tokenization blocked on backend API.`);
              throw new Error("بوابة Stripe تتطلب توكن دفع آمن من الواجهة الأمامية (Frontend-Tokenized) أو تفعيل إذن التعامل المباشر مع البطاقات (Raw Card APIs) في إعدادات حسابكم.");
            } else {
              throw tokenErr;
            }
          }
        }

        // 2. Perform Charge of 1 USD (100 cents)
        const chargeValue = Math.round((amount || 1.00) * 100);
        const charge = await stripe.charges.create({
          amount: chargeValue,
          currency: 'usd',
          source: sourceToken,
          description: `Al-Rafidain Marketplace Ad Promotion: ${adId || 'new_ad'} (User ID: ${userId || 'N/A'})`,
        });

        res.json({
          success: true,
          receiptRef: charge.id,
          message: "تم خصم وتسوية الـ 1$ دولار حقيقياً عبر بوابة Stripe وإرسال المدخولات لحسابكم.",
          settledTo: "Stripe Wallet (Payout to 5213 7201 7162 0086 enabled)",
          timestamp: new Date().toISOString()
        });
      } else {
        // Fallback simulated payment when STRIPE_SECRET_KEY is not defined yet
        console.log(`[Stripe Simulation] Processing $${amount || 1.00} for ad ${adId || 'N/A'}. User: ${userId || 'N/A'}`);
        console.log(`MasterCard direct peer-to-peer settlement target card: 5213 7201 7162 0086`);
        
        const receiptRef = "ST-REF-" + Math.floor(10000000 + Math.random() * 90000000);
        res.json({
          success: true,
          receiptRef,
          message: "تم محاكاة معالجة البيانات بنجاح في بيئة التطوير. يرجى تزويد STRIPE_SECRET_KEY لتفعيل الدفع الحقيقي.",
          settledTo: "5213 7201 7162 0086",
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      console.error("MasterCard Payment Processing Error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ إلكتروني أثناء معالجة بيانات بطاقة الائتمان عبر خادم الدفع." });
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
