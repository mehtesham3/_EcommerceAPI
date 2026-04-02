import Joi from "joi";

export const productValidateSchema = Joi.object({
  name: Joi.string().min(10).max(30).required(),
  description: Joi.string().min(20).max(500).required(),
  price: Joi.number().required(),
  stock: Joi.number().min(1).required()
})

export const productUpdateValidateSchema = Joi.object({
  name: Joi.string().min(10).max(30),
  description: Joi.string().min(20).max(500),
  price: Joi.number().positive(),
  stock: Joi.number().min(0)
})

export const orderItemValidateSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().min(1).required()
})

export const statusUpdateValidateSchema = Joi.object({
  status: Joi.string().valid("pending", "shipped", "delivered", "cancelled").required()
})