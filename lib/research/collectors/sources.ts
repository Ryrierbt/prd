import { prisma } from "@/lib/db";
import type { SourceStatus } from "@/lib/research/types";
import { truncate } from "@/lib/research/utils/text";

export async function recordSource(input: {
  taskId: string;
  sourceType: string;
  sourceName: string;
  url: string;
  status: SourceStatus;
  rawContent?: string;
  rawContentLimit?: number;
  errorMessage?: string;
  fetchedAt?: Date;
}) {
  return prisma.source.create({
    data: {
      taskId: input.taskId,
      sourceType: input.sourceType,
      sourceName: input.sourceName,
      url: input.url,
      status: input.status,
      fetchedAt: input.fetchedAt ?? new Date(),
      rawContent: input.rawContent ? truncate(input.rawContent, input.rawContentLimit ?? 12000) : undefined,
      errorMessage: input.errorMessage
    }
  });
}
