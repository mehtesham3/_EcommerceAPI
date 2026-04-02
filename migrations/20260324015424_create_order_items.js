/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
  return knex.schema.createTable("order_items", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("order_id").references("id").inTable("orders").onDelete("CASCADE");
    table.uuid("product_id").references("id").inTable("products").onDelete("CASCADE");
    table.integer("quantity").notNullable().defaultTo(1);
    table.decimal("price", 10, 2).notNullable();
    table.boolean("is_active").defaultTo(true);
    table.text("message").defaultTo(null);
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema.dropTableIfExists("order_items");
};
