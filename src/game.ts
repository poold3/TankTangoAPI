import { CreateRequest, JoinRequest, StartRoundRequest, WssInMessage, WssInMessageTypes } from "./requests";
import { CreateResponse, JoinResponse, StartRoundResponse, WssOutMessage, WssOutMessageTypes} from "./responses";
import { Server, WebSocket } from "ws";
import AsyncLock from "async-lock";
import { logger } from "./logger";
import { Maze } from "./maze";
import { Tank } from "./tank";
import { timer } from "./timer";
import { Bullet } from "./bullet";
import { Point } from "./point";
import { AudioType } from "./audio";
import { IncomingMessage } from "http";
const lock = new AsyncLock();

export const PORT_NUMBER = 3000;
export const MAX_NUM_GAMES = 20;

const games: Map<string, Game> = new Map<string, Game>();

export function setUpWebSocket(wss: Server<typeof WebSocket, typeof IncomingMessage>) {
  wss.on("connection", async (ws: WebSocket, request: Request) => {
    const gameCode: string = request.url.split("/")[1];
    const game = games.get(gameCode);
  
    if (game) {
      // Add client to the game
      //logger.info("Client connected to game: " + gameCode);
      game.addClient(ws);
  
      let tank: Tank;
      ws.on("message", async (message: string) => {
        const wssMessage: WssInMessage = JSON.parse(message);
        if (wssMessage.messageType === WssInMessageTypes.Connection) {
          tank = JSON.parse(wssMessage.data);
          await lock.acquire(gameCode, () => {
            // If the first to join the game, make admin
            if (game.tanks.length === 0) {
              tank.gameAdmin = true;
            }
  
            // Assign a color to the new tank
            for (let i = 0; i < 4; ++i) {
              if (game.colorsAvailable[i]) {
                tank.color = i + 1;
                game.colorsAvailable[i] = false;
                break;
              }
            }
            // Add tank to the game
            game.tanks.push(tank);
  
            // If the game is in the Waiting state, send a SelectedTanksUpdate out to the clients. This will update the waiting room
            if (game.state === GameState.Waiting) {
              const message: WssOutMessage = {
                messageType: WssOutMessageTypes.SelectedTankUpdate,
                data: JSON.stringify(game.tanks)
              }
              const jsonMessage = JSON.stringify(message);
              game.clients.forEach((client: WebSocket) => {
                client.send(jsonMessage);
              });
            }
          });
        } else if (wssMessage.messageType === WssInMessageTypes.TankUpdate) {
          tank = JSON.parse(wssMessage.data);
          if (game.state === GameState.Running) {
            await lock.acquire(gameCode, () => {
              // Replace current tank with new tank
              for (let i = 0; i < game.tanks.length; ++i) {
                if (game.tanks[i].gamerName === tank.gamerName) {
                  game.tanks[i] = tank;
                  break;
                }
              }
            });
          }
        } else if (wssMessage.messageType === WssInMessageTypes.NewBullet) {
          const newBullet: Bullet = JSON.parse(wssMessage.data);
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.NewBullet,
            data: JSON.stringify(newBullet)
          }
          const jsonMessage = JSON.stringify(message);
          game.clients.forEach((client: WebSocket) => {
            client.send(jsonMessage);
          });
        } else if (wssMessage.messageType === WssInMessageTypes.EraseBullet) {
          const bulletId: string = JSON.parse(wssMessage.data);
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.EraseBullet,
            data: JSON.stringify(bulletId)
          }
          const jsonMessage = JSON.stringify(message);
          game.clients.forEach((client: WebSocket) => {
            client.send(jsonMessage);
          });
        } else if (wssMessage.messageType === WssInMessageTypes.PlayAudio) {
          const audioType: AudioType = JSON.parse(wssMessage.data);
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.PlayAudio,
            data: JSON.stringify(audioType)
          }
          const jsonMessage = JSON.stringify(message);
          game.clients.forEach((client: WebSocket) => {
            client.send(jsonMessage);
          });
        } else if (wssMessage.messageType === WssInMessageTypes.WaitingRoomTankUpdate) {
          tank = JSON.parse(wssMessage.data);
          await lock.acquire(gameCode, () => {
            // Replace current tank with new tank
            for (let i = 0; i < game.tanks.length; ++i) {
              if (game.tanks[i].gamerName === tank.gamerName) {
                game.tanks[i] = tank;
                break;
              }
            }
          });
          // If the game is in the Waiting state(It should be but just a double check), send a SelectedTanksUpdate out to the clients. This will update the waiting room
          if (game.state === GameState.Waiting) {
            const message: WssOutMessage = {
              messageType: WssOutMessageTypes.SelectedTankUpdate,
              data: JSON.stringify(game.tanks)
            }
            const jsonMessage = JSON.stringify(message);
            game.clients.forEach((client: WebSocket) => {
              client.send(jsonMessage);
            });
          }
        }
      });
  
      ws.on("close", async () => {
        game.deleteClient(ws);
        if (tank) {
          await lock.acquire(gameCode, () => {
            // Delete tank from game
            for (let i = 0; i < game.tanks.length; ++i) {
              if (game.tanks[i].gamerName === tank.gamerName) {
                game.tanks.splice(i, 1);
                break;
              }
            }
  
            // Make tank color available again
            game.colorsAvailable[tank.color - 1] = true;
  
            if (game.tanks.length > 0) {
              // Still players in the game
              // Reassign the game admin if this tank was the admin
              if (tank.gameAdmin) {
                game.tanks[0].gameAdmin = true;
              }
  
              // If the game is in the waiting stage, send a selectedtanksupdate to update the waiting room
              if (game.state === GameState.Waiting) {
                const message: WssOutMessage = {
                  messageType: WssOutMessageTypes.SelectedTankUpdate,
                  data: JSON.stringify(game.tanks)
                }
                const jsonMessage = JSON.stringify(message);
                game.clients.forEach((client: WebSocket) => {
                  client.send(jsonMessage);
                });
              }
            } else {
              // No more tanks in the game. Shut down the servers and reset the game structures
              endGame(gameCode);
            }
          });
        }
      });
  
    } else {
      logger.error("INVALID GAME CODE: " + gameCode);
      // Try to send error message to clients
      const errorMessage: WssOutMessage = {
        messageType: WssOutMessageTypes.Error,
        data: JSON.stringify("INVALID GAME CODE: " + gameCode)
      }
      const jsonErrorMessage = JSON.stringify(errorMessage);
      ws.send(jsonErrorMessage);
      ws.terminate();
    }
  });
  
  wss.on("error", (error: Error) => {
    logger.error(error);
    // Try to send error message to clients
    const message: WssOutMessage = {
      messageType: WssOutMessageTypes.Error,
      data: JSON.stringify(error.message)
    }
    const jsonMessage = JSON.stringify(message);
    wss.clients.forEach((client: WebSocket) => {
      client.send(jsonMessage);
    });
  
    // Shut down the servers and reset the game structures
    Array.from(games.values()).forEach((game: Game) => {
      endGame(game.gameCode);
    })
  });
}

