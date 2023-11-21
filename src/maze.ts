export class Room {
  public plusY: boolean;
  public minusY: boolean;
  public plusX: boolean;
  public minusX: boolean;
  public numEdges: number;
  constructor() {
    this.plusY = false;
    this.minusY = false;
    this.plusX = false;
    this.minusX = false;
    this.numEdges = 0;
  }

  reset() {
    this.plusY = false;
    this.minusY = false;
    this.plusX = false;
    this.minusX = false;
    this.numEdges = 0;
  }
}

export class Maze {
  public width: number;
  public height: number;
  public step: number;
  public numRoomsWide: number;
  public numRoomsHigh: number;
  public rooms: Array<Array<Room>>;

  constructor(width: number, height: number, step: number) {
    this.width = width;
    this.height = height;
    this.step = step;
    this.numRoomsWide = this.width / this.step;
    this.numRoomsHigh = this.height / this.step;
    this.rooms = new Array(this.numRoomsHigh);
    for (let i = 0; i < this.numRoomsHigh; ++i) {
      this.rooms[i] = new Array<Room>(this.numRoomsWide);
      for (let j = 0; j < this.numRoomsWide; ++j) {
        this.rooms[i][j] = new Room();
      }
    }
  }

  createEdges() {
    //Erase all edges in points
    for (let i = 0; i < this.rooms.length; ++i) {
      for (let j = 0; j < this.rooms[i].length; ++j) {
        this.rooms[i][j].reset();
      }
    }

    //Reinstate maze border edges
    for (let i = 0; i < this.numRoomsWide; ++i) {
      this.rooms[0][i].minusY = true;
      this.rooms[0][i].numEdges += 1;
      this.rooms[this.numRoomsHigh - 1][i].plusY = true;
      this.rooms[this.numRoomsHigh - 1][i].numEdges += 1;
    }

    for (let i = 0; i < this.numRoomsHigh; ++i) {
      this.rooms[i][0].minusX = true;
      this.rooms[i][0].numEdges += 1;
      this.rooms[i][this.numRoomsWide - 1].plusX = true;
      this.rooms[i][this.numRoomsWide - 1].numEdges += 1;
    }

    //Create maze edges
    const maxEdges = Math.round(this.numRoomsWide * this.numRoomsHigh * 0.75);
    let edgeCount = 0;
    while (edgeCount < maxEdges) {
      // Get random row and column numbers
      const row = Math.floor(Math.random() * this.numRoomsHigh);
      const column = Math.floor(Math.random() * this.numRoomsWide);

      // If this room already has 3 edges, we cannot add a 4th or it will be invalid
      if (this.rooms[row][column].numEdges == 3) {
        continue;
      }

      // Get random edgeType
      let edgeType = Math.floor(Math.random() * 4);
      let edgeAssigned = false;

      // Assign the room an edge
      while (!edgeAssigned) {
        if (edgeType % 4 === 0 && !this.rooms[row][column].minusX) {
          this.rooms[row][column].minusX = true;
          this.rooms[row][column - 1].plusX = true;
          edgeAssigned = true;
          if (this.isMazeValid()) {
            this.rooms[row][column].numEdges += 1;
            this.rooms[row][column - 1].numEdges += 1;
            edgeCount += 1;
          } else {
            this.rooms[row][column].minusX = false;
            this.rooms[row][column - 1].plusX = false;
          }
        } else if (edgeType % 4 === 1 && !this.rooms[row][column].plusX) {
          this.rooms[row][column].plusX = true;
          this.rooms[row][column + 1].minusX = true;
          edgeAssigned = true;
          if (this.isMazeValid()) {
            this.rooms[row][column].numEdges += 1;
            this.rooms[row][column + 1].numEdges += 1;
            edgeCount += 1;
          } else {
            this.rooms[row][column].plusX = false;
            this.rooms[row][column + 1].minusX = false;
          }
        } else if (edgeType % 4 === 2 && !this.rooms[row][column].minusY) {
          this.rooms[row][column].minusY = true;
          this.rooms[row - 1][column].plusY = true;
          edgeAssigned = true;
          if (this.isMazeValid()) {
            this.rooms[row][column].numEdges += 1;
            this.rooms[row - 1][column].numEdges += 1;
            edgeCount += 1;
          } else {
            this.rooms[row][column].minusY = false;
            this.rooms[row - 1][column].plusY = false;
          }
        } else if (edgeType % 4 === 3 && !this.rooms[row][column].plusY) {
          this.rooms[row][column].plusY = true;
          this.rooms[row + 1][column].minusY = true;
          edgeAssigned = true;
          if (this.isMazeValid()) {
            this.rooms[row][column].numEdges += 1;
            this.rooms[row + 1][column].numEdges += 1;
            edgeCount += 1;
          } else {
            this.rooms[row][column].plusY = false;
            this.rooms[row + 1][column].minusY = false;
          }
        }
        edgeType += 1;
      }
    }
  }

  private isMazeValidHelper(row: number, column: number, explored: Array<Array<boolean>>): void {
    // If the room is already explored, exit
    if (explored[row][column]) {
      return;
    }

    // Set explored to true for this room
    explored[row][column] = true;
    const room = this.rooms[row][column];

    // Explore outward to all sides that do not have an edge aka wall in the maze
    if (!(room.minusX)) {
      this.isMazeValidHelper(row, column - 1, explored);
    }
    if (!(room.plusX)) {
      this.isMazeValidHelper(row, column + 1, explored);
    }
    if (!(room.minusY)) {
      this.isMazeValidHelper(row - 1, column, explored);
    }
    if (!(room.plusY)) {
      this.isMazeValidHelper(row + 1, column, explored);
    }
  }

  isMazeValid(): boolean {
    // Create explored filled with false
    const explored = new Array(this.numRoomsHigh);
    for (let i = 0; i < explored.length; ++i) {
      explored[i] = new Array<boolean>(this.numRoomsWide).fill(false);
    }
    
    // Run recursive helper
    this.isMazeValidHelper(0, 0, explored);

    // If there are any rooms unexplored, the maze is invalid
    for (let i = 0; i < explored.length; ++i) {
      for (let j = 0; j < explored[i].length; ++j) {
        if (!explored[i][j]) {
          return false;
        }
      }
    }
    return true;
  }

}