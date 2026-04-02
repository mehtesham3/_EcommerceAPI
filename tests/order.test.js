import db from '../db.js';
import { app, redisClient } from '../index.js'
import request from 'supertest';

beforeAll(async () => {

  await request(app).post("/auth/register").send({
    name: "Customer User",
    email: "customer@test.com",
    password: "customerPassword"
  });
  await request(app).post("/auth/register").send({
    name: "Customer User2",
    email: "customer2@test.com",
    password: "customerPassword"
  });
  await request(app).post("/auth/register").send({
    name: "Vendor User",
    email: "vendor@test.com",
    password: "vendorPassword",
    role: "vendor"
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
  const customerLogin2 = await request(app).post("/auth/login").send({
    email: "customer2@test.com",
    password: "customerPassword"
  });
  const adminLogin = await request(app).post("/auth/login").send({
    email: "admin@test.com",
    password: "adminPassword"
  });
  const vendorLogin = await request(app).post("/auth/login").send({
    email: "vendor@test.com",
    password: "vendorPassword"
  });
  const vendor = {
    token: vendorLogin.body.token,
    id: vendorLogin.body.id
  }
  const customer = {
    token: customerLogin.body.token,
    id: customerLogin.body.id
  }
  const customer2 = {
    token: customerLogin2.body.token,
    id: customerLogin2.body.id
  }
  const admin = {
    token: adminLogin.body.token,
    id: adminLogin.body.id
  }

  const product1 = await request(app).post("/product/create").set("Authorization", `Bearer ${vendor.token}`).send({
    name: "Test Product 1",
    description: "This is a test product 1",
    price: 19.99,
    stock: 100
  });
  const product2 = await request(app).post("/product/create").set("Authorization", `Bearer ${vendor.token}`).send({
    name: "Test Product 2",
    description: "This is a test product 2",
    price: 19.99,
    stock: 100
  })
  const product3 = await request(app).post("/product/create").set("Authorization", `Bearer ${vendor.token}`).send({
    name: "Test Product 3",
    description: "This is a test product 3",
    price: 19.99,
    stock: 100
  })
  const product4 = await request(app).post("/product/create").set("Authorization", `Bearer ${vendor.token}`).send({
    name: "Test Product 4",
    description: "This is a test product 4",
    price: 19.99,
    stock: 100
  })
  const order = await request(app).post("/order/createOrders").set("Authorization", `Bearer ${customer.token}`).send({
    shipping_address: "123 Test Street"
  });
  const orderId = order.body.order[0].id;

  const productIds = {
    product1: product1.body.newProduct.id,
    product2: product2.body.newProduct.id,
    product3: product3.body.newProduct.id,
    product4: product4.body.newProduct.id
  }

  global.customer = customer;
  global.customer2 = customer2;
  global.admin = admin;
  global.productIds = productIds;
  global.orderId = orderId;

})

afterAll(async () => {
  await db.destroy(); // closes knex connection
  try {
    if (redisClient) await redisClient.quit();
  } catch (err) {
    console.log("Redis not connected");
  }
});

describe('Order API', () => {
  it('should create a new order successfully', async () => {
    const response = await request(app).post("/order/createOrders").set("Authorization", `Bearer ${customer.token}`).send({
      shipping_address: "123 Test Street"
    });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("order");
  });

  it('should not create an order without authentication and only customer can create orders', async () => {
    const response = await request(app).post("/order/createOrders").send({
      shipping_address: "123 Test Street"
    });
    expect(response.status).toBe(401);

    const anotherResponse = await request(app).post("/order/createOrders").set("Authorization", `Bearer ${admin.token}`).send({
      shipping_address: "123 Test Street"
    });
    expect(anotherResponse.status).toBe(403);
  });

  it('should add the products to the order successfully', async () => {
    const response = await request(app).post(`/order/orderItem/${orderId}`).set("Authorization", `Bearer ${customer.token}`).send({
      productId: productIds.product1,
      quantity: 2
    });
    expect(response.status).toBe(200);
  });

  it('should not add products to the order without authentication and only customer can add products to the order', async () => {
    const response = await request(app).post(`/order/orderItem/${orderId}`).send({
      productId: productIds.product1,
      quantity: 2
    });
    expect(response.status).toBe(401);
    const anotherResponse = await request(app).post(`/order/orderItem/${orderId}`).set("Authorization", `Bearer ${admin.token}`).send({
      productId: productIds.product1,
      quantity: 2
    });
    expect(anotherResponse.status).toBe(403);
  });

  it('should add the products to the order in bulk successfully', async () => {
    const response = await request(app).post(`/order/orderItems/bulk/${orderId}`).set("Authorization", `Bearer ${customer.token}`).send({
      items: [
        { productId: productIds.product2, quantity: 1 },
        { productId: productIds.product3, quantity: 3 },
        { productId: productIds.product4, quantity: 1 }
      ]
    });
    expect(response.status).toBe(200);
  });

  it('should get the order details successfully', async () => {
    const response = await request(app).get(`/order/orderItems/${orderId}`).set("Authorization", `Bearer ${customer.token}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("display");
  })

  it('should not get the order details without authentication ', async () => {
    const response = await request(app).get(`/order/orderItems/${orderId}`);
    expect(response.status).toBe(401);
  });

  it('should update the quantity of the orderItem successfully', async () => {
    const orderItem = await request(app).post(`/order/orderItem/${orderId}`).set("Authorization", `Bearer ${customer.token}`).send({
      productId: productIds.product1,
      quantity: 2
    });

    const orderItemId = orderItem.body.orderItem[0].id;
    const response = await request(app).put(`/order/orderItems/${orderItemId}`).set("Authorization", `Bearer ${customer.token}`).send({
      quantity: 5
    });
    expect(response.status).toBe(200);
  });

  it('should not update another customer\'s orderItem quantity', async () => {
    const orderItem = await request(app).post(`/order/orderItem/${orderId}`).set("Authorization", `Bearer ${customer.token}`).send({
      productId: productIds.product1,
      quantity: 2
    });
    const orderItemId = orderItem.body.orderItem[0].id;
    const response = await request(app).put(`/order/orderItem/${orderItemId}`).set("Authorization", `Bearer ${customer2.token}`).send({
      quantity: 5
    });
    expect(response.status).toBe(404);
  });

  it('should delete the orderItem successfully', async () => {
    const orderItem = await request(app).post(`/order/orderItem/${orderId}`).set("Authorization", `Bearer ${customer.token}`).send({
      productId: productIds.product1,
      quantity: 2
    });
    const orderItemId = orderItem.body.orderItem[0].id;
    const response = await request(app).delete(`/order/orderItems/${orderItemId}`).set("Authorization", `Bearer ${customer.token}`);
    expect(response.status).toBe(200);
  });

  it('should not delete another customer\'s orderItem', async () => {
    const orderItem = await request(app).post(`/order/orderItem/${orderId}`).set("Authorization", `Bearer ${customer.token}`).send({
      productId: productIds.product1,
      quantity: 2
    });
    const orderItemId = orderItem.body.orderItem[0].id;
    const response = await request(app).delete(`/order/orderItem/${orderItemId}`).set("Authorization", `Bearer ${customer2.token}`);
    expect(response.status).toBe(404);
  });

  it('admin should update the product status ', async () => {
    const response = await request(app).patch(`/order/admin/orderStatus/${orderId}`).set("Authorization", `Bearer ${admin.token}`).send({
      status: "shipped"
    });
    expect(response.status).toBe(200);
  });

  it('should not allow non-admin to update the product status', async () => {
    const response = await request(app).patch(`/order/admin/orderStatus/${orderId}`).set("Authorization", `Bearer ${customer.token}`).send({
      status: "shipped"
    });
    expect(response.status).toBe(403);
  });

  it('should not update the product status with invalid status', async () => {
    const response = await request(app).patch(`/order/admin/orderStatus/${orderId}`).set("Authorization", `Bearer ${admin.token}`).send({
      status: "invalidStatus"
    });
    expect(response.status).toBe(400);
  });

  it('admin should get the orders of user successfully', async () => {
    const response = await request(app).get(`/order/order/${customer.id}`).set("Authorization", `Bearer ${admin.token}`);
    expect(response.status).toBe(200);
    expect(response.body.order.length).toBeGreaterThan(0);
  });

});