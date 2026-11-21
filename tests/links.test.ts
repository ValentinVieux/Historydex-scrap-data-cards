import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkLinks, linksPayload } from "../scripts/_lib/links.js";

const card = (dexNum: string, pivotYear: number, status = "approved") =>
  ({ file: `${dexNum}.json`, data: { dexNum, editorial: { status }, canonical: { time: { pivotYear } } } }) as never;

test("le registre attrape carte inconnue, auto-lien, doublon, ordre et cause inversée", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "links-")), "links.json");
  fs.writeFileSync(file, JSON.stringify({
    series: [{ id: "s", icon: "x", name: "Série", dexNums: ["001", "002", "999"] }],
    relations: [
      { from: "001", to: "001", kind: "suite" },
      { from: "002", to: "001", kind: "cause" },
      { from: "001", to: "002", kind: "cause" },
    ],
  }));
  const rules = checkLinks([card("001", 1800), card("002", 1700)], file).map((i) => i.rule).sort();
  assert.deepEqual(rules, ["links-unknown-card", "relation-duplicate", "relation-order", "relation-self", "series-order"]);
});

test("la charge publiée ne garde que les cartes en base", () => {
  const p = linksPayload(
    {
      series: [
        { id: "a", icon: "x", name: "A", dexNums: ["001", "002", "003", "009"] },
        { id: "b", icon: "x", name: "B", dexNums: ["001", "009", "008"] },
      ],
      relations: [{ from: "001", to: "002", kind: "cause" }, { from: "001", to: "009", kind: "suite" }],
    },
    new Set(["001", "002", "003"]),
  );
  assert.deepEqual(p.series.map((s) => [s.id, s.dexNums]), [["a", ["001", "002", "003"]]]);
  assert.deepEqual(p.relations, [["001", "002", "cause"]]);
});
