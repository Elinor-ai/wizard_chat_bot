import { z } from "zod";

export const NonNegativeNumber = z.number().min(0);
export const TimestampSchema = z.coerce.date();
export const NullableString = z.string().nullable().optional();
