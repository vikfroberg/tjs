function createPotion(name, ingredients) {
  return {
    name: name,
    ingredients: ingredients,
    strength: ingredients.length * 10
  };
}

const potions = [createPotion("Water", ["water"])];

potions.push(createPotion("Healing Brew", ["herb", "mushroom"]));
potions.push(createPotion("Fire Elixir", ["ash", "pepper", "oil"]));
/*

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
