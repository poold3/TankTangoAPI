import { Maze, Tank } from "./game";

export interface CreateResponse {
  success: boolean;
  message: string;
  gameCode: string;
  port: number;
}

export interface JoinResponse {
  success: boolean;
  message: string;
  port: number;
}

export interface StartRoundResponse {
  success: boolean;
  message: string;
}

export interface WssOutMessage {
  tanks: Array<Tank> | undefined,
  maze: Maze | undefined
}