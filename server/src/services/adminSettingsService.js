import { env } from "../config/env.js";
import { AdminSetting } from "../models/AdminSetting.js";

const SETTINGS_KEY = "runtime";
const CACHE_TTL_MS = 15000;

let cache = null;
let cacheAt = 0;

function now() {
  return Date.now();
}

function parseList(items) {
  return (items || [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function mergeWithDefaults(doc) {
  return {
    ragTopK: doc?.ragTopK ?? env.ragTopK,
    ragConfidenceThreshold: doc?.ragConfidenceThreshold ?? env.ragConfidenceThreshold,
    ragOutOfScopeThreshold: doc?.ragOutOfScopeThreshold ?? env.ragOutOfScopeThreshold,
    autoEscalationEnabled: doc?.autoEscalationEnabled ?? true,
    otpPreferredChannel: doc?.otpPreferredChannel ?? env.otpPreferredChannel,
    microsoftAuthEnabled: doc?.microsoftAuthEnabled ?? env.microsoftAuthEnabled,
    microsoftAllowedDomains: parseList(doc?.microsoftAllowedDomains?.length ? doc.microsoftAllowedDomains : env.microsoftAllowedDomains),
    microsoftAllowedEmails: parseList(doc?.microsoftAllowedEmails?.length ? doc.microsoftAllowedEmails : env.microsoftAllowedEmails),
  };
}

export async function getRuntimeSettings({ force = false } = {}) {
  if (!force && cache && now() - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  const doc = await AdminSetting.findOne({ key: SETTINGS_KEY }).lean();
  cache = mergeWithDefaults(doc);
  cacheAt = now();
  return cache;
}

export async function updateRuntimeSettings(patch) {
  const update = {};

  if (patch.ragTopK !== undefined) {
    update.ragTopK = Number(patch.ragTopK);
  }
  if (patch.ragConfidenceThreshold !== undefined) {
    update.ragConfidenceThreshold = Number(patch.ragConfidenceThreshold);
  }
  if (patch.ragOutOfScopeThreshold !== undefined) {
    update.ragOutOfScopeThreshold = Number(patch.ragOutOfScopeThreshold);
  }
  if (patch.autoEscalationEnabled !== undefined) {
    update.autoEscalationEnabled = Boolean(patch.autoEscalationEnabled);
  }
  if (patch.otpPreferredChannel !== undefined) {
    const channel = String(patch.otpPreferredChannel || "").trim().toLowerCase();
    update.otpPreferredChannel = channel === "email" ? "email" : "mobile";
  }
  if (patch.microsoftAuthEnabled !== undefined) {
    update.microsoftAuthEnabled = Boolean(patch.microsoftAuthEnabled);
  }
  if (patch.microsoftAllowedDomains !== undefined) {
    update.microsoftAllowedDomains = parseList(Array.isArray(patch.microsoftAllowedDomains) ? patch.microsoftAllowedDomains : String(patch.microsoftAllowedDomains).split(","));
  }
  if (patch.microsoftAllowedEmails !== undefined) {
    update.microsoftAllowedEmails = parseList(Array.isArray(patch.microsoftAllowedEmails) ? patch.microsoftAllowedEmails : String(patch.microsoftAllowedEmails).split(","));
  }

  await AdminSetting.updateOne(
    { key: SETTINGS_KEY },
    { $set: update, $setOnInsert: { key: SETTINGS_KEY } },
    { upsert: true }
  );

  return getRuntimeSettings({ force: true });
}
