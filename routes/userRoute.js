import express from "express"
import { schemaValidate } from "../middelwares/schemaMiddelwares.js";
import { loginSchemaValidate, userSchemaValidate } from "../schemaValidate/user.js";
import "dotenv/config"
import db from "../db.js";
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { adminMiddelware, authMiddelware } from "../middelwares/authenticate.js";
import logger from "../logger.js";
import { DatabaseError } from "pg";

const userRoute = express.Router();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    logger.warn(`Too many login attempts from IP: ${req.ip}`);
    logger.error(`Brute-force attack detected from IP: ${req.ip}`);
    res.status(429).json({ success: false, message: "Too many login attempts from this ip, please try again after 15 minutes" });
  },
  skipSuccessfulRequests: true,
})

userRoute.post("/register", schemaValidate(userSchemaValidate), async (req, res) => {
  try {
    const { name, email, password, role = "customer", address } = req.body;
    const existingUser = await db("users").where({ email: email.toLowerCase() }).first();
    if (existingUser) {
      logger.warn(`Registration failed: User with email ${email} already exists`);
      return res.status(409).json({ success: false, message: "User with this email already exists" })
    };
    logger.info(`Registering new user with email: ${email}, role: ${role}`);
    const hashPassword = await bcrypt.hash(password, 10);
    const emailToStore = email.toLowerCase();
    const [newUser] = await db("users").insert({
      name,
      email: emailToStore,
      password: hashPassword,
      role,
      address
    }).returning(["id", "name", "role", "email", "address"]);

    return res.status(201).json({
      success: true,
      message: "User Registered Successfully",
      user: newUser
    })
  } catch (error) {
    if (error.code === '23505') { // unique_violation
      return res.status(409).json({
        success: false,
        message: "User with this email already exists"
      });
    }

    logger.error("Error during user registration : " + error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    })
  }
})

userRoute.post("/login", schemaValidate(loginSchemaValidate), loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const isAvailable = await db("users").where({ email: email.toLowerCase() }).first();
    if (!isAvailable) {
      logger.warn(`Login failed: user ${email} does not exist`);
      return res.status(404).json({ success: false, message: "Invalid Credentials " });
    };
    const isPassValid = await bcrypt.compare(password, isAvailable.password);
    if (!isPassValid) {
      logger.warn(`Login failed: Invalid password for user ${email}`);
      return res.status(404).json({ success: false, message: "Invalid Credentials " });
    }
    logger.info(`User ${email} logged in successfully`);

    const token = jwt.sign({ id: isAvailable.id, role: isAvailable.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.status(200).json({
      success: true,
      id: isAvailable.id,
      token: token
    })
  } catch (error) {
    logger.error("Error during user login : " + error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    })
  }
})

userRoute.get("/profile", authMiddelware, async (req, res) => {
  try {
    const user = await db("users").where({ id: req.user.id }).select("id", "name", "email", "role", "address").first();
    if (!user) {
      logger.warn(`User profile not found for user ID: ${req.user.id}`);
      return res.status(404).json({ success: false, message: "User not found" });
    }
    logger.info(`Retrieving profile for user ID: ${req.user.id}`);
    return res.status(200).json({
      success: true,
      user: user
    })
  } catch (error) {
    logger.error("Error during user profile retrieval : " + error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    })
  }
})

userRoute.get("/getAll", authMiddelware, adminMiddelware, async (req, res) => {
  try {
    const users = await db("users").select("id", "name", "role", "email", "address");
    const totalAdmin = await db("users").where({ role: "admin" }).count("id").first();
    const totalVendor = await db("users").where({ role: "vendor" }).count("id").first();
    const totalCustomer = await db("users").where({ role: "customer" }).count("id").first();
    logger.info(`Admin user ID: ${req.user.id} retrieved all users. Total users: ${users.length}, Admins: ${totalAdmin.count}, Vendors: ${totalVendor.count}, Customers: ${totalCustomer.count}`);
    return res.status(200).json({
      success: true,
      totalAdmin: totalAdmin.count,
      totalVendor: totalVendor.count,
      totalCustomer: totalCustomer.count,
      users: users
    })
  } catch (error) {
    logger.error("Error during get all users : " + error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    })
  }
})

export default userRoute;
