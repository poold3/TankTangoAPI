import { CreateRequest, JoinRequest } from "./requests";
import { CreateResponse, JoinResponse } from "./responses";
import { WebSocketServer, WebSocket } from "ws";
import AsyncLock from "async-lock";
import { logger } from "./logger";
import https, { Server } from "https";
import fs from "fs";
const lock = new AsyncLock();

const enum GameState {
  Waiting,
  Running
}

export class Game {
  public gameCode: string;
  public port: number;
  public tanks: Map<string, Tank>;
  public wss: WebSocketServer;
  public state: GameState;
  public colorsAvailable: Array<boolean>;

  constructor(gameCode: string, port: number) {
    this.gameCode = gameCode;
    this.port = port;
    this.tanks = new Map<string, Tank>();
    this.state = GameState.Waiting;
    this.colorsAvailable = new Array<boolean>(4);
    this.colorsAvailable.fill(true);

    const serverOptions = {
      key: fs.readFileSync("./certs/server.key"),
      cert: fs.readFileSync("./certs/server.crt")
    }

    const server = https.createServer(serverOptions);
    this.wss = new WebSocket.Server({ server });

    this.wss.on("connection", (ws: WebSocket) => {
      logger.info("Client connected");

      let tank: Tank;
      ws.on("message", async (message: string) => {
        tank = JSON.parse(message);
        await lock.acquire(this.port.toString(), () => {
          if (this.tanks.size == 0) {
            tank.gameAdmin = true;
          }
          if (tank.color == 0) {
            for (let i = 0; i < 4; ++i) {
              if (this.colorsAvailable[i]) {
                tank.color = i + 1;
                this.colorsAvailable[i] = false;
                break;
              }
            }
          }
          this.tanks.set(tank.gamerName, tank);

          if (this.state === GameState.Waiting) {
            this.wss.clients.forEach((client: WebSocket) => {
              client.send(JSON.stringify(Array.from(this.tanks.values())));
            });
          }
        });
      });

      ws.on("close", async () => {
        if (tank) {
          await lock.acquire(this.port.toString(), () => {
            this.tanks.delete(tank.gamerName);
            this.colorsAvailable[tank.color - 1] = true;
            if (tank.gameAdmin && this.tanks.size > 0) {
              const remainingTanks = Array.from(this.tanks.values());
              const firstTank = remainingTanks[0];
              firstTank.gameAdmin = true;
              this.tanks.set(firstTank.gamerName, firstTank);
            }
  
            if (this.state === GameState.Waiting) {
              this.wss.clients.forEach((client: WebSocket) => {
                client.send(JSON.stringify(Array.from(this.tanks.values())));
              });
            }
          });

          const numTanks: number = await this.numTanks();
          if (numTanks === 0) {
            this.wss.close(() => {
              logger.info("Closing wss for port " + this.port.toString());
            });
            server.close(() => {
              logger.info("Closing server for port " + this.port.toString());
            });
            endGame(this.gameCode);
          }
        }
      });
    });

    this.wss.on("error", (error: Error) => {
      logger.error(error);
    });

    server.listen(this.port, ()=> {
      logger.info("Server is listening on " + this.port.toString());
    })
  }

  public async gamerNameAvailable(gamerName: string): Promise<boolean> {
    let available: boolean = false;
    await lock.acquire(this.port.toString(), () => {
      available = !this.tanks.has(gamerName);
    });
    return available;
  }

  public async numTanks(): Promise<number> {
    let numTanks: number = -1;
    await lock.acquire(this.port.toString(), () => {
      numTanks = this.tanks.size;
    });
    return numTanks;
  }


}

export class Tank {
  public gamerName: string;
  public gameAdmin: boolean = false;
  public type: number;
  public alive: boolean = false;
  public positionX: number = 0;
  public positionY: number = 0;
  public heading: number = 0.0;
  public turretHeading: number = 0.0;
  public color: number = 0;

  constructor(gamerName: string, type: number) {
    this.gamerName = gamerName;
    this.type = type;
  }
}

const games: Map<string, Game> = new Map<string, Game>();
const ports: Map<number, boolean> = new Map<number, boolean>();
initializePorts();

function initializePorts(): void {
  for (let i = 3001; i <= 3020; ++i) {
    ports.set(i, false);
  }
}

export async function createNewGame(createRequest: CreateRequest): Promise<CreateResponse>  {
  const response: CreateResponse = {
    success: false,
    message: "",
    gameCode: "",
    port: -1
  };

  try {
    const gameCode: string = await generateNewGameCode();
    const port: number = await getPortNumber();
    
    if (port === -1) {
      response.success = false;
      response.message = "Tank Tango is currently at max capacity. Please try again later.";
      return response;
    }
  
    const newGame = new Game(gameCode, port);
  
    await lock.acquire("games", () => {
      games.set(gameCode, newGame);
    });
  
    response.success = true;
    response.gameCode = gameCode;
    response.port = port;
    
  } catch (error) {
    logger.error(error);
    response.success = false;
    response.message = "An error occurred while creating your game. Please try again later.";
    response.gameCode = "";
    response.port = -1;
  }
  return response;
}

export async function joinGame(joinRequest: JoinRequest): Promise<JoinResponse> {
  const response: JoinResponse = {
    success: false,
    message: "",
    port: -1
  }
  try {
    let game: Game | undefined;
    await lock.acquire("games", () => {
      game = games.get(joinRequest.gameCode);
    });
    if (!game) {
      response.success = false;
      response.message = "Invalid game code.";
      return response;
    }

    if (!(await game.gamerNameAvailable(joinRequest.gamerName))) {
      response.success = false;
      response.message = "That gamer name is already taken.";
      return response;
    }

    if (game.state == GameState.Running) {
      response.success = false;
      response.message = "Their is currently a round in progress. Please join again between rounds.";
      return response;
    }

    const newTank: Tank = new Tank(joinRequest.gamerName, joinRequest.tankType);
    if ((await game.numTanks()) === 4) {
      response.success = false;
      response.message = "This game already has 4 players.";
      return response;
    }

    response.success = true;
    response.port = game.port;
  } catch (error) {
    logger.error(error);
    response.success = false;
    response.message = "An error occurred while joining your game. Please try again later.";
    response.port = -1;
  }
  return response;
}

async function generateNewGameCode(): Promise<string> {
  let gameCode: string = "";
  let available: boolean = false;
  while (!available) {
    const randomNumber: number = Math.floor(100000 + Math.random() * 900000);
    gameCode = randomNumber.toString();
    await lock.acquire("games", () => {
      available = !games.has(gameCode);
    });
  }
  return gameCode;
}

async function getPortNumber(): Promise<number> {
  let port: number = -1;
  await lock.acquire("ports", () => {
    for (let i = 3001; i <= 3020; ++i) {
      if (!ports.get(i)) {
        ports.set(i, true);
        port = i;
        break;
      }
    }
  })
  return port;
}

async function endGame(gameCode: string): Promise<void> {
  let game: Game | undefined;
  let port: number = -1;
  await lock.acquire("games", () => {
    game = games.get(gameCode);
    if (game) {
      port = game.port;
      games.delete(gameCode);
    }
  });

  if (port !== -1) {
    await lock.acquire("ports", () => {
      ports.set(port, false);
    });
  }
}