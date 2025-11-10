import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSortParam,
  parsePriceParam,
  parsePostedWithinParam,
  parseProductQueryParams,
} from '../filter-params.js';

describe('filter-params parsers', () => {
  it('parseSortParam returns only allowed values', () => {
    assert.equal(parseSortParam('newest'), 'newest');
    assert.equal(parseSortParam('price_asc'), 'price_asc');
    assert.equal(parseSortParam('price_desc'), 'price_desc');
    assert.equal(parseSortParam('views_desc'), 'views_desc');
    assert.equal(parseSortParam('bogus' as any), 'newest');
    assert.equal(parseSortParam(undefined), 'newest');
  });

  it('parsePriceParam parses positive numbers or undefined', () => {
    assert.equal(parsePriceParam('1000'), 1000);
    assert.equal(parsePriceParam('0'), 0);
    assert.equal(parsePriceParam(''), undefined);
    assert.equal(parsePriceParam(undefined), undefined);
    assert.equal(parsePriceParam('-5'), undefined);
    assert.equal(parsePriceParam('abc' as any), undefined);
  });

  it('parsePostedWithinParam recognizes expected values', () => {
    assert.equal(parsePostedWithinParam('24h'), '24h');
    assert.equal(parsePostedWithinParam('7d'), '7d');
    assert.equal(parsePostedWithinParam('30d'), '30d');
    assert.equal(parsePostedWithinParam('bogus' as any), 'any');
    assert.equal(parsePostedWithinParam(undefined), 'any');
  });

  it('parseProductQueryParams normalizes filters and query strings', () => {
    const result = parseProductQueryParams({
      search: '  camera ',
      category: 'not-a-uuid',
      condition: 'Used - Good',
      location: '  Erbil ',
      minPrice: '1000',
      maxPrice: 'oops',
      sort: 'price_desc',
      postedWithin: '7d',
      page: '3',
    });

    assert.equal(result.initialValues.search, 'camera');
    assert.equal(result.initialValues.condition, 'Used - Good');
    assert.equal(result.initialValues.minPrice, '1000');
    assert.equal(result.initialValues.maxPrice, '');
    assert.equal(result.sort, 'price_desc');
    assert.equal(result.postedWithin, '7d');
    assert.equal(result.filters.minPrice, 1000);
    assert.equal(result.filters.maxPrice, undefined);
    assert.equal(result.filters.category, undefined);
    assert.equal(result.filters.location, 'Erbil');
    assert.equal(result.page, 3);
  });
});
