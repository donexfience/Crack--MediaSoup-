"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = require("./routes/routes");
dotenv_1.default.config();
(() => {
    main();
})();
function main() {
    const apiPrefix = process.env.API_PREFIX || "/api";
    const port = Number(process.env.PORT) || 3000;
    const server = new index_1.Server({
        routes: routes_1.AppRoutes.routes,
        apiPrefix: apiPrefix,
        port: port,
    });
    void server.start();
}
