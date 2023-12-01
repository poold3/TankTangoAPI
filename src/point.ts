export class Point {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  add(b: Point) {
    return new Point(this.x + b.x, this.y + b.y);
  }

  subtract(b: Point) {
    return new Point(this.x - b.x, this.y - b.y);
  }

  multiply(b: Point) {
    return new Point(this.x * b.x - this.y * b.y, this.x * b.y + this.y * b.x);
  }

  multiplyScalar(b: number) {
    return new Point(this.x * b, this.y * b);
  }

  conjugate() {
    return new Point(this.x, -this.y);
  }

  mod() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  arg() {
    return Math.atan2(this.y, this.x);
  }

  polar(r: number, theta: number) {
    return new Point(r * Math.cos(theta), r * Math.sin(theta));
  }

}

export function rotatePoint(P: Point, Q: Point, theta: number): Point {
  const difference = P.subtract(Q);
  const rotation = difference.multiply(new Point(Math.cos(theta), Math.sin(theta)));
  return rotation.add(Q);
}