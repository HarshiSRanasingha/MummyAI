require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { AgentError, getAgentConfig, runAgent } = require("./agent");
const {
  connectDatabase,
  getDatabaseStatus,
  listSyntheticChildren,
  seedSyntheticRecords
} = require("./database");

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const supportedLanguages = ["en", "si", "ta"];
const demoStorePath = path.join(__dirname, "..", "data", "demo-store.json");

const defaultDemoStore = {
  profiles: [],
  growthEntries: [],
  reminders: []
};

function readDemoStore() {
  try {
    if (!fs.existsSync(demoStorePath)) return structuredClone(defaultDemoStore);
    const stored = JSON.parse(fs.readFileSync(demoStorePath, "utf8"));
    return {
      profiles: Array.isArray(stored.profiles) ? stored.profiles : [],
      growthEntries: Array.isArray(stored.growthEntries) ? stored.growthEntries : [],
      reminders: Array.isArray(stored.reminders) ? stored.reminders : []
    };
  } catch (error) {
    console.error("Could not read demo store:", error.message);
    return structuredClone(defaultDemoStore);
  }
}

function writeDemoStore(store) {
  fs.mkdirSync(path.dirname(demoStorePath), { recursive: true });
  fs.writeFileSync(demoStorePath, JSON.stringify(store, null, 2));
}

const demoStore = readDemoStore();

function sendDemoValidation(res, message) {
  return res.status(400).json({ error: message, code: "INVALID_DEMO_INPUT" });
}

