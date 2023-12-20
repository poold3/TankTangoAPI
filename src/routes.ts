import { Application } from "express";
import { logger } from "./logger";
import { CreateRequest, JoinRequest } from "./requests";
import { CreateResponse, JoinResponse } from "./responses";
import { createNewGame, joinGame } from "./game";

export function setRoutes(app: Application): void {
  app.post("/create/", async (httpRequest, httpResponse) => {
    try {
      const request: CreateRequest = httpRequest.body;
      const response: CreateResponse = await createNewGame(request);
      httpResponse.status(200).send(JSON.stringify(response));
    } catch (error) {
      logger.error(error);
      httpResponse.status(500).send("Internal Server Error");
    }
  })

  app.post("/join/", async (httpRequest, httpResponse) => {
    try {
      const request: JoinRequest = httpRequest.body;
      const response: JoinResponse = await joinGame(request);
      httpResponse.status(200).send(JSON.stringify(response));
    } catch (error) {
      logger.error(error);
      httpResponse.status(500).send("Internal Server Error");
    }
  })
}
