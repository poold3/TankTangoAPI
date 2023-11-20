import { CreateRequest, JoinRequest, WssMessage, MessageTypes, StartRoundRequest } from "./requests";
import { CreateResponse, JoinResponse, StartRoundResponse, WssOutMessage } from "./responses";
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
        const wssMessage: WssMessage = JSON.parse(message);
        tank = wssMessage.tank;
        if (wssMessage.messageType == MessageTypes.Game) {
          await lock.acquire(this.port.toString(), () => {
            this.tanks.set(tank.gamerName, tank);
          });
        } else if (wssMessage.messageType == MessageTypes.First) {
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
              const message: WssOutMessage = {
                tanks: Array.from(this.tanks.values()),
                maze: undefined
              }
              const jsonMessage = JSON.stringify(message);
              this.wss.clients.forEach((client: WebSocket) => {
                client.send(jsonMessage);
              });
            }
          });
        }
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
              const message: WssOutMessage = {
                tanks: Array.from(this.tanks.values()),
                maze: undefined
              }
              const jsonMessage = JSON.stringify(message);
              this.wss.clients.forEach((client: WebSocket) => {
                client.send(jsonMessage);
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

  public async sendMaze(maze: Maze): Promise<void> {
    const message: WssOutMessage = {
      tanks: undefined,
      maze: maze
    }
    const jsonMessage = JSON.stringify(message);
    await lock.acquire(this.port.toString(), () => {
      this.wss.clients.forEach((client: WebSocket) => {
        client.send(jsonMessage);
      });
    });
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

export class Room {
  public plusY: boolean;
  public minusY: boolean;
  public plusX: boolean;
  public minusX: boolean;
  public numEdges: number;
  constructor() {
    this.plusY = false;
    this.minusY = false;
    this.plusX = false;
    this.minusX = false;
    this.numEdges = 0;
  }

  reset() {
    this.plusY = false;
    this.minusY = false;
    this.plusX = false;
    this.minusX = false;
    this.numEdges = 0;
  }
}

export class Maze {
  public width: number;
  public height: number;
  public step: number;
  public numRoomsWide: number;
  public numRoomsHigh: number;
  public rooms: Array<Array<Room>>;

  constructor(width: number, height: number, step: number) {
    this.width = width;
    this.height = height;
    this.step = step;
    this.numRoomsWide = this.width / this.step;
    this.numRoomsHigh = this.height / this.step;
    this.rooms = new Array(this.numRoomsHigh);
    for (let i = 0; i < this.numRoomsHigh; ++i) {
      this.rooms[i] = new Array<Room>(this.numRoomsWide);
      for (let j = 0; j < this.numRoomsWide; ++j) {
        this.rooms[i][j] = new Room();
      }
    }
    this.fillMaze();
  }

  fillMaze() {
    //Erase all edges in points
    for (let i = 0; i < this.rooms.length; ++i) {
      for (let j = 0; j < this.rooms[i].length; ++j) {
        this.rooms[i][j].reset();
      }
    }

    //Reinstate maze border edges
    for (let i = 0; i < this.numRoomsWide; ++i) {
      this.rooms[0][i].minusY = true;
      this.rooms[0][i].numEdges += 1;
      this.rooms[this.numRoomsHigh - 1][i].plusY = true;
      this.rooms[this.numRoomsHigh - 1][i].numEdges += 1;
    }

    for (let i = 0; i < this.numRoomsHigh; ++i) {
      this.rooms[i][0].minusX = true;
      this.rooms[i][0].numEdges += 1;
      this.rooms[i][this.numRoomsWide - 1].plusX = true;
      this.rooms[i][this.numRoomsWide - 1].numEdges += 1;
    }

    //Create maze
    const maxEdges = Math.round(this.numRoomsWide * this.numRoomsHigh * 0.75);
    let edgeCount = 0;
    while (edgeCount < maxEdges) {
      const row = Math.floor(Math.random() * this.numRoomsHigh);
      const column = Math.floor(Math.random() * this.numRoomsWide);
      if (this.rooms[row][column].numEdges == 3) {
        continue;
      }
      let edgeType = Math.floor(Math.random() * 4);
      let edgeAssigned = false;
      while (!edgeAssigned) {
        if (edgeType % 4 === 0 && !this.rooms[row][column].minusX) {
          this.rooms[row][column].minusX = true;
          this.rooms[row][column - 1].plusX = true;
          edgeAssigned = true;
          if (this.isMazeValid()) {
            this.rooms[row][column].numEdges += 1;
            this.rooms[row][column - 1].numEdges += 1;
            edgeCount += 1;
          } else {
            this.rooms[row][column].minusX = false;
            this.rooms[row][column - 1].plusX = false;
          }
        } else if (edgeType % 4 === 1 && !this.rooms[row][column].plusX) {
          this.rooms[row][column].plusX = true;
          this.rooms[row][column + 1].minusX = true;
          edgeAssigned = true;
          if (this.isMazeValid()) {
            this.rooms[row][column].numEdges += 1;
            this.rooms[row][column + 1].numEdges += 1;
            edgeCount += 1;
          } else {
            this.rooms[row][column].plusX = false;
            this.rooms[row][column + 1].minusX = false;
          }
        } else if (edgeType % 4 === 2 && !this.rooms[row][column].minusY) {
          this.rooms[row][column].minusY = true;
          this.rooms[row - 1][column].plusY = true;
          edgeAssigned = true;
          if (this.isMazeValid()) {
            this.rooms[row][column].numEdges += 1;
            this.rooms[row - 1][column].numEdges += 1;
            edgeCount += 1;
          } else {
            this.rooms[row][column].minusY = false;
            this.rooms[row - 1][column].plusY = false;
          }
        } else if (edgeType % 4 === 3 && !this.rooms[row][column].plusY) {
          this.rooms[row][column].plusY = true;
          this.rooms[row + 1][column].minusY = true;
          edgeAssigned = true;
          if (this.isMazeValid()) {
            this.rooms[row][column].numEdges += 1;
            this.rooms[row + 1][column].numEdges += 1;
            edgeCount += 1;
          } else {
            this.rooms[row][column].plusY = false;
            this.rooms[row + 1][column].minusY = false;
          }
        }
        edgeType += 1;
      }
    }
  }

  private isMazeValidHelper(row: number, column: number, explored: Array<Array<boolean>>): void {
    if (explored[row][column]) {
      return;
    }
    explored[row][column] = true;
    const room = this.rooms[row][column];
    if (!(room.minusX)) {
      this.isMazeValidHelper(row, column - 1, explored);
    }
    if (!(room.plusX)) {
      this.isMazeValidHelper(row, column + 1, explored);
    }
    if (!(room.minusY)) {
      this.isMazeValidHelper(row - 1, column, explored);
    }
    if (!(room.plusY)) {
      this.isMazeValidHelper(row + 1, column, explored);
    }
  }

  isMazeValid(): boolean {
    const explored = new Array(this.numRoomsHigh);
    for (let i = 0; i < explored.length; ++i) {
      explored[i] = new Array<boolean>(this.numRoomsWide).fill(false);
    }
    
    this.isMazeValidHelper(0, 0, explored);

    for (let i = 0; i < explored.length; ++i) {
      for (let j = 0; j < explored[i].length; ++j) {
        if (!explored[i][j]) {
          return false;
        }
      }
    }
    return true;
  }

}

export async function startRound(startRoundRequest: StartRoundRequest): Promise<StartRoundResponse> {
  const response: StartRoundResponse = {
    success: false,
    message: ""
  }
  try {
    let game: Game | undefined;
    await lock.acquire("games", () => {
      game = games.get(startRoundRequest.gameCode);
    });
    if (!game) {
      response.success = false;
      response.message = "Invalid game code.";
      return response;
    }

    const maze: Maze = new Maze(750, 450, 75);
    await game.sendMaze(maze);


    response.success = true;
  } catch (error) {
    logger.error(error);
    response.success = false;
    response.message = "An error occurred while joining your game. Please try again later.";
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