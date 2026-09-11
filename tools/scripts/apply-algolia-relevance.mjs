#!/usr/bin/env node

import { algoliasearch } from 'algoliasearch';

const {
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_API_KEY,
  ALGOLIA_INDEX_NAME,
} = process.env;

if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_API_KEY || !ALGOLIA_INDEX_NAME) {
  console.error('Missing Algolia env vars. Set ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, and ALGOLIA_INDEX_NAME.');
  process.exit(1);
}

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
const indexName = ALGOLIA_INDEX_NAME;
const replicaNames = [
  `${indexName}_newest`,
  `${indexName}_price_asc`,
  `${indexName}_price_desc`,
  `${indexName}_views_desc`,
];

const RELEVANCE_SETTINGS = {
  minWordSizefor1Typo: 5,
  minWordSizefor2Typos: 9,
  typoTolerance: true,
  ignorePlurals: ['en', 'ar'],
  allowTyposOnNumericTokens: false,
};

const BIKE_SYNONYM = {
  objectID: 'custom:bike',
  type: 'synonym',
  synonyms: ['bike', 'bikes', 'bicycle', 'bicycles', 'ebike', 'e-bike', 'دراجة', 'دراجات', 'بايسكل', 'پایسکل'],
};

async function waitForTask(name, task) {
  if (task?.taskID) {
    await client.waitForTask({ indexName: name, taskID: task.taskID });
  }
}

async function applySettings(name) {
  const task = await client.setSettings({
    indexName: name,
    indexSettings: RELEVANCE_SETTINGS,
  });
  await waitForTask(name, task);
  console.log(`settings: ${name}`);
}

async function applySynonyms(name) {
  const task = await client.saveSynonyms({
    indexName: name,
    synonymHit: [BIKE_SYNONYM],
    replaceExistingSynonyms: false,
  });
  await waitForTask(name, task);
  console.log(`synonyms: ${name}`);
}

async function searchTitles(query) {
  const result = await client.searchSingleIndex({
    indexName: `${indexName}_newest`,
    searchParams: {
      query,
      hitsPerPage: 20,
      filters: 'is_active:true AND is_sold:false',
      attributesToRetrieve: ['title'],
      attributesToHighlight: [],
    },
  });
  const titles = (result.hits ?? []).map((hit) => hit.title);
  console.log(`query "${query}" nbHits=${result.nbHits} titles=${JSON.stringify(titles)}`);
  return titles;
}

const indexes = [indexName, ...replicaNames];
for (const name of indexes) {
  await applySettings(name);
  await applySynonyms(name);
}

await searchTitles('bike');
await searchTitles('nike');
await searchTitles('iphone');
await searchTitles('phone');
await searchTitles('dress');
