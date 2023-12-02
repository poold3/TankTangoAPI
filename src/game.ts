import { CreateRequest, JoinRequest, StartRoundRequest, WssInMessage, WssInMessageTypes } from "./requests";
import { CreateResponse, JoinResponse, StartRoundResponse, WssOutMessage, WssOutMessageTypes} from "./responses";
import { WebSocketServer, WebSocket } from "ws";
import AsyncLock from "async-lock";
import { logger } from "./logger";
import https, { Server } from "https";
import fs from "fs";
import { Maze } from "./maze";
import { Tank } from "./tank";
import { timer } from "./timer";
import { Bullet } from "./bullet";
import { Point } from "./point";
const lock = new AsyncLock();

export const enum GameState {
  Waiting,
  Countdown,
  Running
}

export class Game {
  public gameCode: string;
  public port: number;
  public tanks: Map<string, Tank>;
  public wss: WebSocketServer;
  public state: GameState;
  public colorsAvailable: Array<boolean>;
  public runningInterval: number = 0;
  public maze: Maze;

  constructor(gameCode: string, port: number) {
    this.gameCode = gameCode;
    this.port = port;
    this.tanks = new Map<string, Tank>();
    this.state = GameState.Waiting;
    this.colorsAvailable = new Array<boolean>(4).fill(true);
    this.maze = new Maze(0, 0, 1);

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
        const wssMessage: WssInMessage = JSON.parse(message);
        if (wssMessage.messageType === WssInMessageTypes.Connection) {
          tank = JSON.parse(wssMessage.data);
          await lock.acquire(this.port.toString(), () => {
            // If the first to join the game, make admin
            if (this.tanks.size == 0) {
              tank.gameAdmin = true;
            }

            // Assign a color to the new tank
            for (let i = 0; i < 4; ++i) {
              if (this.colorsAvailable[i]) {
                tank.color = i + 1;
                this.colorsAvailable[i] = false;
                break;
              }
            }
            // Add tank to the game
            this.tanks.set(tank.gamerName, tank);
  
            // If the game is in the Waiting state, send a SelectedTanksUpdate out to the clients. This will update the waiting room
            if (this.state === GameState.Waiting) {
              const message: WssOutMessage = {
                messageType: WssOutMessageTypes.SelectedTankUpdate,
                data: JSON.stringify(Array.from(this.tanks.values()))
              }
              const jsonMessage = JSON.stringify(message);
              this.wss.clients.forEach((client: WebSocket) => {
                client.send(jsonMessage);
              });
            }
          });
        } else if (wssMessage.messageType === WssInMessageTypes.TankUpdate) {
          tank = JSON.parse(wssMessage.data);
          await lock.acquire(this.port.toString(), () => {
            if (this.state === GameState.Running) {
              // Replace current tank with new tank
              this.tanks.set(tank.gamerName, tank);
            }
          });
        } else if (wssMessage.messageType === WssInMessageTypes.NewBullet) {
          const newBullet: Bullet = JSON.parse(wssMessage.data);
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.NewBullet,
            data: JSON.stringify(newBullet)
          }
          const jsonMessage = JSON.stringify(message);
          this.wss.clients.forEach((client: WebSocket) => {
            client.send(jsonMessage);
          });
        } else if (wssMessage.messageType === WssInMessageTypes.EraseBullet) {
          const bulletId: string = JSON.parse(wssMessage.data);
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.EraseBullet,
            data: JSON.stringify(bulletId)
          }
          const jsonMessage = JSON.stringify(message);
          this.wss.clients.forEach((client: WebSocket) => {
            client.send(jsonMessage);
          });
        } else if (wssMessage.messageType === WssInMessageTypes.WaitingRoomTankUpdate) {
          tank = JSON.parse(wssMessage.data);
          await lock.acquire(this.port.toString(), () => {
            // Replace current tank with new tank
            this.tanks.set(tank.gamerName, tank);

            // If the game is in the Waiting state(It should be but just a double check), send a SelectedTanksUpdate out to the clients. This will update the waiting room
            if (this.state === GameState.Waiting) {
              const message: WssOutMessage = {
                messageType: WssOutMessageTypes.SelectedTankUpdate,
                data: JSON.stringify(Array.from(this.tanks.values()))
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
            // Delete tank from game
            this.tanks.delete(tank.gamerName);

            // Make tank color available again
            this.colorsAvailable[tank.color - 1] = true;

            if (this.tanks.size > 0) {
              // Still players in the game
              // Reassign the game admin if this tank was the admin
              if (tank.gameAdmin && this.tanks.size > 0) {
                const remainingTanks = Array.from(this.tanks.values());
                const firstTank = remainingTanks[0];
                firstTank.gameAdmin = true;
                this.tanks.set(firstTank.gamerName, firstTank);
              }

              // If the game is in the waiting stage, send a selectedtanksupdate to update the waiting room
              if (this.state === GameState.Waiting) {
                const message: WssOutMessage = {
                  messageType: WssOutMessageTypes.SelectedTankUpdate,
                  data: JSON.stringify(Array.from(this.tanks.values()))
                }
                const jsonMessage = JSON.stringify(message);
                this.wss.clients.forEach((client: WebSocket) => {
                  client.send(jsonMessage);
                });
              }
            } else {
              // No more tanks in the game. Shut down the servers and reset the game structures
              this.wss.close(() => {
                logger.info("Closing wss for port " + this.port.toString());
              });
              server.close(() => {
                logger.info("Closing server for port " + this.port.toString());
              });
              endGame(this.gameCode);
            }
          });
        }
      });
    });

    this.wss.on("error", (error: Error) => {
      logger.error(error);
      // Try to send error message to clients
      const message: WssOutMessage = {
        messageType: WssOutMessageTypes.Error,
        data: JSON.stringify(error.message)
      }
      const jsonMessage = JSON.stringify(message);
      this.wss.clients.forEach((client: WebSocket) => {
        client.send(jsonMessage);
      });

      // Shut down the servers and reset the game structures
      this.wss.close(() => {
        logger.info("Closing wss for port " + this.port.toString());
      });
      server.close(() => {
        logger.info("Closing server for port " + this.port.toString());
      });
      endGame(this.gameCode);
    });

    // Start up websocket server!
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
    this.maze = maze;
    const message: WssOutMessage = {
      messageType: WssOutMessageTypes.Maze,
      data: JSON.stringify(this.maze)
    }
    const jsonMessage = JSON.stringify(message);
    this.wss.clients.forEach((client: WebSocket) => {
      client.send(jsonMessage);
    });
  }

  public async getNumAlive(): Promise<number> {
    let numAlive: number = 0;
    await lock.acquire(this.port.toString(), () => { 
      Array.from(this.tanks.values()).forEach((tank: Tank) => {
        if (tank.alive) {
          numAlive += 1;
        }
      })
    });
    return numAlive;
  }

  public async startRound(): Promise<void> {
    // Create maze
    this.maze = new Maze(850, 510, 85);
    this.maze.createEdges();

    // Send maze to clients
    const message: WssOutMessage = {
      messageType: WssOutMessageTypes.Maze,
      data: JSON.stringify(this.maze)
    }
    const jsonMessage = JSON.stringify(message);
    this.wss.clients.forEach((client: WebSocket) => {
      client.send(jsonMessage);
    });

    // Update tanks for round start
    await lock.acquire(this.port.toString(), () => {
      const tanks: Array<Tank> = Array.from(this.tanks.values());
      const newTankPositions: Array<Point> = new Array<Point>();
      tanks.forEach((tank: Tank) => {
        // Set random starting position
        let positionTaken = true;
        while (positionTaken) {
          const newPosition: Point = new Point((Math.floor(Math.random() * this.maze.numRoomsWide) * this.maze.step) + (this.maze.step / 2), (Math.floor(Math.random() * this.maze.numRoomsHigh) * this.maze.step) + (this.maze.step / 2));
          positionTaken = false;
          for (let i = 0; i < newTankPositions.length; ++i) {
            if (newTankPositions[i].x === newPosition.x && newTankPositions[i].y === newPosition.y) {
              positionTaken = true;
              break;
            }
          }
          if (!positionTaken) {
            newTankPositions.push(newPosition);
            tank.positionX = newPosition.x;
            tank.positionY = newPosition.y;
          }
        }

        // Set random heading
        const heading: number = Math.floor(Math.random() * 360);
        tank.heading = heading;
        tank.turretHeading = heading;

        // Make tank alive and ultimate not active
        tank.alive = true;
        tank.ultimateActive = false;

        // Set tank
        this.tanks.set(tank.gamerName, tank);
      });

      // Send tanks to clients
      const message: WssOutMessage = {
        messageType: WssOutMessageTypes.SelectedTankUpdate,
        data: JSON.stringify(Array.from(this.tanks.values()))
      }
      const jsonMessage = JSON.stringify(message);
      this.wss.clients.forEach((client: WebSocket) => {
        client.send(jsonMessage);
      });

      //Update gameState to countdown
      this.state = GameState.Countdown;
      const stateMessage: WssOutMessage = {
        messageType: WssOutMessageTypes.GameStateUpdate,
        data: JSON.stringify(this.state)
      }
      const stateJsonMessage = JSON.stringify(stateMessage);
      this.wss.clients.forEach((client: WebSocket) => {
        client.send(stateJsonMessage);
      });
    });
  }

  public async startRunning() {
    await timer(3000);
    await lock.acquire(this.port.toString(), () => {
      //Update gameState to running
      this.state = GameState.Running;
      const stateMessage: WssOutMessage = {
        messageType: WssOutMessageTypes.GameStateUpdate,
        data: JSON.stringify(this.state)
      }
      const stateJsonMessage = JSON.stringify(stateMessage);
      this.wss.clients.forEach((client: WebSocket) => {
        client.send(stateJsonMessage);
      });
    });
    
    while (await this.getNumAlive() > 1) {
      await timer(16);
      await lock.acquire(this.port.toString(), () => {
        // Send tanks to clients
        const message: WssOutMessage = {
          messageType: WssOutMessageTypes.TanksUpdate,
          data: JSON.stringify(Array.from(this.tanks.values()))
        }
        const jsonMessage = JSON.stringify(message);
        this.wss.clients.forEach((client: WebSocket) => {
          client.send(jsonMessage);
        });
      });
    }

    await lock.acquire(this.port.toString(), () => {
      const remainingTanks = Array.from(this.tanks.values());
      for (let i = 0; i < remainingTanks.length; ++i) {
        if (remainingTanks[i].alive) {
          remainingTanks[i].score += 1;
          this.tanks.set(remainingTanks[i].gamerName, remainingTanks[i]);
        }
      }
      // Send tanks to clients
      const message: WssOutMessage = {
        messageType: WssOutMessageTypes.SelectedTankUpdate,
        data: JSON.stringify(Array.from(this.tanks.values()))
      }
      const jsonMessage = JSON.stringify(message);
      this.wss.clients.forEach((client: WebSocket) => {
        client.send(jsonMessage);
      });

      //Update gameState to waiting
      this.state = GameState.Waiting;
      const endStateMessage: WssOutMessage = {
        messageType: WssOutMessageTypes.GameStateUpdate,
        data: JSON.stringify(this.state)
      }
      const endStateJsonMessage = JSON.stringify(endStateMessage);
      this.wss.clients.forEach((client: WebSocket) => {
        client.send(endStateJsonMessage);
      });
    });
  }
}

const games: Map<string, Game> = new Map<string, Game>();
const ports: Map<number, boolean> = new Map<number, boolean>();
initializePorts();

function initializePorts(): void {
  // Set all ports as not being used.
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
    game.startRound();
    game.startRunning();

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