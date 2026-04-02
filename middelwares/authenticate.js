import jwt from "jsonwebtoken";
import logger from "../logger.js";

export const authMiddelware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    logger.warn(`Authentication failed: No authorization header provided for IP: ${req.ip}`);
    return res.status(401).json({ msg: "No token provided" })
  };
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decode) => {
    if (err) {
      logger.warn(`Authentication failed: Invalid token for IP: ${req.ip}`);
      return res.status(401).json({ msg: "Invalid token" });
    }
    req.user = decode;
    next();
  })
}

export const adminMiddelware = (req, res, next) => {
  if (req.user.role !== "admin") {
    logger.warn(`Access denied: Admin privileges required for IP: ${req.ip}`);
    return res.status(403).json({ msg: "Forbidden admin only" });
  }
  next();
}

export const vendorMiddelware = (req, res, next) => {
  if (req.user.role !== "vendor") {
    logger.warn(`Access denied: Vendor privileges required for IP: ${req.ip}`);
    return res.status(403).json({ msg: "Forbidden vendor only" });
  }
  next();
}

export const customerMiddelware = (req, res, next) => {
  if (req.user.role !== "customer") {
    logger.warn(`Access denied: Customer privileges required for IP: ${req.ip}`);
    return res.status(403).json({ msg: "Forbidden customer only" });
  }
  next();
}
