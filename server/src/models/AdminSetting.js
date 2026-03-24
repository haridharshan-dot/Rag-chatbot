import mongoose from "mongoose";

const adminSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "runtime" },
    ragTopK: { type: Number, default: null },
    ragConfidenceThreshold: { type: Number, default: null },
    ragOutOfScopeThreshold: { type: Number, default: null },
    autoEscalationEnabled: { type: Boolean, default: null },
    microsoftAllowedDomains: [{ type: String }],
    microsoftAllowedEmails: [{ type: String }],
  },
  { timestamps: true }
);

export const AdminSetting = mongoose.model("AdminSetting", adminSettingSchema);
