import { CreateRequest, JoinRequest } from "./requests";
import { CreateResponse, JoinResponse } from "./responses";

export class Game {
  public gameCode: string;
  public port: number;
  public tanks: Map<string, Tank>;
  constructor(gameCode: string, port: number) {
    this.gameCode = gameCode;
    this.port = port;
    this.tanks = new Map<string, Tank>();
  }

  public gamerNameAvailable(gamerName: string): boolean {
    return !this.tanks.has(gamerName);
  }

  public addTank(newTank: Tank): boolean {
    if (this.tanks.size === 4) {
      return false;
    }
    newTank.color = this.tanks.size + 1;
    this.tanks.set(newTank.gamerName, newTank);
    return true;
  }
}

export class Tank {
  public gamerName: string;
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

export function createNewGame(createRequest: CreateRequest): CreateResponse  {
  const response: CreateResponse = {
    success: false,
    message: "",
    gameCode: "",
    port: -1
  };
  
  const gameCode: string = generateNewGameCode();
  const port: number = getPortNumber();
  
  if (port === -1) {
    response.success = false;
    response.message = "Tank Tango is currently at max capacity. Please try again later.";
    return response;
  }

  const newGame = new Game(gameCode, port);
  const newTank: Tank = new Tank(createRequest.gamerName, createRequest.tankType);
  newGame.addTank(newTank);

  games.set(gameCode, newGame);
  response.success = true;
  response.gameCode = gameCode;
  response.port = port;
  return response;
}

export function joinGame(joinRequest: JoinRequest): JoinResponse {
  const response: JoinResponse = {
    success: false,
    message: "",
    port: -1
  }

  const game = games.get(joinRequest.gameCode);
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

  const newTank: Tank = new Tank(joinRequest.gamerName, joinRequest.tankType);
  if (!game.addTank(newTank)) {
    response.success = false;
    response.message = "This game already has 4 players.";
    return response;
  }

  response.success = true;
  response.port = game.port;
  return response;
}

function generateNewGameCode(): string {
  let gameCode: string = "";
  let available: boolean = false;
  while (!available) {
    const randomNumber: number = Math.floor(100000 + Math.random() * 900000);
    gameCode = randomNumber.toString();
    available = !games.has(gameCode);
  }
  return gameCode;
}

function getPortNumber(): number {
  for (let i = 3001; i <= 3020; ++i) {
    if (!ports.get(i)) {
      ports.set(i, true);
      return i;
    }
  }
  return -1;
}

function endGame(gameCode: string): void {
  const game = games.get(gameCode);
  if (game) {
    ports.set(game.port, false);
    games.delete(gameCode);
    return;
  }
}