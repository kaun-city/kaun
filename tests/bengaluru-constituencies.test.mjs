import test from "node:test"
import assert from "node:assert/strict"
import { bengaluruDataConstituency, constituencyKey } from "../apps/web/lib/bengaluru-constituencies.ts"

const CURRENT_TO_DATA = {
  "B.T.M Layout": "BTM Layout",
  "C.V. Raman Nagar": "C V Raman Nagar",
  Chamrajapet: "Chamrajpet",
  Gandhinagara: "Gandhi Nagar",
  "Govindraj Nagar": "Govindaraja Nagar",
  "K.R. Pura": "K R Puram",
  Padmanabanagar: "Padmanabhanagar",
  Rajarajeshwarinagar: "Rajarajeshwari Nagar",
  Sarvagnanagar: "Sarvajnanagar",
  Shanthinagar: "Shanti Nagar",
  Yeshwanthapura: "Yeshvanthapura",
}

test("current GBA constituency spellings resolve to stored Bengaluru names", () => {
  for (const [current, stored] of Object.entries(CURRENT_TO_DATA)) {
    assert.equal(bengaluruDataConstituency(current), stored)
    assert.equal(constituencyKey(current), constituencyKey(stored))
  }
})
