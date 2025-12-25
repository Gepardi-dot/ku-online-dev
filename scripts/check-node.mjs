#!/usr/bin/env node
const version = process.versions.node;
const major = Number(version.split('.')[0]);

if (!Number.isInteger(major) || major !== 22) {
  console.error(`Expected Node 22.x but found ${version}.`);
  process.exit(1);
}

console.log(`Node ${version} is supported.`);
