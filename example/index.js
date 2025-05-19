// createPotion :: String -> { length: Number | a } -> { name: String, ingredients: { length: Number | a }, strength: Number }
function createPotion(name, ingredients) {
  return {
    name: name,
    ingredients: ingredients,
    strength: ingredients.length * 10
  };
}

// potions :: [{ name: String, ingredients: [String], strength: Number }]
const potions = [createPotion("Water", ["water"])];

let potion = createPotion("Healing Brew", ["herb", "mushroom"]);
potions.push(potion);
/*
potions.push(createPotion("Fire Elixir", ["ash", "pepper", "oil"]));

function describePotion(potion) {
  return potion.name + " has " + potion.ingredients.length + " ingredients.";
}

function drinkPotion(potion) {
  if (potion.strength > 20) {
    return "You feel powerful!";
  } else {
    return "42"; // Intentional type inconsistency
  }
}

for (let i = 0; i < potions.length; i++) {
  const p = potions[i];
  console.log(describePotion(p));
  console.log("Drinking result:", drinkPotion(p));
}

// Edge case: broken potion
const mysteryPotion = {
  name: "???",
  ingredients: "unknown" // should be an array, but it's a string
};

console.log(describePotion(mysteryPotion));
*/
