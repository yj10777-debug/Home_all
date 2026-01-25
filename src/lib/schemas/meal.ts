import { z } from 'zod';

export const mealItemSchema = z.object({
  name: z.string().min(1, 'name is required'),
  cal: z.number(),
  amount: z.number().optional(),
  unit: z.string().optional(),
  protein: z.number().optional(),
  fat: z.number().optional(),
  carb: z.number().optional(),
});

export const mealLogSchema = z.object({
  loggedAt: z.string().datetime({ message: 'loggedAt must be ISO8601', offset: true }),
  mealType: z.string().min(1, 'mealType is required'),
  source: z.string().optional(),
  note: z.string().optional(),
});

export const createMealSchema = z.object({
  mealLog: mealLogSchema,
  items: z.array(mealItemSchema),
});

export type MealItemInput = z.infer<typeof mealItemSchema>;
export type MealLogInput = z.infer<typeof mealLogSchema>;
export type CreateMealInput = z.infer<typeof createMealSchema>;
