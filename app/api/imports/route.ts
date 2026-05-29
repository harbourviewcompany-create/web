import {NextResponse} from 'next/server';import {getDb} from '@/lib/store/db';export async function GET(){return NextResponse.json(getDb().importBatches)}
