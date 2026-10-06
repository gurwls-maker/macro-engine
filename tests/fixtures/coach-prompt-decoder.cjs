"use strict";

const assert = require("node:assert/strict");

function restore(request) {
  const schema = request.contextEncoding;
  const cached = new Map(), visiting = new Set();
  const unpack = value => {
    if (Array.isArray(value)) return value.map(unpack);
    if (!value || typeof value !== "object") return value;
    if (Object.hasOwn(value, "$s")) return schema.strings[value.$s];
    if (Object.hasOwn(value, "$v")) {
      const index = value.$v;
      assert.ok(!visiting.has(index), "shared values must be an acyclic source-preserving representation");
      if (!cached.has(index)) { visiting.add(index); cached.set(index, unpack(request.sharedValues[index])); visiting.delete(index); }
      return cached.get(index);
    }
    if (Object.hasOwn(value, "$sets")) {
      const [index, ...encodedRuns] = unpack(value.$sets);
      const columns = schema.setColumns[index], result = [];
      for (const encoded of encodedRuns) {
        const [ids, ...values] = encoded;
        for (const id of ids) {
          let position = 0;
          result.push(Object.fromEntries(columns.map(key => [key, key === "id" ? id : values[position++]])));
        }
      }
      return result;
    }
    const [index, ...values] = value.$o;
    return Object.fromEntries(schema.objectColumns[index].map((key, position) => [key, unpack(values[position])]));
  };
  const context = schema ? unpack(request.context) : structuredClone(request.context);
  if (context?.factGroupColumns) {
    const facts = [];
    for (const group of context.facts) {
      const [unit, source, date, estimated] = group.metadata;
      for (const [ordinal, rawId, label, value] of group.rows) {
        const id = Array.isArray(rawId) ? `f.${ordinal}.${context.factIdSuffixes[rawId[1]]}` : rawId;
        facts[ordinal] = { id, label: context.factDictionaries.label[label], value,
          unit: context.factDictionaries.unit[unit], source: context.factDictionaries.source[source],
          date: context.factDictionaries.date[date], estimated };
      }
    }
    context.facts = facts;
    for (const key of ["factGroupColumns", "factRowColumns", "factDictionaries", "factIdSuffixes"]) delete context[key];
  }
  const result = { ...request, context };
  delete result.contextEncoding; delete result.sharedValues;
  return result;
}


module.exports = { restore };
