const fs = require("fs");
const json2csv = require("json2csv");

const { groupBy, toMap } = require("./utils");

function json(claims) {
  fs.writeFileSync("claims.json", JSON.stringify(claims, null, 2));
}

function splitJson(claims) {
  const hashed = Object.entries(claims).map(([address, data]) => ({
    hash: String(address[2]),
    data: [address, data],
  }));
  const split = Object.entries(groupBy(hashed, "hash"))
    .map(([hash, claims]) => [
      hash,
      claims.map((c) => c.data).reduce(toMap, {}),
    ])
    .reduce(toMap, {});
  Object.entries(split).forEach(([hash, claims]) =>
    fs.writeFileSync(`claims-${hash}.json`, JSON.stringify(claims, null, 2))
  );
}

function csv(claims) {
  const rows = Object.entries(claims).map(([address, data]) => ({
    address,
    ...data,
    refundedTxs: data.refundedTxs.length,
  }));
  const claimsCsv = json2csv.parse(rows);
  fs.writeFileSync("claims.csv", claimsCsv);
}

function rust(claims) {
  const vec = Object.entries(claims).reduce(
    (str, [address, { totalClaimRaw }]) => {
      str += `    ("${address}", ${totalClaimRaw}),\n`;
      return str;
    },
    ""
  );
  fs.writeFileSync(
    "claims_data.rs",
    `use lazy_static;
use sp_std::vec;
lazy_static::lazy_static! {
pub static ref CLAIMS_DATA: vec::Vec<(&'static str, u128)> = vec![
${vec}];
}`
  );
}

function exportClaims(claims) {
  console.log("exporting ...");
  [json, splitJson, csv, rust].map((e) => e.apply(this, [claims]));
}

module.exports = exportClaims;
