const Promise = require('bluebird');
const { ethers: { BigNumber }} = require('hardhat');

/**
 * creates instance of BigNumber
 * @param n
 * @returns {BigNumber}
 */
const bn = n => BigNumber.from(n);

/**
 * filter key value map by predicate that can be asynchronously resolved
 *
 * @param map / object
 * @param predicate
 * @param concurrency
 * @return filtered map
 */
const filterBy = async (map, predicate, concurrency = 20) => Promise.map(
    Object.entries(map),
    async ([key, value]) => ([key, value, await predicate([key, value])]),
    {concurrency})
    .then(r => r.filter(([, , result]) => result))
    .reduce(toMap, {});


/**
 * groups objects by key field value
 *
 * @param col collection
 * @param key to group by
 * @return map of groups
 */
const groupBy = (col, key) => col.reduce((rv, x) => {
  (rv[x[key]] = rv[x[key]] || []).push(x);
  return rv;
}, {});

/**
 * difference between object fields
 *
 * @param a object
 * @param b object
 * @returns {string[]} difference
 */
const diff = (a, b) => Object.keys(a).filter(i => !Object.keys(b).includes(i));

/**
 * maps update function over values in map
 *
 * @param map / object
 * @param update function
 * @returns map
 */
const mapValues = (map, update) => Object.entries(map)
    .map(update)
    .reduce(toMap, {});

/**
 * reducer of entries to map
 */
const toMap = (a, [k, v]) => ({...a, [k]: v});

/**
 * sums values in specified field into BigNumber
 *
 * @param map
 * @param query
 * @returns BigNumber
 */
const sumValues = (map, query = identity) => Object.values(map).reduce((a, o) => a.add(query(o)), bn(0));

const identity = o => o;

module.exports = {filterBy, groupBy, diff, toMap, mapValues, bn, sumValues};
