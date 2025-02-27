import { Server } from "./index";
import dotenv from "dotenv";
import { AppRoutes } from "./routes/routes";

dotenv.config();
(() => {
  main();
})();

function main(): void {
  const apiPrefix = process.env.API_PREFIX || "/api";
  const port = Number(process.env.PORT) || 3099;
  const server = new Server({
    routes: AppRoutes.routes,
    apiPrefix: apiPrefix,
    port: port,
  });

  void server.start();
}
