import {test,expect} from '@playwright/test';
test('opens a real XGWX file and displays its graph without runtime errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.locator('input[type=file]').setInputFiles('tests/fixtures/xgb-xbch-counter.xgwx');
 await expect(page.locator('.aside-head h2')).toHaveText('2023-09-04 #1');
 await expect(page.locator('.react-flow__node').first()).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.locator('#search').fill('P00020');
 await expect(page.locator('.list button')).toHaveCount(1);
 await page.locator('.list button').click();
 await expect(page.locator('h1')).toContainText('P00020');
 await page.screenshot({path:'test-results/xgwx-open.png',fullPage:true});
 expect(errors).toEqual([]);
});
