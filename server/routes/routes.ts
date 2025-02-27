import { Request, Response, Router } from "express";

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    router.get("/", (req: Request, res: Response) => {
      res.status(200).send({ message: "API is working!" });
    });

    return router;
  }
}
