export interface CreateRequest {
  gamerName: string;
  tankType: number;
}

export interface JoinRequest {
  gamerName: string;
  tankType: number;
  gameCode: string;
}

export enum WssInMessageTypes {
  Connection,
  WaitingRoomUpdate,
  TankUpdate,
  NewBullet,
  PlayAudio,
  NewChatMessage
}

export interface WssInMessage {
  messageType: WssInMessageTypes,
  data: string
}