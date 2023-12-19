import { Bullet } from "./bullet";
import { Tank } from "./tank";

export interface CreateResponse {
  success: boolean;
  message: string;
  gameCode: string;
}

export interface JoinResponse {
  success: boolean;
  message: string;
}

export interface StartRoundResponse {
  success: boolean;
  message: string;
}

export enum WssOutMessageTypes {
  Maze,
  GameUpdate,
  SelectedTankUpdate,
  GameStateUpdate,
  PlayAudio,
  NewChatMessage,
  Error
}

export interface WssOutMessage {
  messageType: WssOutMessageTypes,
  data: string
}

export interface GameUpdateData {
  tanks: Array<Tank>,
  bullets: Array<Bullet>
}