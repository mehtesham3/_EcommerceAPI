import express from "express";
import "dotenv/config"
import { adminMiddelware, authMiddelware, vendorMiddelware } from "../middelwares/authenticate.js";
import { schemaValidate } from "../middelwares/schemaMiddelwares.js";
import { productUpdateValidateSchema, productValidateSchema } from "../schemaValidate/product.js";
import db from "../db.js";
import { redisClient } from "../index.js";
import logger from "../logger.js";

const productRoute = express.Router();

productRoute.post("/create", authMiddelware, vendorMiddelware, schemaValidate(productValidateSchema), async (req, res) => {
    try {
        const { name, description, price, stock } = req.body;
        const [newProduct] = await db("products").insert({
            name,
            description,
            price,
            stock,
            vendor_id: req.user.id
        }).returning("*")
        logger.info(`New product created: ${newProduct.name} (ID: ${newProduct.id}) by Vendor ID: ${req.user.id}`);
        const updateCacheKey = await redisClient.del("all_active_products");
        if (updateCacheKey) {
            logger.info("Cache invalidated for key 'all_active_products' due to new product creation");
        }
        res.status(201).json({ msg: "Product created successfully", newProduct })

    } catch (error) {
        logger.error("Error during product creation: " + error.message);
        res.status(500).json({ msg: "Internal server error" })
    }
})

productRoute.get("/getAll", authMiddelware, vendorMiddelware, async (req, res) => {
    try {
        const products = await db("products").where({ vendor_id: req.user.id, is_active: true }).select("*");
        const productCount = await db("products").where({ vendor_id: req.user.id, is_active: true }).count("id").first();
        if (!products) {
            logger.info(`No products found for Vendor ID: ${req.user.id}`);
            return res.status(404).json({ msg: "No products found" })
        }
        if (productCount.count == 0) {
            logger.info(`No products found for Vendor ID: ${req.user.id}`);
            return res.status(404).json({ msg: "No products found" })
        }
        logger.info(`Products fetched for Vendor ID: ${req.user.id}`);

        return res.status(200).json({ msg: "Products fetched successfully", productCount: productCount.count, products })
    } catch (error) {
        logger.error("Error during product fetching: " + error.message);
        res.status(500).json({ msg: "Internal server error" })
    }
})

productRoute.get("/get/:id", authMiddelware, vendorMiddelware, async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await db("products").where({ id: productId, vendor_id: req.user.id, is_active: true }).select("*").first();
        if (!product) {
            logger.info(`Product not found for ID: ${productId} and Vendor ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Product not found" })
        }
        logger.info(`Product fetched for ID: ${productId} and Vendor ID: ${req.user.id}`);
        return res.status(200).json({ msg: "Product fetched successfully", product })
    } catch (error) {
        logger.error("Error during product fetching of single items: " + error.message);
        res.status(500).json({ msg: "Internal server error" })
    }
})

productRoute.patch("/update/:id", authMiddelware, vendorMiddelware, schemaValidate(productUpdateValidateSchema), async (req, res) => {
    try {
        const productId = req.params.id;

        const { name, description, stock, price } = req.body;
        if (!name && !description && !stock && !price) {
            logger.warn(`No fields provided for update for Product ID: ${productId} and Vendor ID: ${req.user.id}`);
            return res.status(400).json({ msg: "Please provide at least one field to update" })
        };
        const product = await db("products").where({ id: productId, vendor_id: req.user.id, is_active: true }).first();
        if (!product) {
            logger.warn(`Product not found for ID: ${productId} and Vendor ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Product not found" });
        }
        const updateData = {};

        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (stock !== undefined) updateData.stock = stock;
        if (price !== undefined) updateData.price = price;

        const updatePoduct = await db("products").where({ id: productId }).update(updateData).returning("*");
        const updateCacheKey = await redisClient.del("all_active_products");
        if (updateCacheKey) { logger.info("Cache invalidated for key 'all_active_products' due to product update"); }
        logger.info(`Updating product with ID: ${productId} for Vendor ID: ${req.user.id}`);
        res.status(200).json({
            message: "Product updated successfully ",
            data: updatePoduct[0]
        });

    } catch (error) {
        logger.error("Error during updateion of items: " + error.message);
        res.status(500).json({ msg: "Internal server error", error: error.message });
    }
})

