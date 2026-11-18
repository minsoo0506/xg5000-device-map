import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/ui',use:{baseURL:'http://127.0.0.1:4173',headless:true,launchOptions:process.env.XGMAP_CHROME?{executablePath:process.env.XGMAP_CHROME}:{}},webServer:{command:'./node_modules/.bin/vite preview --host 127.0.0.1',url:'http://127.0.0.1:4173',reuseExistingServer:true},reporter:'list'});
