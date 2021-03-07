const fs = require('fs');
const json2csv = require('json2csv');
const EXP_DIR = 'export/claims/';

const { groupBy, toMap } = require('./utils');

function json(claims) {
  fs.writeFileSync(EXP_DIR + 'claims.json', JSON.stringify(claims, null, 2));
}

function splitJson(claims) {
  const hashed = Object.entries(claims).map(([address, data]) => ({
    hash: String(address[2]),
    data: [address, data],
  }));
  const split = Object.entries(groupBy(hashed, 'hash'))
    .map(([hash, claims]) => [hash, claims.map(c => c.data).reduce(toMap, {})])
    .reduce(toMap, {});
  Object.entries(split).forEach(([hash, claims]) =>
    fs.writeFileSync(`${EXP_DIR}claims-${hash}.json`, JSON.stringify(claims, null, 2)),
  );
}

function csv(claims) {
  const rows = Object.entries(claims).map(([address, data]) => ({
    address,
    ...data,
    refundedTxs: data.refundedTxs.length,
  }));
  const claimsCsv = json2csv.parse(rows);
  fs.writeFileSync(EXP_DIR + 'claims.csv', claimsCsv);
}

function rust(claims) {
  const vec = Object.entries(claims).reduce((str, [address, { totalClaimRaw }]) => {
    str += `    ("${address}", ${totalClaimRaw}),\n`;
    return str;
  }, '');
  fs.writeFileSync(
    EXP_DIR + 'claims_data.rs',
    `use sp_std::vec;\n` +
      `lazy_static::lazy_static! {\n` +
      `pub static ref CLAIMS_DATA: vec::Vec<(&'static str, u128)> = vec![\n` +
      `${vec}];\n` +
      `}\n`,
  );
}

function exportClaims(claims) {
  console.log('exporting ...');
  [json, splitJson, csv, rust].map(e => e.apply(this, [claims]));
}

module.exports = exportClaims;
