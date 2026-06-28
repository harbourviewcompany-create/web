import {describe,expect,it} from 'vitest';import {normalizeUrl} from '@/lib/parsing/normalizeUrl';
describe('normalizeUrl',()=>{it('strips utm params removes fragments lowercases host strips trailing slash and sorts',()=>{expect(normalizeUrl('HTTPS://Example.COM/path/?b=2&utm_source=x&a=1#frag')).toBe('https://example.com/path?a=1&b=2')})})
