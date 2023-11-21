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

export enum WssInMessageTypes {
  Connection,
  WaitingRoomTankUpdate,
  TankUpdate
}

export interface WssInMessage {
  messageType: WssInMessageTypes,
  data: string
}