import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => !value || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value), {
    message: "URL 必须以 http:// 或 https:// 开头"
  });

export const createTaskSchema = z.object({
  appName: z.string().trim().min(1, "App 名称不能为空").max(80, "App 名称过长"),
  websiteUrl: optionalUrl,
  appStoreUrl: optionalUrl,
  googlePlayUrl: optionalUrl,
  keywords: z
    .string()
    .trim()
    .max(240, "补充关键词过长")
    .optional()
    .transform((value) => (value ? value : undefined))
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

