import { CreateRequest, JoinRequest, StartRoundRequest, WssInMessage, WssInMessageTypes } from "./requests";
import { CreateResponse, GameUpdateData, JoinResponse, StartRoundResponse, WssOutMessage, WssOutMessageTypes} from "./responses";
import { Server, WebSocket } from "ws";
import AsyncLock from "async-lock";
import { logger } from "./logger";
import { Maze, Room } from "./maze";
import { AssaultTank, DemolitionTank, ScoutTank, Tank, TankInfo, TankTank } from "./tank";
import { timer } from "./timer";
import { Bullet, BulletInfo } from "./bullet";
import { Point, rotatePoint } from "./point";
import { AudioType } from "./audio";
import { IncomingMessage } from "http";
import { Line } from "./line";
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
              // Replace current tank data with new tank data
              for (let i = 0; i < game.tanks.length; ++i) {
                if (game.tanks[i].gamerName === tank.gamerName) {
                  game.tanks[i].ultimateActive = tank.ultimateActive;
                  game.tanks[i].positionX = tank.positionX;
                  game.tanks[i].positionY = tank.positionY;
                  game.tanks[i].heading = tank.heading;
                  game.tanks[i].turretHeading = tank.turretHeading;
                  break;
                }
              }
            });
          }
        } else if (wssMessage.messageType === WssInMessageTypes.NewBullet) {
          const newBullet: Bullet = JSON.parse(wssMessage.data);
          await lock.acquire("bullets" + game.gameCode, () => {
            game.bullets.push(new Bullet(newBullet.id, newBullet.positionX, newBullet.positionY, newBullet.heading, newBullet.demolition));
          });
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.PlayAudio,
            data: JSON.stringify(AudioType.Click)
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
        } else if (wssMessage.messageType === WssInMessageTypes.NewChatMessage) {
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.NewChatMessage,
            data: wssMessage.data
          }
          const jsonMessage = JSON.stringify(message);
          game.clients.forEach((client: WebSocket) => {
            client.send(jsonMessage);
          });
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
  public bullets: Array<Bullet>;
  public state: GameState;
  public colorsAvailable: Array<boolean>;
  public runningInterval: number = 0;
  public maze: Maze;

  constructor(gameCode: string) {
    this.gameCode = gameCode;
    this.clients = new Set<WebSocket>();
    this.tanks = new Array<Tank>();
    this.bullets = new Array<Bullet>();
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
    // Empty bullets
    this.bullets.length = 0;
    
    // Create maze
    this.maze = new Maze(850, 510, 85);
    this.maze.createEdges();
    // Send maze to clients
    this.sendMaze();

    // Update tanks for round start
    await lock.acquire(this.gameCode, () => {
      const newTankPositions: Array<Point> = new Array<Point>();
      for (let i = 0; i < this.tanks.length; ++i) {
        const tankReference: TankInfo = this.getTankReference(this.tanks[i].type);

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

        // Set tank health
        this.tanks[i].health = tankReference.health;
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
      // Move and bounce bullets
      this.updateBullets();

      // Send data to clients
      const data: GameUpdateData = {
        tanks: this.tanks,
        bullets: this.bullets
      }
      const message: WssOutMessage = {
        messageType: WssOutMessageTypes.GameUpdate,
        data: JSON.stringify(data)
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

  public async updateBullets() {
    await lock.acquire("bullets" + this.gameCode, () => {
      //Update bullet positions and collisions
      for (let i = 0; i < this.bullets.length; ++i) {
        // Remove bullet if timeout
        if (!this.bullets[i].isAlive()) {
          this.bullets.splice(i, 1);
          i -= 1;
          continue;
        }

        // Compute bounces
        const roomX = Math.floor(this.bullets[i].positionX / this.maze.step);
        const roomY = Math.floor(this.bullets[i].positionY / this.maze.step);
        const room: Room = this.maze.rooms[roomY][roomX];

        let foundBounce = false;
        let wallErased = false;
        if (room.plusX && ((roomX + 1) * this.maze.step) - this.bullets[i].positionX <= BulletInfo.speed && this.bullets[i].incrementX > 0.0) {
          this.bullets[i].bounceX();
          foundBounce = true;
          if (this.bullets[i].demolition && roomX < this.maze.numRoomsWide - 1) {
            this.maze.rooms[roomY][roomX].plusX = false;
            wallErased = true;
            if (roomX + 1 < this.maze.numRoomsWide) {
              this.maze.rooms[roomY][roomX + 1].minusX = false;
            }
          }
        } else if (room.minusX && this.bullets[i].positionX - (roomX * this.maze.step) <= BulletInfo.speed && this.bullets[i].incrementX < 0.0) {
          this.bullets[i].bounceX();
          foundBounce = true;
          if (this.bullets[i].demolition && roomX > 0) {
            this.maze.rooms[roomY][roomX].minusX = false;
            wallErased = true;
            if (roomX - 1 >= 0) {
              this.maze.rooms[roomY][roomX - 1].plusX = false;
            }
          }
        }
        if (room.plusY && ((roomY + 1) * this.maze.step) - this.bullets[i].positionY <= BulletInfo.speed && this.bullets[i].incrementY > 0.0) {
          this.bullets[i].bounceY();
          foundBounce = true;
          if (this.bullets[i].demolition && roomY < this.maze.numRoomsHigh - 1) {
            this.maze.rooms[roomY][roomX].plusY = false;
            wallErased = true;
            if (roomY + 1 < this.maze.numRoomsHigh) {
              this.maze.rooms[roomY + 1][roomX].minusY = false;
            }
          }
        } else if (room.minusY && this.bullets[i].positionY - (roomY * this.maze.step) <= BulletInfo.speed && this.bullets[i].incrementY < 0.0) {
          this.bullets[i].bounceY();
          foundBounce = true;
          if (this.bullets[i].demolition && roomY > 0) {
            this.maze.rooms[roomY][roomX].minusY = false;
            wallErased = true;
            if (roomY - 1 >= 0) {
              this.maze.rooms[roomY - 1][roomX].plusY = false;
            }
          }
        }

        if (wallErased) {
          this.sendMaze();
          this.bullets.splice(i, 1);
          i -= 1;
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.PlayAudio,
            data: JSON.stringify(AudioType.Click)
          }
          const jsonMessage = JSON.stringify(message);
          this.clients.forEach((client: WebSocket) => {
            client.send(jsonMessage);
          });
          continue;
        }

        //Calculate filled corners
        if (!foundBounce) {
          if (((roomX + 1) * this.maze.step) - this.bullets[i].positionX <= BulletInfo.speed && ((roomY + 1) * this.maze.step) - this.bullets[i].positionY <= BulletInfo.speed && !room.plusX && !room.plusY && roomX + 1 < this.maze.numRoomsWide && roomY + 1 < this.maze.numRoomsHigh && this.maze.rooms[roomY + 1][roomX + 1].minusX && this.maze.rooms[roomY + 1][roomX + 1].minusY) {
            this.bullets[i].bounceX();
            this.bullets[i].bounceY();
            foundBounce = true;
          } else if (((roomX + 1) * this.maze.step) - this.bullets[i].positionX <= BulletInfo.speed && this.bullets[i].positionY - (roomY * this.maze.step) <= BulletInfo.speed && !room.plusX && !room.minusY && roomX + 1 < this.maze.numRoomsWide && roomY - 1 >= 0 && this.maze.rooms[roomY - 1][roomX + 1].minusX && this.maze.rooms[roomY - 1][roomX + 1].plusY) {
            this.bullets[i].bounceX();
            this.bullets[i].bounceY();
            foundBounce = true;
          } else if (this.bullets[i].positionX - (roomX * this.maze.step) <= BulletInfo.speed && ((roomY + 1) * this.maze.step) - this.bullets[i].positionY <= BulletInfo.speed && !room.minusX && !room.plusY && roomX - 1 >= 0 && roomY + 1 < this.maze.numRoomsHigh && this.maze.rooms[roomY + 1][roomX - 1].plusX && this.maze.rooms[roomY + 1][roomX - 1].minusY) {
            this.bullets[i].bounceX();
            this.bullets[i].bounceY();
            foundBounce = true;
          } else if (this.bullets[i].positionX - (roomX * this.maze.step) <= BulletInfo.speed && this.bullets[i].positionY - (roomY * this.maze.step) <= BulletInfo.speed && !room.minusX && !room.minusY && roomX - 1 >= 0 && roomY - 1 >= 0 && this.maze.rooms[roomY - 1][roomX - 1].plusX && this.maze.rooms[roomY - 1][roomX - 1].plusY) {
            this.bullets[i].bounceX();
            this.bullets[i].bounceY();
            foundBounce = true;
          }
        }

        if (foundBounce) {
          const message: WssOutMessage = {
            messageType: WssOutMessageTypes.PlayAudio,
            data: JSON.stringify(AudioType.Click)
          }
          const jsonMessage = JSON.stringify(message);
          this.clients.forEach((client: WebSocket) => {
            client.send(jsonMessage);
          });
        }

        // Move the bullet
        this.bullets[i].move();
      }

      // Is the bullet colliding with a tank
      this.tanks.forEach((tank: Tank) => {
        const tankReference: TankInfo = this.getTankReference(tank.type);

        //Rotate tank vertices
        const rotatedPoints: Array<Point> = new Array<Point>();
        const tankPoint: Point = new Point(tank.positionX, tank.positionY);
        for (let i = 0; i < tankReference.vertices.length; ++i) {
          const rotatedPoint: Point = rotatePoint(tankReference.vertices[i], tankReference.center, (tank.heading - 90) * Math.PI / -180.0);
          rotatedPoints.push(rotatedPoint.subtract(tankReference.center).multiplyScalar(0.75).add(tankPoint));
        }

        // Build rotated edges
        const rotatedEdges: Array<Line> = new Array<Line>();
        for (let i = 0; i < rotatedPoints.length; ++i) {
          if (i < rotatedPoints.length - 1) {
            rotatedEdges.push(new Line(rotatedPoints[i], rotatedPoints[i + 1]));
          } else {
            rotatedEdges.push(new Line(rotatedPoints[i], rotatedPoints[0]));
          }
        }

        for (let i = 0; i < this.bullets.length; ++i) {
          if (this.bullets[i].isActive() && tank.alive && Math.sqrt(Math.pow(this.bullets[i].positionY - tank.positionY, 2) + Math.pow(this.bullets[i].positionX - tank.positionX, 2)) < tankReference.length && this.intersects(new Point(this.bullets[i].positionX, this.bullets[i].positionY), this.maze.step, rotatedEdges)) {
  
            if (tank.type !== 1 || !tank.ultimateActive) {
              tank.health -= 1;
              if (tank.health === 0) {
                tank.alive = false;
                //Tell server to play boom sound
                const message: WssOutMessage = {
                  messageType: WssOutMessageTypes.PlayAudio,
                  data: JSON.stringify(AudioType.Boom)
                }
                const jsonMessage = JSON.stringify(message);
                this.clients.forEach((client: WebSocket) => {
                  client.send(jsonMessage);
                });
 
              } else {
                //Tell server to play hit sound
                const message: WssOutMessage = {
                  messageType: WssOutMessageTypes.PlayAudio,
                  data: JSON.stringify(AudioType.Hit)
                }
                const jsonMessage = JSON.stringify(message);
                this.clients.forEach((client: WebSocket) => {
                  client.send(jsonMessage);
                });
              }
            }
  
            this.bullets.splice(i, 1);
            i -= 1;
          }
        }
      });
    });
  }

  private intersects(point: Point, lineLength: number, edges: Array<Line>): boolean {
    // Build intersection line
    const intersectionLine: Line = new Line(new Point(point.x, point.y), new Point(point.x + lineLength, point.y));

    // If the intersection point is inside or on the edges, correct tank position
    let intersections = 0;
    for (let i = 0; i < edges.length; ++i) {
      if (intersectionLine.p1.y == edges[i].p1.y && intersectionLine.p1.x <= edges[i].p1.x && edges[i].p1.x <= intersectionLine.p2.x) {
        intersections += 1;
      } else if (intersectionLine.p1.y == edges[i].p2.y && intersectionLine.p1.x <= edges[i].p2.x && edges[i].p2.x <= intersectionLine.p2.x) {
        intersections += 1;
      } else if ((intersectionLine.p1.y > edges[i].p1.y && intersectionLine.p1.y < edges[i].p2.y) || (intersectionLine.p1.y < edges[i].p1.y && intersectionLine.p1.y > edges[i].p2.y)) {
        const m = this.correctHeading(Math.atan2((edges[i].p1.y - edges[i].p2.y) * -1.0, edges[i].p1.x - edges[i].p2.x) * 180.0 / Math.PI);
        const m1 = this.correctHeading(Math.atan2((intersectionLine.p1.y - edges[i].p2.y) * -1.0, intersectionLine.p1.x - edges[i].p2.x) * 180.0 / Math.PI);
        const m2 = this.correctHeading(Math.atan2((intersectionLine.p2.y - edges[i].p2.y) * -1.0, intersectionLine.p2.x - edges[i].p2.x) * 180.0 / Math.PI);
        if ((m === m1 && m !== m2) || (m === m2 && m !== m1)) {
          intersections += 1;
        } else if ((m > m1 && m < m2) || (m < m1 && m > m2)) {
          intersections += 1;
        }
      }
    }

    return intersections % 2 === 1;
  }

  private correctHeading(heading: number): number {
    if (heading < 0.0) {
      heading += 360.0;
    } else if (heading >= 360.0) {
      heading -= 360.0;
    }
    return heading;
  }

  public getTankReference(type: number): TankInfo {
    let tankReference: TankInfo;
    if (type == 1) {
      tankReference = TankTank;
    } else if (type == 2) {
      tankReference = AssaultTank;
    } else if (type == 3) {
      tankReference = ScoutTank;
    } else {
      tankReference = DemolitionTank;
    }
    return tankReference;
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