export const enum GameState {
  Waiting,
  Countdown,
  Running
}

export class Game {
  public gameCode: string;
  public clients: Set<WebSocket>;
  public tanks: Array<Tank>;
  public state: GameState;
  public colorsAvailable: Array<boolean>;
  public runningInterval: number = 0;
  public maze: Maze;

  constructor(gameCode: string) {
    this.gameCode = gameCode;
    this.clients = new Set<WebSocket>();
    this.tanks = new Array<Tank>();
    this.state = GameState.Waiting;
    this.colorsAvailable = new Array<boolean>(4).fill(true);
    this.maze = new Maze(0, 0, 1);
  }

  public async addClient(ws: WebSocket) {
    await lock.acquire(this.gameCode, () => {
      this.clients.add(ws);
    });
  }

  public async deleteClient(ws: WebSocket): Promise<boolean> {
    let removed = false;
    await lock.acquire(this.gameCode, () => {
      removed = this.clients.delete(ws);
    });
    return removed;
  }

  public gamerNameAvailable(gamerName: string): boolean {
    for (let i = 0; i < this.tanks.length; ++i) {
      if (this.tanks[i].gamerName === gamerName) {
        return false;
      }
    }
    return true;
  }

  public sendMaze(): void {
    const message: WssOutMessage = {
      messageType: WssOutMessageTypes.Maze,
      data: JSON.stringify(this.maze)
    }
    const jsonMessage = JSON.stringify(message);
    this.clients.forEach((client: WebSocket) => {
      client.send(jsonMessage);
    });
  }

  public getNumAlive(): number {
    let numAlive: number = 0;
    this.tanks.forEach((tank: Tank) => {
      if (tank.alive) {
        numAlive += 1;
      }
    })
    return numAlive;
  }

