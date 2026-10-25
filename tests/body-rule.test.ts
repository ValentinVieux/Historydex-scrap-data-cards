import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyWordCount, unsourcedNumbers } from "../scripts/_lib/body-rule.js";

test("compte les mots, pas la ponctuation isolée", () => {
  assert.equal(bodyWordCount("En 1928, à Londres — Fleming : une moisissure."), 7);
});

test("un nombre de la réécriture doit venir des sources, séparateurs de milliers compris", () => {
  const src = ["Mis au jour, ces tessons datent de 20 000-19 000 ans cal. BP.", "vers 18 000 av. J.-C."];
  assert.deepEqual(unsourcedNumbers("vieux de 18 000 à 20 000 ans", src), []);
  assert.deepEqual(unsourcedNumbers("vieux de 25 000 ans", src), ["25000"]);
});
