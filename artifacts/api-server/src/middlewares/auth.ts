import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// No insecure fallback: the signing secret must come from the environment.
// A hardcoded default in a public repo would let anyone forge auth tokens.
const rawSecret = process.env.SESSION_SECRET;
if (!rawSecret || rawSecret.length < 16) {
  throw new Error(
    "SESSION_SECRET is not set (or too short). Set a long, random SESSION_SECRET " +
      "environment secret before starting the server.",
  );
}
const JWT_SECRET: string = rawSecret;

export interface AuthPayload {
  userId: string;
  role: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}
