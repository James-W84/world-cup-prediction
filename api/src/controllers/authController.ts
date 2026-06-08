import { NextFunction, Request, Response } from "express";
import passport from "passport";
import { config, isAllowedFrontendOrigin } from "../config";
import { logger } from "../utils/logger";

function getSafeReturnOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return isAllowedFrontendOrigin(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}

function consumeReturnOrigin(req: Request): string {
  const returnTo = req.session.authReturnTo || config.frontendUrl;
  delete req.session.authReturnTo;
  return returnTo;
}

function redirectAfterSessionSave(
  req: Request,
  res: Response,
  url: string,
): void {
  req.session.save((err) => {
    if (err) logger.error("Session save before auth redirect failed", err);
    res.redirect(url);
  });
}

export const authController = {
  captureGoogleReturnTo: (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void => {
    const returnOrigin = getSafeReturnOrigin(req.query.returnTo);
    if (returnOrigin) req.session.authReturnTo = returnOrigin;
    next();
  },

  googleCallback: (req: Request, res: Response, next: NextFunction): void => {
    const frontendUrl = consumeReturnOrigin(req);

    passport.authenticate(
      "google",
      (err: unknown, user: Express.User | false | null, info: unknown) => {
        logger.info(`login recieved from ${frontendUrl}`);

        if (err || !user) {
          logger.error("Google OAuth callback failed", err || info);
          redirectAfterSessionSave(req, res, `${frontendUrl}/auth/error`);
          return;
        }

        req.logIn(user, (loginErr) => {
          if (loginErr) {
            logger.error("Google OAuth login failed", loginErr);
            redirectAfterSessionSave(req, res, `${frontendUrl}/auth/error`);
            return;
          }

          redirectAfterSessionSave(
            req,
            res,
            `${frontendUrl}/auth/callback?success=true`,
          );
        });
      },
    )(req, res, next);
  },

  me: (req: Request, res: Response): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        username: req.user.username,
        avatarUrl: req.user.avatarUrl,
        totalPoints: req.user.totalPoints,
      },
    });
  },

  logout: (req: Request, res: Response): void => {
    req.logout((err) => {
      if (err) {
        logger.error("Logout error", err);
        res.status(500).json({ success: false, error: "Logout failed" });
        return;
      }
      req.session.destroy(() => {
        res.clearCookie("connect.sid", {
          httpOnly: true,
          secure: config.session.cookie.secure,
          sameSite: config.session.cookie.sameSite,
        });
        res.json({ success: true, message: "Logged out successfully" });
      });
    });
  },
};
