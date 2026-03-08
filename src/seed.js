import { CONFIG } from "./config.js";
import { seedDatabase } from "./db/seed.js";

seedDatabase({ dbPath: CONFIG.dbPath });

// eslint-disable-next-line no-console
console.log(`WiFinder seed data applied to ${CONFIG.dbPath}`);
