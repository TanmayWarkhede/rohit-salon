// Usage: npm run create-admin -- you@example.com YourStrongPassword
import "dotenv/config";
import crypto from "node:crypto";
import { MongoClient } from "mongodb";
const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) { console.error("Usage: npm run create-admin -- <email> <password (8+ chars)>"); process.exit(1); }
const salt = crypto.randomBytes(16).toString("hex");
const hash = salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex");
const client = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017");
await client.connect();
await client.db(process.env.DB_NAME || "rohit_salon").collection("admins").updateOne({ _id: email.toLowerCase() }, { $set: { hash } }, { upsert: true });
console.log("Admin saved:", email.toLowerCase()); await client.close();
