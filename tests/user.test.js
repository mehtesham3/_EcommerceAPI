import db from "../db.js";
import { app, redisClient } from "../index.js";
import request from "supertest";

beforeAll(async () => {
  await db("users").del();
});

afterAll(async () => {
  await db.destroy(); // closes knex connection
  try {
    if (redisClient) await redisClient.quit();
  } catch (err) {
    console.log("Redis not connected");
  }
});

describe('User Autherntication', () => {
  it('should register a new user successfully', async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Test User",
      email: "testUser@test.com",
      password: "testPassword",
      role: "customer",
      address: "123 Test Street"
    })
    expect(response.status).toBe(201);
  });

  it('should not register a user with existing email', async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Test User",
      email: "testUser@test.com",
      password: "testPassword"
    })
    expect(response.status).toBe(409);
  });

  it('should fail with invalid data', async () => {
    const response = await request(app).post("/auth/register").send({
      email: "invalidEmail",
      password: "testPassword",
    })
    expect(response.status).toBe(400);
  });

  it('should login successfully with correct credentials', async () => {
    const response = await request(app).post("/auth/login").send({
      email: "testUser@test.com",
      password: "testPassword"
    })
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
  });

  it('should not login with incorrect password', async () => {
    const response = await request(app).post("/auth/login").send({
      email: "testUser@test.com",
      password: "wrongPassword"
    })
    expect(response.status).toBe(404);
  });

  it('should not login with incorrect email', async () => {
    const response = await request(app).post("/auth/login").send({
      email: "nonexistent@test.com",
      password: "testPassword"
    })
    expect(response.status).toBe(404);
  });

  it('should not login with empty credentials', async () => {
    const response = await request(app).post("/auth/login").send({
      email: "",
      password: ""
    })
    expect(response.status).toBe(400);
  });

  it("should normalize email to lowercase", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        name: "User",
        email: "TEST@EXAMPLE.COM",
        password: "123456"
      });

    expect(res.statusCode).toBe(201);
  });

  it('should get user profile with valid token', async () => {
    const loginRes = await request(app).post("/auth/login").send({
      email: "testUser@test.com",
      password: "testPassword"
    });

    const token = loginRes.body.token;
    const profileRes = await request(app).get("/auth/profile").set("Authorization", `Bearer ${token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.user).toHaveProperty("email", "testuser@test.com");
  });

  it('should not get user profile with invalid token', async () => {
    const profileRes = await request(app).get("/auth/profile").set("Authorization", `Bearer invalidToken`);
    expect(profileRes.status).toBe(401);
  });

  it("should allow admin to get all users", async () => {
    // First, register an admin user
    await request(app).post("/auth/register").send({
      name: "Admin User",
      email: "admin@test.com",
      password: "adminPassword",
      role: "admin"
    });

    // Login as admin to get token
    const loginRes = await request(app).post("/auth/login").send({
      email: "admin@test.com",
      password: "adminPassword"
    });
    const adminTOken = loginRes.body.token;
    // Get all users with admin token
    const res = await request(app).get("/auth/getAll").set("Authorization", `Bearer ${adminTOken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("should not allow non-admin to get all users", async () => {
    // Login as regular user to get token
    const loginRes = await request(app).post("/auth/login").send({
      email: "testUser@test.com",
      password: "testPassword"
    });
    const userToken = loginRes.body.token;
    // Try to get all users with regular user token
    const res = await request(app).get("/auth/getAll").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });


  it("should fail after 5 failed login attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/auth/login")
        .send({
          email: "nonexistent@test.com",
          password: "testPassword"
        });
    }

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "nonexistent@test.com",
        password: "testPassword"
      });

    expect(res.statusCode).toBe(429);
  });

});
