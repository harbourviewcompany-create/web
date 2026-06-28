import {test,expect} from '@playwright/test';test('app loads',async({page})=>{await page.goto('/');await expect(page.getByText('Signal Inbox').first()).toBeVisible();});
