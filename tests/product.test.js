import db from "../db.js";
import { app } from "../index.js";
import request from "supertest";

beforeAll(async () => {
  await db("users").del();
  await request(app).post("/auth/register").send({
    name: "Vendor User",
    email: "vendor@test.com",
    password: "vendorPassword",
    role: "vendor"
  });
  await request(app).post("/auth/register").send({
    name: "Vendor User 2",
    email: "vendor2@test.com",
    password: "vendorPassword",
    role: "vendor"
  });
  await request(app).post("/auth/register").send({
    name: "Customer User",
    email: "customer@test.com",
    password: "customerPassword"
  });
  await request(app).post("/auth/register").send({
    name: "Admin User",
    email: "admin@test.com",
    password: "adminPassword",
    role: "admin"
  });

  const customerLogin = await request(app).post("/auth/login").send({
    email: "customer@test.com",
    password: "customerPassword"
  });
  const customerId = customerLogin.body.id;
  const vendorLogin = await request(app).post("/auth/login").send({
    email: "vendor@test.com",
    password: "vendorPassword"
  })
  const vendorId = vendorLogin.body.id;
  const vendor2Login = await request(app).post("/auth/login").send({
    email: "vendor2@test.com",
    password: "vendorPassword"
  });
  const vendor2Id = vendor2Login.body.id;
  const adminLogin = await request(app).post("/auth/login").send({
    email: "admin@test.com",
    password: "adminPassword"
  });
  const adminId = adminLogin.body.id;

  const vendorToken = vendorLogin.body.token;
  const vendor2Token = vendor2Login.body.token;
  const customerToken = customerLogin.body.token;
  const adminToken = adminLogin.body.token;

  global.customerToken = customerToken;
  global.vendorToken = vendorToken;
  global.vendor2Token = vendor2Token;
  global.customerId = customerId;
  global.vendorId = vendorId;
  global.vendor2Id = vendor2Id;
  global.adminToken = adminToken;
  global.adminId = adminId;
});

afterAll(async () => {
  await db.destroy(); // closes knex connection
  await redisClient.quit();
});

describe('Product Routes', () => {
  it('should create a new product', async () => {
    const response = await request(app).post("/product/create").set("Authorization", `Bearer ${vendorToken}`).send({
      name: "Test Product",
      description: "This is a test product",
      price: 19.99,
      stock: 100
    });
    await request(app).post("/product/create").set("Authorization", `Bearer ${vendorToken}`).send({
      name: "Test Product another",
      description: "This is a test product another ",
      price: 43.99,
      stock: 10
    });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("newProduct");
  });

  it('should get all products', async () => {
    const response = await request(app).get("/product/getAll").set("Authorization", `Bearer ${vendorToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("products");
    // expect(Array.isArray(response.body)).toHaveProperty("products");
  });

  it('Invalid product creation should fail', async () => {
    const response = await request(app).post("/product/create").set("Authorization", `Bearer ${vendorToken}`).send({
      name: "",
      description: "This is a test product",
      price: -10,
      stock: -5
    });
    expect(response.status).toBe(400);
  });

  it('should not allow non-vendor to create product', async () => {
    const response = await request(app).post("/product/create").set("Authorization", `Bearer ${customerToken}`).send({
      name: "Test Product",
      description: "This is a test product",
      price: 19.99,
      stock: 100
    });
    expect(response.status).toBe(403);
  });

  it('should update a product', async () => {
    // First, create a product to update
    const createRes = await request(app).post("/product/create").set("Authorization", `Bearer ${vendorToken}`).send({
      name: "Product to Update",
      description: "This product will be updated",
      price: 29.99,
      stock: 50
    });
    const productId = createRes.body.newProduct.id;
    // Now, update the product
    const updateRes = await request(app).patch(`/product/update/${productId}`).set("Authorization", `Bearer ${vendorToken}`).send({
      name: "Updated Product",
      description: "This product has been updated",
      price: 39.99,
      stock: 30
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toHaveProperty("data");
  })

  it('should not allow vendor to update another vendor\'s product', async () => {
    // Vendor 1 creates a product
    const createRes = await request(app).post("/product/create").set("Authorization", `Bearer ${vendorToken}`).send({
      name: "Product to Update",
      description: "This product will be updated",
      price: 29.99,
      stock: 50
    });
    const productId = createRes.body.newProduct.id;
    // Vendor 2 tries to update the product
    const updateRes = await request(app).patch(`/product/update/${productId}`).set("Authorization", `Bearer ${vendor2Token}`).send({
      name: "Updated Product",
      stock: 30
    });
    expect(updateRes.status).toBe(404);
  });

  it('should delete a product', async () => {
    // First, create a product to delete
    const createRes = await request(app).post("/product/create").set("Authorization", `Bearer ${vendorToken}`).send({
      name: "Product to Delete",
      description: "This product will be deleted",
      price: 9.99,
      stock: 20
    });
    const productId = createRes.body.newProduct.id;
    // Now, delete the product
    const deleteRes = await request(app).delete(`/product/delete/${productId}`).set("Authorization", `Bearer ${vendorToken}`);
    expect(deleteRes.status).toBe(200);
  });

  it('should not allow vendor to delete another vendor\'s product', async () => {
    // Vendor 1 creates a product
    const createRes = await request(app).post("/product/create").set("Authorization", `Bearer ${vendorToken}`).send({
      name: "Product to Delete",
      description: "This product will be deleted",
      price: 9.99,
      stock: 20
    });
    const productId = createRes.body.newProduct.id;
    // Vendor 2 tries to delete the product
    const deleteRes = await request(app).delete(`/product/delete/${productId}`).set("Authorization", `Bearer ${vendor2Token}`);
    expect(deleteRes.status).toBe(404);
  });

  it('admin should get all products of particular vendor', async () => {
    const response = await request(app).get(`/product/admin/get/${vendorId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("product")
  });

  it('should not allow non-admin to get products of particular vendor', async () => {
    const response = await request(app).get(`/product/admin/get/${vendorId}`).set("Authorization", `Bearer ${customerToken}`);
    expect(response.status).toBe(403);
  });

  it('Admin should be able to enable and disable a product', async () => {
    // First, create a product to enable/disable
    const createRes = await request(app).post("/product/create").set("Authorization", `Bearer ${vendorToken}`).send({
      name: "Product to Enable/Disable",
      description: "This product will be enabled/disabled",
      price: 19.99,
      stock: 100
    });
    const productId = createRes.body.newProduct.id;
    // Now, enable the product
    const enableRes = await request(app).patch(`/product/admin/${productId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(enableRes.status).toBe(200);
    // Now, disable the product
    const disableRes = await request(app).patch(`/product/admin/${productId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(disableRes.status).toBe(200);
  });

  it('Everyone should be able to get product details', async () => {
    // First, create a product to get details of
    const getAllProducts = await request(app).get("/product/getAllProducts");
    expect(getAllProducts.status).toBe(200);
  });

});
