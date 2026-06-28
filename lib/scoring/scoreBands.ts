import type {ScoreBand} from '@/lib/types';
export function scoreBand(score:number,critical=false):ScoreBand{if(critical)return'needs_review'; if(score>=90)return'excellent'; if(score>=75)return'strong'; if(score>=55)return'watch'; if(score>=35)return'weak'; return'ignore';}
