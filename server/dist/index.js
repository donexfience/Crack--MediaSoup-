"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const fs_1 = __importDefault(require("fs"));
const socket_io_1 = require("socket.io");
const https_1 = require("https");
const createWorker_1 = require("./config/Workers/createWorker");
const config_1 = __importDefault(require("./config/Workers/config"));
class Server {
    constructor(configOptions) {
        const { port, apiPrefix, routes } = configOptions;
        this.app = (0, express_1.default)();
        this.port = port;
        this.routes = routes;
        this.apiPrefix = apiPrefix;
        //init workers, it's where our mediasoup workers will live
        this.workers = null;
        // init router, it's where our 1 router will live
        this.router = null;
        // theProducer will be a global, and whoever produced last
        this.theProducer = null;
        const key = fs_1.default.readFileSync("./src/config/cert.key");
        const cert = fs_1.default.readFileSync("./src/config/cert.crt");
        const options = { key, cert };
        this.httpsServer = (0, https_1.createServer)(options, this.app);
        this.io = new socket_io_1.Server(this.httpsServer, {
            cors: {
                origin: ["http://localhost:3001"],
                methods: ["GET", "POST"],
                credentials: true,
            },
        });
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`API Prefix: ${this.apiPrefix}`);
            yield this.initMediaSoup();
            console.log("MediaSoup initialized with workers:", this.workers);
            try {
                console.log("Data Source has been initialized!");
            }
            catch (err) {
                console.error("Error during Data Source initialization:", err);
                process.exit(1);
            }
            this.app.use(express_1.default.json());
            this.app.use(express_1.default.urlencoded({ extended: true }));
            this.app.use((0, cors_1.default)({
                origin: ["http://localhost:3001"],
                methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
                credentials: true,
                allowedHeaders: [
                    "Origin",
                    "X-Requested-With",
                    "Content-Type",
                    "Accept",
                    "Authorization",
                    "accesstoken",
                    "refreshtoken",
                ],
                exposedHeaders: ["Authorization"],
            }));
            this.app.use((0, morgan_1.default)("tiny"));
            this.app.use(this.apiPrefix, this.routes);
            this.app.get("/", (req, res) => {
                res.status(201).send({
                    message: `Welcome to Initial API! Endpoints available at https://localhost:${this.port}/`,
                });
            });
            this.io.on("connection", (socket) => {
                console.log(`New client connected: ${socket.id}`);
                socket.on("disconnect", () => {
                    console.log(`Client disconnected: ${socket.id}`);
                });
            });
            this.httpsServer.listen(this.port, () => {
                console.log(`HTTPS Server running on port ${this.port}...`);
            });
        });
    }
    initMediaSoup() {
        return __awaiter(this, void 0, void 0, function* () {
            this.workers = yield (0, createWorker_1.createWorkers)();
            this.router = yield this.workers[0].createRouter({
                mediaCodecs: config_1.default.routerMediaCodecs,
            });
        });
    }
    getSocketIO() {
        return this.io;
    }
}
exports.Server = Server;
