import fs from 'fs';import path from 'path';import crypto from 'crypto';import type {Db} from '@/lib/types';import {seedDb} from '@/lib/seed/seedData';
const file=path.join(process.cwd(),'data','db.json'); export const uid=(p='id')=>`${p}-${crypto.randomUUID()}`;
export function getDb():Db{if(process.env.NODE_ENV==='test')return seedDb(); if(!fs.existsSync(file)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(seedDb(),null,2));} return JSON.parse(fs.readFileSync(file,'utf8')) as Db;}
export function saveDb(db:Db){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(db,null,2));}
export function resetDb(){const db=seedDb(); saveDb(db); return db;}
