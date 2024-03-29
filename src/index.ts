import https from "https";
import express, { Application } from "express";
import fs from "fs";
import bodyParser from "body-parser";
import { setRoutes } from "./routes";
import { logger } from "./logger";
import { PORT_NUMBER, setUpWebSocket } from "./game";
import { WebSocket } from "ws";

const app: Application = express();
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', 'https://127.0.0.1:4200');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

setRoutes(app);

const sslOptions = {
  key: fs.readFileSync("./certs/server.key"),
  cert: fs.readFileSync("./certs/server.crt")
}

const port: number = PORT_NUMBER;
const server = https.createServer(sslOptions, app);
const wss = new WebSocket.Server({ server });
setUpWebSocket(wss);

server.listen(port);
server.on("listening", onListening);

function onListening(): void {
  logger.info(`API Server is listening on port ${port}!`);
}
