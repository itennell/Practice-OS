import { stopLocalDatabase } from "../lib/local-db";

// npm run db:stop: stops the built-in database (it keeps running after `next dev` exits).
await stopLocalDatabase();
console.log("Built-in database stopped.");
