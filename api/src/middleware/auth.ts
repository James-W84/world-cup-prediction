import "../types";
import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { logger } from "../utils/logger";

export type AuthRequest = Request;

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    next();
    return;
  }

  logger.error(`Unauthenticated request to ${req.path} from ${req.user}`);
  res.status(401).json({ success: false, error: "Authentication required" });
};

export const requireLeagueMember =
  (leagueIdParam: string = "leagueId") =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.id;
    const leagueId = req.params[leagueIdParam];

    if (!userId || !leagueId) {
      res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
      return;
    }

    const membership = await prisma.leagueMember.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });

    if (!membership) {
      res
        .status(403)
        .json({ success: false, error: "Not a member of this league" });
      return;
    }

    next();
  };
