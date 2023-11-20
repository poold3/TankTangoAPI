import { Tank } from "./game";

export interface CreateRequest {
  gamerName: string;
  tankType: number;
}

export interface JoinRequest {
  gamerName: string;
  tankType: number;
  gameCode: string;
}

export interface StartRoundRequest {
  gameCode: string;
}

export enum MessageTypes {
  First,
  Game
}

export interface WssMessage {
  messageType: MessageTypes,
  tank: Tank
}