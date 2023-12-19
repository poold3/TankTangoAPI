export class Bullet {
  public id: string;
  public positionX: number;
  public positionY: number;
  public heading: number;
  public incrementX: number;
  public incrementY: number;
  public active: number;
  public demolition: boolean;
  public startTime: number;

  constructor(id: string, positionX: number, positionY: number, heading: number, demolition: boolean = false) {
    this.id = id;
    this.positionX = positionX;
    this.positionY = positionY;
    this.heading = heading;
    this.incrementX = BulletInfo.speed * Math.cos(this.heading * Math.PI / -180.0);
    this.incrementY = BulletInfo.speed * Math.sin(this.heading * Math.PI / -180.0);
    this.active = BulletInfo.inactivePeriod;
    this.demolition = demolition;
    this.startTime = Date.now();
  }

  bounceX(): void {
    this.incrementX *= -1;
  }

  bounceY(): void {
    this.incrementY *= -1;
  }

  move(): void {
    if (!this.isActive()) {
      this.active -= 1;
    }
    this.positionX += this.incrementX;
    this.positionY += this.incrementY;
  }

  isActive(): boolean {
    return this.active <= 0;
  }

  isAlive(): boolean {
    return (Date.now() - this.startTime) < BulletInfo.timeAlive;
  }
}

export interface BulletInfoInterface {
  speed: number;
  radius: number;
  inactivePeriod: number;
  timeAlive: number;
}

export const BulletInfo: BulletInfoInterface = {
  speed: 4,
  radius: 2,
  inactivePeriod: 3,
  timeAlive: 10000
}