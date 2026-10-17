import { app } from "./app.js";
import { config } from "./config/env.js";
import { initializePrisma } from "./db/prisma.js";

await initializePrisma();

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
