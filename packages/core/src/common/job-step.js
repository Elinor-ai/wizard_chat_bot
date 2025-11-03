import { z } from "zod";

export const JobStepSchema = z.object({
  id: z.string(),
  required: z.boolean(),
  fields: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      required: z.boolean(),
      value: z.string().optional()
    })
  )
});
