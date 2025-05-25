import { price as p } from "./shared.mjs";

const price = 100;
const taxRate = 0.25;
const taxAmount = price / (1 + taxRate);
const a = new Symbol();

const [prices, tax] = p;
