# 🛒 Ecommerce API

A **production-ready Ecommerce Backend API** built using **Node.js, Express, PostgreSQL, Knex.js, and Redis**.
This project demonstrates **real-world backend architecture**, including caching, transactions, and advanced business logic.

---

# 🚀 Features

* 🔐 JWT Authentication (User, Vendor, Admin roles)
* 📦 Product Management (Vendor & Admin control)
* 🧾 Order & Order Items System
* ⚡ Redis Caching for performance optimization
* 🔄 Cache Invalidation Strategy
* 🧠 Advanced Business Logic (data consistency across tables)
* 🔗 Relational Database Design (PostgreSQL)
* 🚀 Bulk Operations Support
* 🛡️ Rate Limiting for security

---

# 🛠️ Tech Stack

* Node.js
* Express.js
* PostgreSQL
* Knex.js
* Redis
* JWT (Authentication)
* Bcrypt (Password Hashing)

---

# 🌐 Base Routes

| Route     | Description                    |
| --------- | ------------------------------ |
| `/`       | Welcome message                |
| `/health` | Check server & database health |

---

# 👤 User Routes (`/auth`)

| Method | Endpoint         | Description                     |
| ------ | ---------------- | ------------------------------- |
| POST   | `/auth/register` | Register a new user             |
| POST   | `/auth/login`    | Login and receive JWT token     |
| GET    | `/auth/profile`  | Get user profile (JWT required) |
| GET    | `/auth/getAll`   | Get all users (**Admin only**)  |

---

## 🔐 Security

* Passwords hashed using **bcrypt**
* JWT-based authentication
* Rate limiting:

  * ❗ Max **5 failed login attempts**

---

# 📦 Product Routes (`/product`)

## 🔹 Vendor Routes

| Method | Endpoint              | Description         |
| ------ | --------------------- | ------------------- |
| POST   | `/product/create`     | Create product      |
| GET    | `/product/getAll`     | Get vendor products |
| GET    | `/product/get/:id`    | Get product details |
| PATCH  | `/product/update/:id` | Update product      |
| DELETE | `/product/delete/:id` | Delete product      |

---

## 🔹 Admin Routes

| Method | Endpoint                     | Description                 |
| ------ | ---------------------------- | --------------------------- |
| GET    | `/product/admin/get/:userId` | Get vendor products         |
| PATCH  | `/product/admin/:productId`  | Activate/Deactivate product |
| GET    | `/product/getAllInActive`    | Get inactive products       |

---

## 🔹 Public Route (Cached)

| Method | Endpoint                  | Description                         |
| ------ | ------------------------- | ----------------------------------- |
| GET    | `/product/getAllProducts` | Get all products (**Redis Cached**) |

---

# ⚡ Redis Caching (IMPORTANT)

### ✅ Implemented For:

* Public products route

### 🔁 Flow:

1. Check if data exists in Redis
2. If yes → return cached data
3. If no → fetch from DB → store in Redis → return response

---

## 🔄 Cache Invalidation Strategy

Cache is **automatically cleared** when:

* Product price is updated
* Product stock is updated
* Product is deleted
* Product is activated/deactivated

👉 Ensures **fresh and consistent data**

---

# 🧾 Order Routes (`/order`)

## 🔹 Customer Routes

| Method | Endpoint              | Description     |
| ------ | --------------------- | --------------- |
| POST   | `/order/createOrders` | Create order    |
| GET    | `/order/getOrder`     | Get user orders |

---

## 🔹 Order Items

| Method | Endpoint                          | Description                   |
| ------ | --------------------------------- | ----------------------------- |
| POST   | `/order/orderItems/:orderId`      | Add single item               |
| POST   | `/order/orderItems/bulk/:orderId` | 🔥 Add multiple items at once |
| GET    | `/order/orderItems/:orderId`      | Get order items               |
| PUT    | `/order/orderItems/:orderItemId`  | Update quantity               |
| DELETE | `/order/orderItems/:orderItemId`  | Delete item                   |

---

## 🔹 Admin Order Controls

| Method | Endpoint                            | Description               |
| ------ | ----------------------------------- | ------------------------- |
| PATCH  | `/order/admin/orderStatus/:orderId` | Update order status       |
| GET    | `/order/order/:userId`              | Get user orders           |
| GET    | `/order/admin/:orderId`             | Get all items of an order |

---

# 🔥 Bulk Order Items Feature

### Endpoint:

```bash
POST /order/orderItems/bulk/:orderId
```

### Description:

* Allows adding **multiple products in a single request**
* Reduces API calls
* Improves performance

### Example Request:

```json
{
  "items": [
    { "product_id": "id1", "quantity": 2 },
    { "product_id": "id2", "quantity": 1 }
  ]
}
```

---

# 🧠 Advanced Business Logic

## ✅ Data Consistency Handling

When:

* Product price changes
* Product stock changes
* Product is deleted

👉 Then:

* Related **order totals are recalculated**
* Dependent data is updated accordingly

---

## ✅ Example Logic

* If product price increases → order total increases
* If product deleted → remove from order → update total
* If quantity updated → total recalculated

---

# 🧠 Database Design

### Relationships:

* **Users → Orders** (One-to-Many)
* **Orders → Order Items** (One-to-Many)
* **Products → Order Items** (One-to-Many)

---

# 🔐 Roles & Permissions

| Role     | Permissions           |
| -------- | --------------------- |
| Customer | Manage orders & items |
| Vendor   | Manage own products   |
| Admin    | Full system control   |

---

# ⚙️ Setup Instructions

### 1️⃣ Clone Repository

---

### 2️⃣ Install Dependencies

```bash
npm install
```

---

### 3️⃣ Environment Variables

```env
PORT=5000
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_NAME=ecommerce_db

JWT_SECRET=your_secret
JWT_EXPIRES_IN=1d
```

---

### 4️⃣ Run Migrations

```bash
npx knex migrate:latest
```

---

### 5️⃣ Start Server

```bash
npm run dev
```

---


# 📌 Conclusion

This project demonstrates:

* Advanced backend architecture
* Redis caching & invalidation
* Bulk operations
* Data consistency handling
* Secure authentication system
* Real-world database relationships

---