export { CollectionAgent } from "./collector.js";
export type { CollectionResult, CollectorDependencies } from "./collector.js";
export { DeepSeekClient } from "./deepseek.js";
export type { StructuredModel, DeepSeekUsage } from "./deepseek.js";
export * from "./schemas.js";

import { CollectionAgent } from "./collector.js";
export const collectionAgent = new CollectionAgent();
