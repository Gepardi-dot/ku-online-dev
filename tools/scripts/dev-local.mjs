#!/usr/bin/env node

process.env.NEXT_DEV_MODE = 'local';
await import('./dev-server.mjs');
