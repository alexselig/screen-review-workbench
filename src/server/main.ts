// Development entry (`npm run dev`): Vite in middleware mode with HMR.
import { serve } from "./index";

await serve({ port: Number(process.env.PORT ?? "4173") });
