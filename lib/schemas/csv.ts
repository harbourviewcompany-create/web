import {z} from 'zod';
export const CsvRowSchema=z.object({title:z.string().min(1),url:z.string().url().optional().or(z.literal('')),source_name:z.string().optional(),source_type:z.string().optional(),company:z.string().optional(),asset_type:z.string().optional(),location:z.string().optional(),deadline:z.string().optional(),estimated_value:z.string().optional(),notes:z.string().optional()});