  public async startRound() {
    // Create maze
    this.maze = new Maze(850, 510, 85);
    this.maze.createEdges();
    // Send maze to clients
    this.sendMaze();

    // Update tanks for round start
    await lock.acquire(this.gameCode, () => {
      const newTankPositions: Array<Point> = new Array<Point>();
      for (let i = 0; i < this.tanks.length; ++i) {
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
            this.tanks[i].positionX = newPosition.x;
            this.tanks[i].positionY = newPosition.y;
          }
        }

        // Set random heading
        const heading: number = Math.floor(Math.random() * 360);
        this.tanks[i].heading = heading;
        this.tanks[i].turretHeading = heading;

        // Make tank alive and ultimate not active
        this.tanks[i].alive = true;
        this.tanks[i].ultimateActive = false;
      }

      // Send tanks to clients
      const message: WssOutMessage = {
        messageType: WssOutMessageTypes.SelectedTankUpdate,
        data: JSON.stringify(this.tanks)
      }
      const jsonMessage = JSON.stringify(message);
      this.clients.forEach((client: WebSocket) => {
        client.send(jsonMessage);
      });

      //Update gameState to countdown
      this.state = GameState.Countdown;
      const stateMessage: WssOutMessage = {
        messageType: WssOutMessageTypes.GameStateUpdate,
        data: JSON.stringify(this.state)
      }
      const stateJsonMessage = JSON.stringify(stateMessage);
      this.clients.forEach((client: WebSocket) => {
        client.send(stateJsonMessage);
      });
    });
  }

  public async startRunning() {
    await timer(1900);
    await lock.acquire(this.gameCode, () => {
      //Update gameState to running
      this.state = GameState.Running;
      const stateMessage: WssOutMessage = {
        messageType: WssOutMessageTypes.GameStateUpdate,
        data: JSON.stringify(this.state)
      }
      const stateJsonMessage = JSON.stringify(stateMessage);
      this.clients.forEach((client: WebSocket) => {
        client.send(stateJsonMessage);
      });
    });
    
    while (this.getNumAlive() > 1) {
      await timer(16);
      // Send tanks to clients
      const message: WssOutMessage = {
        messageType: WssOutMessageTypes.TanksUpdate,
        data: JSON.stringify(this.tanks)
      }
      const jsonMessage = JSON.stringify(message);
      this.clients.forEach((client: WebSocket) => {
        client.send(jsonMessage);
      });
    }

    await lock.acquire(this.gameCode, async (): Promise<void> => {
      //Update gameState to waiting
      this.state = GameState.Waiting;
      await timer(1000);
      for (let i = 0; i < this.tanks.length; ++i) {
        if (this.tanks[i].alive) {
          this.tanks[i].score += 1;
        }
      }
      // Send tanks to clients
      const message: WssOutMessage = {
        messageType: WssOutMessageTypes.SelectedTankUpdate,
        data: JSON.stringify(this.tanks)
      }
      const jsonMessage = JSON.stringify(message);
      this.clients.forEach((client: WebSocket) => {
        client.send(jsonMessage);
      });

      // Send game state
      const endStateMessage: WssOutMessage = {
        messageType: WssOutMessageTypes.GameStateUpdate,
        data: JSON.stringify(this.state)
      }
      const endStateJsonMessage = JSON.stringify(endStateMessage);
      this.clients.forEach((client: WebSocket) => {
        client.send(endStateJsonMessage);
      });
    });
  }
}

export async function createNewGame(createRequest: CreateRequest): Promise<CreateResponse>  {
  const response: CreateResponse = {
    success: false,
    message: "",
    gameCode: ""
  };

  try {
    const gameCode: string = await generateNewGameCode();
    
    if (games.size >= MAX_NUM_GAMES) {
      response.success = false;
      response.message = "Tank Tango is currently at max capacity. Please try again later.";
      return response;
    }

    const newGame = new Game(gameCode);
  
    await lock.acquire("games", () => {
      games.set(gameCode, newGame);
    });

    logger.info("Created new game: " + gameCode);
  
    response.success = true;
    response.gameCode = gameCode;
    
  } catch (error) {
    logger.error(error);
    response.success = false;
    response.message = "An error occurred while creating your game. Please try again later.";
    response.gameCode = "";
  }
  return response;
}

export async function joinGame(joinRequest: JoinRequest): Promise<JoinResponse> {
  const response: JoinResponse = {
    success: false,
    message: ""
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

    if (!game.gamerNameAvailable(joinRequest.gamerName)) {
      response.success = false;
      response.message = "That gamer name is already taken.";
      return response;
    }

    if (game.state == GameState.Running) {
      response.success = false;
      response.message = "There is currently a round in progress. Please join again between rounds.";
      return response;
    }

    if (game.tanks.length === 4) {
      response.success = false;
      response.message = "This game already has 4 players.";
      return response;
    }

    response.success = true;
  } catch (error) {
    logger.error(error);
    response.success = false;
    response.message = "An error occurred while joining your game. Please try again later.";
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

async function endGame(gameCode: string): Promise<void> {
  logger.info("Ending game: " + gameCode);
  let game: Game | undefined;
  await lock.acquire("games", () => {
    game = games.get(gameCode);
    if (game) {
      games.delete(gameCode);
    }
  });
}