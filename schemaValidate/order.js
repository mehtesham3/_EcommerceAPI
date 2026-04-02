import Joi from "joi";

export const orderSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().required(),
  message: Joi.string()
});

export const UpdateOrderSchema = Joi.object({
  productId: Joi.string(),
  quantity: Joi.number(),
  message: Joi.string()
});
