import {z} from 'zod';
export const OutcomeUpdateSchema=z.object({status:z.enum(['ignored','reviewed','pursued','contacted','bid','won','lost','expired']),amount:z.coerce.number().optional(),notes:z.string().optional(),nextAction:z.string().optional(),response:z.string().optional()});
