import Joi from "joi";

const role = {
  Admin: 'admin',
  Customer: 'customer',
  Vendor: 'vendor'
}

export const userSchemaValidate = Joi.object({
  name: Joi.string().min(3).max(25).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(5).required(),
  role: Joi.string().valid(...Object.values(role)),
  address: Joi.string()
})

export const loginSchemaValidate = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
})
