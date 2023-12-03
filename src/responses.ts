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

export enum WssOutMessageTypes {
  Maze,
  TanksUpdate,
  SelectedTankUpdate,
  GameStateUpdate,
  NewBullet,
  EraseBullet,
  PlayAudio,
  Error
}

export interface WssOutMessage {
  messageType: WssOutMessageTypes,
  data: string
}