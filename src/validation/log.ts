import { z } from "zod";

const attributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
]);

export const logSchema = z.object({
  timestamp: z.string().datetime(),
  level: z.enum(["debug", "info", "warn", "error"]),
  service: z.string().min(1),
  message: z.string().min(1),
  attributes: z
    .record(z.string(), attributeValueSchema)
    .default({}),
});

export const logsBatchSchema = z.object({
  logs: z.array(z.unknown()).min(1),
});

export type LogInput = z.infer<typeof logSchema>;
