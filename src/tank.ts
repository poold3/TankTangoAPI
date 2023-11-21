export class Tank {
  public gamerName: string;
  public gameAdmin: boolean = false;
  public type: number;
  public score: number = 0;
  public ultimateActive: boolean = false;
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