productRoute.delete("/delete/:id", authMiddelware, vendorMiddelware, async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await db("products").where({ id: productId, vendor_id: req.user.id }).first();
        if (!product) {
            logger.info(`Product not found for ID: ${productId} and Vendor ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Product not found" });
        }
        logger.info(`Deleting product with ID: ${productId} for Vendor ID: ${req.user.id}`);
        await db("products").where({ id: productId }).delete();
        const updateCacheKey = await redisClient.del("all_active_products");
        if (updateCacheKey) logger.info("Cache invalidated for key 'all_active_products' due to product deletion");
        return res.status(200).json({ msg: "Product deleted successfully" });
    } catch (error) {
        logger.error("Error during product deletion: " + error.message);
        res.status(500).json({ msg: "Internal server error", error: error.message })
    }
})

productRoute.get("/admin/get/:userId", authMiddelware, adminMiddelware, async (req, res) => {
    try {
        const userId = req.params.userId;
        const product = await db("products").where({ vendor_id: userId }).select("*");
        const productCount = await db("products").where({ vendor_id: userId }).count("id").first();
        const userDetails = await db("users").where({ id: userId }).select("name", "email").first();
        if (!userDetails) {
            logger.info(`User not found for ID: ${userId}`);
            return res.status(404).json({ msg: "User not found" });
        }
        const { name, email } = userDetails;
        if (!product) {
            logger.info(`Product not found for Vendor ID: ${userId}`);
            return res.status(404).json({ msg: "Product not found" });
        }
        if (productCount.count == 0) {
            logger.info(`No products found for Vendor ID: ${userId}`);
            return res.status(404).json({ msg: "No products found" });
        }
        logger.info(`Product fetched for Vendor ID: ${userId} by Admin: ${req.user.id}`);
        return res.status(200).json({ msg: "Product fetched successfully", name, email, productCount: productCount.count, product })
    } catch (error) {
        logger.error("Error during product fetching of single vendor: " + error.message);
        res.status(500).json({ msg: "Internal server error", error: error.message })
    }
})

productRoute.patch("/admin/:productId", authMiddelware, adminMiddelware, async (req, res) => {
    try {
        const productId = req.params.productId;
        const product = await db("products").where({ id: productId }).first();
        if (!product) {
            logger.info(`Product not found for ID: ${productId}`);
            return res.status(404).json({ msg: "Product not found" });
        }
        const updateProduct = await db("products").where({ id: productId }).update({ is_active: !product.is_active }).returning("*");
        const updateCacheKey = await redisClient.del("all_active_products");
        if (updateCacheKey) logger.info("Cache invalidated for key 'all_active_products' due to product activation status change");
        logger.info(`Product with ID: ${productId} has been ${updateProduct[0].is_active ? "activated" : "deactivated"} by Admin: ${req.user.id}`);
        return res.status(200).json({ msg: `Product ${product.is_active ? "deactivated" : "activated"} successfully`, product: updateProduct[0] });
    } catch (error) {
        logger.error("Error during product update by admin: " + error.message);
        res.status(500).json({ msg: "Internal server error", error: error.message })
    }
})

productRoute.get("/getAllInActive", authMiddelware, adminMiddelware, async (req, res) => {
    try {
        const products = await db("products").where({ is_active: false }).select("*");
        const productCount = await db("products").where({ is_active: false }).count("id").first();
        if (!products) {
            logger.info("No products found for inactive status");
            return res.status(404).json({ msg: "No products found" });
        }
        logger.info("Product fetched successfully for inactive status by Admin: " + req.user.id);
        return res.status(200).json({ msg: "Products fetched successfully", productCount: productCount.count, products })
    } catch (error) {
        logger.error("Error during product fetching: " + error.message);
        res.status(500).json({ msg: "Internal server error", error: error.message })
    }
})

productRoute.get("/getAllProducts", async (req, res) => {
    try {
        const start = Date.now();
        const cacheKey = "all_active_products";
        const cacheProducts = await redisClient.get(cacheKey);
        if (cacheProducts) {
            const end = Date.now();
            // console.log(`Time taken to fetch products from Redis cache: ${end - start} ms`);
            // console.log("Products fetched from Redis cache");
            logger.info(`Product fetch from Redis cache : in ${end - start} ms`);
            const productCount = JSON.parse(cacheProducts).length;

            return res.status(200).json({
                msg: "Products fetched successfully (from cache)",
                productCount,
                timeTaken: `${end - start} ms`,
                products: JSON.parse(cacheProducts)
            })
        }

        const products = await db("products").where({ is_active: true }).select("*");
        const productCount = await db("products").where({ is_active: true }).count("id").first();
        if (products.length === 0) return res.status(404).json({ msg: "No products found" })
        await redisClient.setEx(cacheKey, 3000, JSON.stringify(products));
        const end = Date.now();

        const timeTaken = await redisClient.ttl("all_active_products");
        logger.info(`Product fetch from database and cache in Redis : ${end - start} ms and TTL of ${timeTaken} seconds`);

        return res.status(200).json({ msg: "Products fetched successfully", productCount: productCount.count, timeTaken: `${end - start} ms`, products })
    } catch (error) {
        logger.error("Error during product fetching: " + error.message);
        res.status(500).json({ msg: "Internal server error" })
    }
})

export default productRoute;