import express from "express";
import { adminMiddelware, authMiddelware, customerMiddelware } from "../middelwares/authenticate.js";
import db from "../db.js";
import { orderItemValidateSchema, statusUpdateValidateSchema } from "../schemaValidate/product.js";
import { schemaValidate } from "../middelwares/schemaMiddelwares.js";
import { redisClient } from "../index.js";
import logger from "../logger.js";

const orderRoute = express.Router();

orderRoute.post("/createOrders", authMiddelware, customerMiddelware, async (req, res) => {
    try {
        const { shipping_address } = req.body;
        const userAddress = await db("users").where({ id: req.user.id }).select("address");
        const resolvedAddress = shipping_address || userAddress[0]?.address;

        if (!resolvedAddress) {
            logger.warn(`Order creation failed for user ${req.user.id}: Shipping address is required`);
            return res.status(404).json({ msg: "Shipping address required for order" });
        }

        const order = await db("orders")
            .insert({ user_id: req.user.id, total: 10, status: "pending", shipping_address: resolvedAddress })
            .returning("*");

        logger.info(`Order created successfully for user ${req.user.id} with order ID ${order[0].id}`);
        return res.status(201).json({ msg: "Order created successfully", order });

    } catch (error) {
        logger.error(`Failed to create order for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to create order", error });
    }
})

orderRoute.get("/getOrder", authMiddelware, customerMiddelware, async (req, res) => {
    try {
        const order = await db("orders").where({ user_id: req.user.id, status: 'pending' }).select("*");
        if (order.length === 0) {
            logger.warn(`No orders found for user ${req.user.id}`);
            return res.status(404).json({ msg: "Order not found" });
        }
        logger.info(`Order fetched successfully for user ${req.user.id}`);

        return res.status(200).json({ msg: "Order fetched successfully", order });
    } catch (error) {
        logger.error(`Failed to fetch order for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to fetch order", error });
    }
})

orderRoute.post("/orderItem/:orderId", authMiddelware, customerMiddelware, schemaValidate(orderItemValidateSchema), async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const { productId, quantity } = req.body;
        const order = await db("orders").where({ id: orderId, user_id: req.user.id }).select("*");
        if (order.length === 0) {
            logger.warn(`Order not found for ID: ${orderId} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order not found" });
        }
        const product = await db("products").where({ id: productId, is_active: true }).select("*");
        if (product.length === 0) {
            logger.warn(`Product not found for ID: ${productId}`);
            return res.status(404).json({ msg: "Product not found" });
        }
        const existingTotalValue = parseFloat(order[0].total);
        const value = quantity * product[0].price;
        const newTotalValue = existingTotalValue + value;
        const ifExist = await db("order_items").where({ product_id: productId, order_id: orderId }).update({ quantity: db.raw("quantity + ?", [quantity]) }).returning("*");
        const available_stock = product[0].stock;
        const existingOrderItem = await db("order_items").where({ product_id: productId, order_id: orderId }).select("*");
        const existingQuantity = existingOrderItem.length > 0 ? parseInt(existingOrderItem[0].quantity) : 0;
        if (quantity + existingQuantity > available_stock) {
            logger.warn(`Insufficient stock for product ID ${productId} when adding to order ID ${orderId} for user ${req.user.id}`);
            return res.status(400).json({ msg: "Insufficient stock for the requested quantity" });
        }
        if (ifExist.length > 0) {
            const orderUpdate = await db("orders").where({ id: orderId, user_id: req.user.id }).update({ total: newTotalValue }).select("id order_id product_id quantity price");
            logger.info(`Order item updated successfully for user ${req.user.id} with order ID ${orderId}`);
            return res.status(200).json({ msg: "Order item added successfully", orderItem: ifExist, orderUpdate, existingTotalValue, newTotalValue, value });
        }

        const orderItem = await db("order_items").insert({ order_id: orderId, product_id: productId, quantity, price: product[0].price }).returning("*");
        const orderUpdate = await db("orders").where({ id: orderId, user_id: req.user.id }).update({ total: newTotalValue }).select("id order_id product_id quantity price");
        logger.info(`Order item added successfully for user ${req.user.id} with order ID ${orderId}`);
        return res.status(200).json({ msg: "Order item added successfully", orderItem, orderUpdate, existingTotalValue, newTotalValue, value });
    } catch (error) {
        logger.error(`Failed to add order item for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to add order item", error });
    }
})

orderRoute.post("/orderItems/bulk/:orderId", authMiddelware, customerMiddelware, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const { items } = req.body; // items: [{ productId, quantity }, ...]

        if (!items || items.length === 0) {
            logger.warn(`No items provided for bulk order item addition for order ID ${orderId} and user ID ${req.user.id}`);
            return res.status(400).json({ msg: "Items required for order" });
        }

        const order = await db("orders").where({ id: orderId, user_id: req.user.id }).select("*");
        if (order.length === 0) {
            logger.warn(`Order not found for ID: ${orderId} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order not found" });
        }

        const productIds = items.map(item => item.productId);
        const products = await db("products").whereIn("id", productIds).select("*");

        // Check if all products exist
        if (products.length !== productIds.length) {
            const foundIds = products.map(p => p.id);
            const missingIds = productIds.filter(id => !foundIds.includes(id));
            logger.warn(`Some products not found for order ID ${orderId} and user ID ${req.user.id}`);
            return res.status(404).json({ msg: "Products not found", missingIds });
        }

        const productMap = Object.fromEntries(products.map(p => [p.id, p]));

        let totalValueIncrease = 0;
        const existingItems = await db("order_items").where({ order_id: orderId }).whereIn("product_id", productIds).select("*");
        const existingItemMap = Object.fromEntries(existingItems.map(item => [item.product_id, item]));

        const toUpdate = [];
        const toInsert = [];

        for (const { productId, quantity } of items) {
            const product = productMap[productId];
            if (!product) {
                logger.warn(`Product ID ${productId} not found in productMap for order ${orderId}`);
                return res.status(404).json({ msg: "Product not found", productId });
            }

            const available_stock = product.stock;
            const existingQuantity = existingItemMap[productId] ? parseInt(existingItemMap[productId].quantity) : 0;
            if (quantity + existingQuantity > available_stock) {
                logger.warn(`Insufficient stock for product ID ${productId} when adding to order ID ${orderId} for user ${req.user.id}`);
                return res.status(400).json({ msg: `Insufficient stock for product ID ${productId}`, available_stock, existingQuantity, requested: quantity });
            }

            const value = quantity * product.price;
            totalValueIncrease += value;

            if (existingItemMap[productId]) {
                toUpdate.push({ productId, quantity });
            } else {
                toInsert.push({ order_id: orderId, product_id: productId, quantity, price: product.price });
            }
        }

        // Update existing items
        const updatedItems = await Promise.all(
            toUpdate.map(({ productId, quantity }) =>
                db("order_items")
                    .where({ product_id: productId, order_id: orderId })
                    .update({ quantity: db.raw("quantity + ?", [quantity]) })
                    .returning("*")
            )
        );

        // Insert new items
        const insertedItems = toInsert.length > 0
            ? await db("order_items").insert(toInsert).returning("*")
            : [];

        // Update order total
        const existingTotalValue = parseFloat(order[0].total);
        const newTotalValue = existingTotalValue + totalValueIncrease;
        await db("orders").where({ id: orderId, user_id: req.user.id }).update({ total: newTotalValue });


        logger.info(`Order items added successfully for user ${req.user.id} with order ID ${orderId}`);
        return res.status(200).json({
            msg: "Order items added successfully",
            inserted: insertedItems,
            updated: updatedItems.flat(),
            existingTotalValue,
            newTotalValue,
            totalValueIncrease
        });
    } catch (error) {
        logger.error(`Failed to add order items for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to add order items", error });
    }
})

orderRoute.get("/orderItems/:orderId", authMiddelware, customerMiddelware, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const orderItem = await db("order_items").where({ order_id: orderId }).select("id", "order_id", "product_id", "quantity", "price", "created_at");
        const orderLength = orderItem.length;
        if (orderLength === 0) {
            logger.warn(`Order item not found for ID: ${orderId} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order item not found" });
        }
        const products = await db("products").whereIn("id", orderItem.map(item => item.product_id)).select("id", "name", "price");
        const display = orderItem.map(item => {
            const product = products.find(product => product.id === item.product_id);
            return {
                ...item,
                product
            }
        })
        logger.info(`Order item fetched successfully for user ${req.user.id} with order ID ${orderId}`);
        return res.status(200).json({ msg: "Order item fetched successfully", display });
    } catch (error) {
        logger.error(`Failed to fetch order item for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to fetch order item", error });
    }
})

orderRoute.put("/orderItems/:orderItemId", authMiddelware, customerMiddelware, async (req, res) => {
    try {
        const orderItemId = req.params.orderItemId;
        const { quantity } = req.body;
        if (!quantity) return res.status(400).json({ msg: "Quantity is required" });
        if (quantity <= 0) return res.status(400).json({ msg: "Quantity must be greater than 0" })

        const orderItem = await db("order_items").where({ id: orderItemId }).select("*");
        if (orderItem.length === 0) {
            logger.warn(`Order item not found for ID: ${orderItemId} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order item not found" });
        }
        const order = await db("orders").where({ id: orderItem[0].order_id }).select("*");
        if (order.length === 0) {
            logger.warn(`Order not found for ID: ${orderItem[0].order_id} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order not found" });
        }
        const product = await db("products").where({ id: orderItem[0].product_id }).select("*");
        if (product.length === 0) {
            logger.warn(`Product not found for ID: ${orderItem[0].product_id} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Product not found" });
        }
        const orderItemUpdate = await db("order_items").where({ id: orderItemId }).update({ quantity, price: product[0].price }).returning("*");
        const oldItemTotal = parseFloat(orderItem[0].quantity) * parseFloat(orderItem[0].price);
        const newItemTotal = quantity * parseFloat(product[0].price);

        const existingTotalValue = parseFloat(order[0].total);
        const newTotal = existingTotalValue - oldItemTotal + newItemTotal;

        const totalUpdate = await db("orders")
            .where({ id: orderItem[0].order_id })
            .update({ total: newTotal })
            .returning("*");

        logger.info(`Order item updated successfully for user ${req.user.id} with order item ID ${orderItemId}`);

        return res.status(200).json({ msg: "Order item updated successfully", orderItemUpdate, totalUpdate });
    } catch (error) {
        logger.error(`Failed to update order item for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to update order item", error, errorMsg: error.message });
    }
})

orderRoute.delete("/orderItems/:orderItemId", authMiddelware, customerMiddelware, async (req, res) => {
    try {
        const orderItemId = req.params.orderItemId;
        const orderItem = await db("order_items").where({ id: orderItemId }).select("*");
        if (orderItem.length === 0) {
            logger.warn(`Order item not found for ID: ${orderItemId} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order item not found" });
        }
        const order = await db("orders").where({ id: orderItem[0].order_id }).select("*");
        if (order.length === 0) {
            logger.warn(`Order not found for ID: ${orderItem[0].order_id} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order not found" });
        }
        const itemTotal = parseInt(orderItem[0].quantity) * parseFloat(orderItem[0].price);
        const newTotal = parseFloat(order[0].total) - itemTotal;

        await db("orders")
            .where({ id: orderItem[0].order_id })
            .update({ total: newTotal });

        const orderItemDelete = await db("order_items").where({ id: orderItemId }).delete();
        logger.info(`Order item deleted successfully for user ${req.user.id} with order item ID ${orderItemId}`);
        return res.status(200).json({ msg: "Order item deleted successfully", orderItemDelete });
        // const orderItemDelete = await db("order_items").where({ id: orderItemId }).delete();
        // return res.status(200).json({ msg: "Order item deleted successfully", orderItemDelete });z
    } catch (error) {
        logger.error(`Failed to delete order item for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to delete order item", error });
    }
})

orderRoute.patch("/admin/orderStatus/:orderId", authMiddelware, adminMiddelware, schemaValidate(statusUpdateValidateSchema), async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const { status } = req.body;
        const order = await db("orders").where({ id: orderId }).select("*");
        if (order.length === 0) {
            logger.warn(`Order not found for ID: ${orderId} and User ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order not found" });
        }
        const orderUpdate = await db("orders").where({ id: orderId }).update({ status }).select("*");
        let currentStatus = order[0].status;
        if (status === "shipped") {
            const orderItems = await db("order_items").where({ order_id: orderId }).update({ is_active: false }).returning("*");
            const productIds = orderItems.map(item => item.product_id);
            const products = await db("products").whereIn("id", productIds).select("*");
            for (const item of orderItems) {
                const product = products.find(p => p.id === item.product_id);
                const newStock = product.stock - item.quantity;
                await db("products").where({ id: item.product_id }).update({ stock: newStock });
            }
            const updateCacheKey = await redisClient.del("all_active_products");
            if (updateCacheKey) {
                logger.info("Cache invalidated for key 'all_active_products' due to product stock update");
            }
            logger.info(`Order status updated to shipped and stock updated successfully for user ${req.user.id} with order ID ${orderId}`);
            return res.status(200).json({ msg: "Order status updated successfully", orderItems });
        }

        if (status === "cancelled" && currentStatus === "shipped") {
            const orderItems = await db("order_items").where({ order_id: orderId }).update({ is_active: false }).returning("*");
            const productIds = orderItems.map(item => item.product_id);
            const products = await db("products").whereIn("id", productIds).select("*");
            for (const item of orderItems) {
                const product = products.find(p => p.id === item.product_id);
                const newStock = product.stock + item.quantity;
                await db("products").where({ id: item.product_id }).update({ stock: newStock });
            }
            const updateCacheKey = await redisClient.del("all_active_products");
            if (updateCacheKey) {
                logger.info("Cache invalidated for key 'all_active_products' due to product stock update");
            }
            logger.info(`Order status updated to canceled for user ${req.user.id} with order ID ${orderId}`);
            return res.status(200).json({ msg: "Order status updated successfully", orderItems });
        }

        logger.info(`Order status updated successfully for user ${req.user.id} with order ID ${orderId}`);

        return res.status(200).json({ msg: "Order status updated successfully", orderUpdate });
    } catch (error) {
        logger.error(`Failed to update order status for user ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to update order status", error, MSG: error.message });
    }
})

orderRoute.get("/order/:userId", authMiddelware, adminMiddelware, async (req, res) => {
    try {
        const userId = req.params.userId;
        const order = await db("orders").where({ user_id: userId }).select("id", "status", "total", "shipping_address");
        if (order.length === 0) {
            logger.warn(`Order not found for User ID: ${userId} and Admin ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order not found" });
        }
        logger.info(`Order fetched successfully for User ID: ${userId} and Admin ID: ${req.user.id}`);
        return res.status(200).json({ msg: "Order fetched successfully", order });
    } catch (error) {
        logger.error(`Failed to fetch order for User ID: ${userId} and Admin ID: ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to fetch order", error });
    }
})

orderRoute.get("/admin/:orderId", authMiddelware, adminMiddelware, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const orderItems = await db("order_items").where({ order_id: orderId }).select("*");
        if (orderItems.length === 0) {
            logger.warn(`Order items not found for Order ID: ${orderId} and Admin ID: ${req.user.id}`);
            return res.status(404).json({ msg: "Order items not found" });
        }
        logger.info(`Order items fetched successfully for Order ID: ${orderId} and Admin ID: ${req.user.id}`);
        return res.status(200).json({ msg: `Order items of orderId ${orderId}`, OrderItems: orderItems });
    } catch (error) {
        logger.error(`Failed to fetch orderItems for Order ID: ${orderId} and Admin ID: ${req.user.id}: ${error.message}`);
        res.status(500).json({ msg: "Failed to fetch orderItems", error });
    }
})

export default orderRoute;