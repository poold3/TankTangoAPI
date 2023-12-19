import { Line } from "./line";
import { Point } from "./point";

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
  public health: number = 0;

  constructor(gamerName: string, type: number) {
    this.gamerName = gamerName;
    this.type = type;
  }
}

export interface TankInfo {
  type: number;
  health: number;
  speed: number;
  turnSpeed: number;
  fireRate: number;
  width: number;
  length: number;
  turretLength: number;
  center: Point;
  vertices: Array<Point>;
  edges: Array<Line>;
}

export const TankTank: TankInfo = {
  type: 1,
  health: 4,
  speed: 2,
  turnSpeed: 3,
  fireRate: 3,
  width: 39,
  length: 55,
  turretLength: 28,
  center: new Point(20, 28),
  vertices: new Array<Point>(),
  edges: new Array<Line>()
}
TankTank.vertices.push(new Point(5, 1));
TankTank.vertices.push(new Point(1, 13));
TankTank.vertices.push(new Point(1, 48));
TankTank.vertices.push(new Point(5, 55));
TankTank.vertices.push(new Point(35, 55));
TankTank.vertices.push(new Point(39, 48));
TankTank.vertices.push(new Point(39, 13));
TankTank.vertices.push(new Point(35, 1));
TankTank.edges.push(new Line(TankTank.vertices[0], TankTank.vertices[1]));
TankTank.edges.push(new Line(TankTank.vertices[1], TankTank.vertices[2]));
TankTank.edges.push(new Line(TankTank.vertices[2], TankTank.vertices[3]));
TankTank.edges.push(new Line(TankTank.vertices[3], TankTank.vertices[4]));
TankTank.edges.push(new Line(TankTank.vertices[4], TankTank.vertices[5]));
TankTank.edges.push(new Line(TankTank.vertices[5], TankTank.vertices[6]));
TankTank.edges.push(new Line(TankTank.vertices[6], TankTank.vertices[7]));
TankTank.edges.push(new Line(TankTank.vertices[7], TankTank.vertices[0]));

export const AssaultTank: TankInfo = {
  type: 2,
  health: 3,
  speed: 2,
  turnSpeed: 3,
  fireRate: 4,
  width: 35,
  length: 49,
  turretLength: 25,
  center: new Point(18, 25),
  vertices: new Array<Point>(),
  edges: new Array<Line>()
}
AssaultTank.vertices.push(new Point(4, 1));
AssaultTank.vertices.push(new Point(1, 24));
AssaultTank.vertices.push(new Point(1, 31));
AssaultTank.vertices.push(new Point(5, 49));
AssaultTank.vertices.push(new Point(31, 49));
AssaultTank.vertices.push(new Point(35, 31));
AssaultTank.vertices.push(new Point(35, 24));
AssaultTank.vertices.push(new Point(32, 1));
AssaultTank.edges.push(new Line(AssaultTank.vertices[0], AssaultTank.vertices[1]));
AssaultTank.edges.push(new Line(AssaultTank.vertices[1], AssaultTank.vertices[2]));
AssaultTank.edges.push(new Line(AssaultTank.vertices[2], AssaultTank.vertices[3]));
AssaultTank.edges.push(new Line(AssaultTank.vertices[3], AssaultTank.vertices[4]));
AssaultTank.edges.push(new Line(AssaultTank.vertices[4], AssaultTank.vertices[5]));
AssaultTank.edges.push(new Line(AssaultTank.vertices[5], AssaultTank.vertices[6]));
AssaultTank.edges.push(new Line(AssaultTank.vertices[6], AssaultTank.vertices[7]));
AssaultTank.edges.push(new Line(AssaultTank.vertices[7], AssaultTank.vertices[0]));

export const ScoutTank: TankInfo = {
  type: 3,
  health: 2,
  speed: 3,
  turnSpeed: 4,
  fireRate: 3,
  width: 31,
  length: 45,
  turretLength: 23,
  center: new Point(16, 23),
  vertices: new Array<Point>(),
  edges: new Array<Line>()
}
ScoutTank.vertices.push(new Point(5, 1));
ScoutTank.vertices.push(new Point(1, 38));
ScoutTank.vertices.push(new Point(1, 43));
ScoutTank.vertices.push(new Point(5, 45));
ScoutTank.vertices.push(new Point(27, 45));
ScoutTank.vertices.push(new Point(31, 43));
ScoutTank.vertices.push(new Point(31, 38));
ScoutTank.vertices.push(new Point(27, 1));
ScoutTank.edges.push(new Line(ScoutTank.vertices[0], ScoutTank.vertices[1]));
ScoutTank.edges.push(new Line(ScoutTank.vertices[1], ScoutTank.vertices[2]));
ScoutTank.edges.push(new Line(ScoutTank.vertices[2], ScoutTank.vertices[3]));
ScoutTank.edges.push(new Line(ScoutTank.vertices[3], ScoutTank.vertices[4]));
ScoutTank.edges.push(new Line(ScoutTank.vertices[4], ScoutTank.vertices[5]));
ScoutTank.edges.push(new Line(ScoutTank.vertices[5], ScoutTank.vertices[6]));
ScoutTank.edges.push(new Line(ScoutTank.vertices[6], ScoutTank.vertices[7]));
ScoutTank.edges.push(new Line(ScoutTank.vertices[7], ScoutTank.vertices[0]));

export const DemolitionTank: TankInfo = {
  type: 4,
  health: 3,
  speed: 2.5,
  turnSpeed: 3.5,
  fireRate: 3,
  width: 35,
  length: 49,
  turretLength: 25,
  center: new Point(18, 25),
  vertices: new Array<Point>(),
  edges: new Array<Line>()
}
DemolitionTank.vertices.push(new Point(4, 1));
DemolitionTank.vertices.push(new Point(1, 4));
DemolitionTank.vertices.push(new Point(1, 46));
DemolitionTank.vertices.push(new Point(4, 49));
DemolitionTank.vertices.push(new Point(32, 49));
DemolitionTank.vertices.push(new Point(35, 46));
DemolitionTank.vertices.push(new Point(35, 4));
DemolitionTank.vertices.push(new Point(32, 1));
DemolitionTank.edges.push(new Line(DemolitionTank.vertices[0], DemolitionTank.vertices[1]));
DemolitionTank.edges.push(new Line(DemolitionTank.vertices[1], DemolitionTank.vertices[2]));
DemolitionTank.edges.push(new Line(DemolitionTank.vertices[2], DemolitionTank.vertices[3]));
DemolitionTank.edges.push(new Line(DemolitionTank.vertices[3], DemolitionTank.vertices[4]));
DemolitionTank.edges.push(new Line(DemolitionTank.vertices[4], DemolitionTank.vertices[5]));
DemolitionTank.edges.push(new Line(DemolitionTank.vertices[5], DemolitionTank.vertices[6]));
DemolitionTank.edges.push(new Line(DemolitionTank.vertices[6], DemolitionTank.vertices[7]));
DemolitionTank.edges.push(new Line(DemolitionTank.vertices[7], DemolitionTank.vertices[0]));