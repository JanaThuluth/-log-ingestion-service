import { z } from "zod";

const baseLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  service: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  cursor: z.string().optional(),
});

export const logQuerySchema = baseLogQuerySchema.catchall(z.string());

export type LogQuery = z.infer<typeof logQuerySchema>;

export const aggregateQuerySchema = z
  .object({
    since: z.string().datetime(),
    until: z.string().datetime(),
    bucket: z.enum(["1m", "5m", "1h", "1d"]),
    group_by: z.enum(["service", "level"]).optional(),
    level: z.enum(["debug", "info", "warn", "error"]).optional(),
    service: z.string().min(1).optional(),
    q: z.string().min(1).optional(),
  })
  .catchall(z.string());

export type AggregateQuery = z.infer<typeof aggregateQuerySchema>;
