const mongoose = require("mongoose");

const childSchema = new mongoose.Schema({
  childId: { type: String, required: true, unique: true, immutable: true },
  displayName: { type: String, required: true, maxlength: 80 },
  dateOfBirth: { type: Date, required: true },
  isSynthetic: { type: Boolean, required: true, immutable: true },
  visits: [{
    date: { type: Date, required: true },
    type: { type: String, required: true, maxlength: 80 },
    note: { type: String, required: true, maxlength: 500 }
  }]
}, {
  collection: "child_records",
  timestamps: true,
  strict: "throw"
});

const ChildRecord = mongoose.models.ChildRecord
  || mongoose.model("ChildRecord", childSchema);

const state = {
  status: "not_configured",
  database: process.env.MONGODB_DB || "mummyai",
  error: null
};

mongoose.connection.on("disconnected", () => {
  state.status = "disconnected";
  state.error = "MongoDB connection was lost.";
});

mongoose.connection.on("connected", () => {
  state.status = "connected";
  state.error = null;
});

const syntheticRecords = [
  {
    childId: "demo-child-001",
    displayName: "Demo Child A",
    dateOfBirth: new Date("2022-06-15T00:00:00.000Z"),
    isSynthetic: true,
    visits: [
      {
        date: new Date("2025-02-12T00:00:00.000Z"),
        type: "Example clinic visit",
        note: "Fictional sample entry. No clinical assessment or advice is recorded."
      },
      {
        date: new Date("2025-08-18T00:00:00.000Z"),
        type: "Example follow-up visit",
        note: "Fictional sample entry. No clinical assessment or advice is recorded."
      }
    ]
  },
  {
    childId: "demo-child-002",
    displayName: "Demo Child B",
    dateOfBirth: new Date("2024-01-20T00:00:00.000Z"),
    isSynthetic: true,
    visits: [
      {
        date: new Date("2025-01-22T00:00:00.000Z"),
        type: "Example clinic visit",
        note: "Fictional sample entry. No clinical assessment or advice is recorded."
      }
    ]
  }
];

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    state.status = "not_configured";
    state.error = null;
    return getDatabaseStatus();
  }

  try {
    await mongoose.connect(uri, {
      dbName: state.database,
      serverSelectionTimeoutMS: 5000
    });
    state.status = "connected";
    state.error = null;
  } catch (error) {
    state.status = "error";
    state.error = "Could not connect to MongoDB. Check the URI, Atlas network access, and database user.";
    console.error("MongoDB connection failed:", error.name, error.code || "CONNECTION_ERROR");
  }

  return getDatabaseStatus();
}

async function seedSyntheticRecords() {
  if (process.env.SEED_SYNTHETIC_DATA !== "true") return 0;
  if (state.status !== "connected") {
    throw new Error("Synthetic records cannot be seeded because MongoDB is not connected.");
  }

  for (const record of syntheticRecords) {
    await ChildRecord.updateOne(
      { childId: record.childId, isSynthetic: true },
      { $setOnInsert: record },
      { upsert: true, runValidators: true }
    );
  }
  return syntheticRecords.length;
}

function assertDatabaseAvailable() {
  if (state.status !== "connected" || mongoose.connection.readyState !== 1) {
    const notConfigured = state.status === "not_configured";
    const error = new Error(notConfigured
      ? "Record tools need MongoDB. Configure MONGODB_URI in backend/.env."
      : state.error || "MongoDB is unavailable.");
    error.code = notConfigured ? "DATABASE_NOT_CONFIGURED" : "DATABASE_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
}

async function listSyntheticChildren() {
  assertDatabaseAvailable();
  return ChildRecord.find({ isSynthetic: true })
    .select("childId displayName dateOfBirth visits isSynthetic")
    .sort({ childId: 1 })
    .lean()
    .exec();
}

async function getSyntheticChild(childId) {
  assertDatabaseAvailable();
  return ChildRecord.findOne({ childId, isSynthetic: true })
    .select("childId displayName dateOfBirth visits isSynthetic")
    .lean()
    .exec();
}

function getDatabaseStatus() {
  return {
    status: state.status,
    database: state.database,
    syntheticDataEnabled: process.env.SEED_SYNTHETIC_DATA === "true",
    error: state.error
  };
}

module.exports = {
  connectDatabase,
  getDatabaseStatus,
  getSyntheticChild,
  listSyntheticChildren,
  seedSyntheticRecords
};