function cleanText(value, maxLength = 80) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validIsoDate(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

const emergencyReplies = {
  en: "This may be an emergency. Stop using this chat and seek urgent in-person medical care now. If there is severe breathing difficulty, blue or gray lips, a seizure, unconsciousness, uncontrolled bleeding, or another immediate danger, call your local emergency number or go to the nearest emergency department. Do not wait for an online response.",
  si: "මෙය හදිසි තත්ත්වයක් විය හැකිය. මෙම chat භාවිතය නවතා වහාම ප්‍රාදේශීය හදිසි වෛද්‍ය සේවාවක් සොයන්න. දැඩි ශ්වසන අසීරුතාවක්, තොල් නිල්වීම, ව්‍යාධියක්, මොළුවෙහි අ consciousness තාවක්, නොපාලනය කළ හැකි ලේ ගැලීම හෝ වෙනත් අනතුරක් තිබේ නම්, ඔබේ ස්ථානීය හදිසි ඇමතුම් අංකයට දුරකථන කර හෝ ආසන්නතම හදිසි දෙපාර්තමේන්තුවට යන්න.",
  ta: "இது அவசரநிலையாக இருக்கலாம். இந்த அரட்டையை நிறுத்தி, உடனடியாக அருகிலுள்ள அவசர மருத்துவச் சேவையை அணுகுங்கள். கடுமையான சுவாசக்கஷ்டம், உதடுகள் நீலமாகுதல், வலிப்பு, மயக்கம், கட்டுப்படுத்த முடியாத இரத்தப்போக்கு அல்லது உடனடி ஆபத்து இருந்தால், உள்ளூர் அவசர எண்ணை அழைக்கவும் அல்லது அருகிலுள்ள அவசரப் பிரிவுக்குச் செல்லவும்."
};

function isEmergencyMessage(message) {
  const normalized = message.toLowerCase();
  return [
    "can't breathe", "cannot breathe", "difficulty breathing", "not breathing",
    "unconscious", "seizure", "choking", "suicidal", "suicide", "overdose",
    "severe bleeding", "blue lips", "chest pain", "stroke",
    "හුස්මාරු", "නොහෙනවා", "මොළුව", "self harm",
    "மூச்சு", "மயக்கம்", "வலிப்பு", "தற்கொலை", "தோடுதல்"
  ].some((signal) => normalized.includes(signal));
}

const allowedFrontendOrigins = new Set([
  frontendOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedFrontendOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by MummyAI.`));
  }
}));
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many chat requests. Please wait a minute and try again.",
    code: "CHAT_RATE_LIMITED"
  }
});

app.get("/api/health", (_req, res) => {
  const demoMode = process.env.AI_MODE === "demo";
  res.json({
    ok: true,
    service: "mummyai-api",
    mode: demoMode ? "demo" : "agent",
    provider: demoMode ? "demo" : "ollama",
    model: demoMode ? null : getAgentConfig().model,
    database: getDatabaseStatus(),
    message: demoMode
      ? "API is running in demo mode. No real health records are connected."
      : "API is running with a local Ollama agent. Only synthetic sample records are available when MongoDB is configured."
  });
});

app.get("/api/demo/children", async (_req, res, next) => {
  try {
    const children = await listSyntheticChildren();
    res.json({ recordsAreSynthetic: true, children });
  } catch (error) {
    next(error);
  }
});

app.get("/api/demo/workspace", (_req, res) => {
  res.json({
    recordsAreSynthetic: true,
    profiles: demoStore.profiles,
    growthEntries: demoStore.growthEntries,
    reminders: demoStore.reminders
  });
});

app.post("/api/demo/profiles", (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const dateOfBirth = req.body?.dateOfBirth;
  const relationship = cleanText(req.body?.relationship, 40);

  if (!name || !validIsoDate(dateOfBirth) || !relationship) {
    return sendDemoValidation(res, "Enter a fictional profile name, valid birth date, and relationship.");
  }

  const profile = {
    id: `demo-${Date.now().toString(36)}`,
    name,
    dateOfBirth,
    relationship,
    isSynthetic: true,
    createdAt: new Date().toISOString()
  };
  demoStore.profiles.push(profile);
  writeDemoStore(demoStore);
  res.status(201).json(profile);
});

app.delete("/api/demo/profiles/:id", (req, res) => {
  const index = demoStore.profiles.findIndex((profile) => profile.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Profile not found.", code: "PROFILE_NOT_FOUND" });
  demoStore.profiles.splice(index, 1);
  demoStore.growthEntries = demoStore.growthEntries.filter((entry) => entry.profileId !== req.params.id);
  demoStore.reminders = demoStore.reminders.filter((reminder) => reminder.profileId !== req.params.id);
  writeDemoStore(demoStore);
  res.status(204).send();
});

app.post("/api/demo/growth", (req, res) => {
  const profileId = cleanText(req.body?.profileId, 80);
  const date = req.body?.date;
  const weightKg = Number(req.body?.weightKg);
  const heightCm = Number(req.body?.heightCm);

  if (
    !demoStore.profiles.some((profile) => profile.id === profileId)
    || !validIsoDate(date)
    || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 300
    || !Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 250
  ) {
    return sendDemoValidation(res, "Choose a synthetic profile and enter realistic positive weight and height values.");
  }

  const entry = {
    id: `growth-${Date.now().toString(36)}`,
    profileId,
    date,
    weightKg: Math.round(weightKg * 10) / 10,
    heightCm: Math.round(heightCm * 10) / 10,
    createdAt: new Date().toISOString()
  };
  demoStore.growthEntries.push(entry);
  writeDemoStore(demoStore);
  res.status(201).json(entry);
});

app.post("/api/demo/reminders", (req, res) => {
  const profileId = cleanText(req.body?.profileId, 80);
  const title = cleanText(req.body?.title, 120);
  const date = req.body?.date;

  if (
    !demoStore.profiles.some((profile) => profile.id === profileId)
    || !title
    || !validIsoDate(date)
  ) {
    return sendDemoValidation(res, "Choose a synthetic profile, reminder title, and valid date.");
  }

  const reminder = {
    id: `reminder-${Date.now().toString(36)}`,
    profileId,
    title,
    date,
    completed: false,
    createdAt: new Date().toISOString()
  };
  demoStore.reminders.push(reminder);
  writeDemoStore(demoStore);
  res.status(201).json(reminder);
});

app.patch("/api/demo/reminders/:id", (req, res) => {
  const reminder = demoStore.reminders.find((item) => item.id === req.params.id);
  if (!reminder) return res.status(404).json({ error: "Reminder not found.", code: "REMINDER_NOT_FOUND" });
  if (typeof req.body?.completed !== "boolean") {
    return sendDemoValidation(res, "The completed field must be true or false.");
  }
  reminder.completed = req.body.completed;
  writeDemoStore(demoStore);
  res.json(reminder);
});

app.delete("/api/demo/reminders/:id", (req, res) => {
  const index = demoStore.reminders.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Reminder not found.", code: "REMINDER_NOT_FOUND" });
  demoStore.reminders.splice(index, 1);
  writeDemoStore(demoStore);
  res.status(204).send();
});

app.post("/api/chat", chatLimiter, (req, res, next) => {
  const message = typeof req.body?.message === "string"
    ? req.body.message.trim()
    : "";
  const language = supportedLanguages.includes(req.body?.language)
    ? req.body.language
    : "en";
  const history = req.body?.history === undefined ? [] : req.body.history;

  if (!message) {
    return res.status(400).json({
      error: "Please enter a message.",
      code: "MESSAGE_REQUIRED"
    });
  }

  if (message.length > 4000) {
    return res.status(413).json({
      error: "Message is too long. Please shorten it.",
      code: "MESSAGE_TOO_LONG"
    });
  }

  if (
    !Array.isArray(history)
    || history.length > 8
    || history.some((item) => (
      !item
      || !["user", "assistant"].includes(item.role)
      || typeof item.text !== "string"
      || !item.text.trim()
      || item.text.length > 4000
    ))
  ) {
    return res.status(400).json({
      error: "Conversation history is invalid or too long.",
      code: "INVALID_HISTORY"
    });
  }

  if (isEmergencyMessage(message)) {
    return res.json({
      mode: process.env.AI_MODE === "demo" ? "demo" : "agent",
      answer: emergencyReplies[language],
      disclaimer: "Urgent-care guidance. This prototype cannot assess emergencies or provide medical treatment.",
      emergency: true
    });
  }

  if (process.env.AI_MODE !== "demo") {
    const agentHistory = history.map((item) => ({ role: item.role, content: item.text.trim() }));
    return runAgent(message, language, agentHistory)
      .then((answer) => res.json({
        mode: "agent",
        answer,
        disclaimer: "AI-generated general information only. Not medical advice; only fictional sample records are available, with no reviewed medical sources. Inference runs through the configured local Ollama server."
      }))
      .catch((error) => {
        if (error instanceof AgentError) {
          console.error("MummyAI agent error:", error.code, error.message);
          return res.status(error.status).json({ error: error.message, code: error.code });
        }
        return next(error);
      });
  }

  const replies = {
    en: "Thanks for your question. This is the MummyAI demo chatbot, so it is not connected to a medical knowledge base or personal health records yet. For health concerns, consult a qualified healthcare professional. If you think this may be an emergency, seek urgent medical care now.",
    si: "ඔබගේ ප්‍රශ්නයට ස්තුතියි. මෙය MummyAI ආදර්ශ chatbot එකක් පමණයි; තවම වෛද්‍ය දැනුම් ගබඩාවකට හෝ පුද්ගලික සෞඛ්‍ය වාර්තාවලට සම්බන්ධ කර නැත. සෞඛ්‍ය ගැටලුවක් සඳහා සුදුසුකම් ලත් සෞඛ්‍ය වෘත්තිකයෙකුගෙන් උපදෙස් ලබාගන්න. හදිසි තත්ත්වයක් විය හැකි නම් වහාම හදිසි වෛද්‍ය සේවාවක් ලබාගන්න.",
    ta: "உங்கள் கேள்விக்கு நன்றி. இது MummyAI மாதிரி chatbot மட்டுமே; இது இன்னும் மருத்துவ அறிவுத் தொகுப்போ தனிப்பட்ட சுகாதாரப் பதிவுகளோடு இணைக்கப்படவில்லை. உடல்நலக் கவலைகளுக்கு தகுதியான சுகாதார நிபுணரை அணுகவும். அவசரநிலை என நினைத்தால் உடனடியாக அவசர மருத்துவ உதவியைப் பெறவும்."
  };

  return res.json({
    mode: "demo",
    answer: replies[language],
    disclaimer: "Demo only. Not medical advice. Do not submit real personal health information.",
    nextSteps: [
      "Implement authentication and record-level authorization before adding personal records.",
      "Connect only reviewed health sources before enabling AI answers."
    ]
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled API error:", err.message);
  res.status(err.status || 500).json({
    error: err.status ? err.message : "Something went wrong.",
    code: err.code || "INTERNAL_ERROR"
  });
});

async function start() {
  const databaseStatus = await connectDatabase();
  if (databaseStatus.status === "connected" && process.env.SEED_SYNTHETIC_DATA === "true") {
    try {
      const count = await seedSyntheticRecords();
      console.log(`MongoDB connected. ${count} synthetic sample profiles are ready.`);
    } catch (error) {
      console.error("Synthetic sample data setup failed:", error.message);
    }
  } else if (databaseStatus.status === "not_configured") {
    console.log("MongoDB is not configured. Database-backed sample record tools are unavailable.");
  }

  app.listen(port, () => {
    console.log(`MummyAI API running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("MummyAI startup failed:", error.message);
  process.exitCode = 1;
});
