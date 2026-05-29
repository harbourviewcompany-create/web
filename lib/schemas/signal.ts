import {z} from 'zod';
export const ManualUrlInputSchema=z.object({url:z.string().url(),sourceName:z.string().min(1).optional(),sourceType:z.string().default('unknown')});
