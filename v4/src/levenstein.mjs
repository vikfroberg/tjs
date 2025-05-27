// Calculate Levenshtein distance between two strings
export function levenshteinDistance(str1, str2) {
  const matrix = [];

  // Create matrix with dimensions (str1.length + 1) x (str2.length + 1)
  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[str1.length][str2.length];
}

// Main search function
export function search(searchString, stringList, maxDistance = 2) {
  const results = [];

  // Calculate distance for each string in the list
  for (const str of stringList) {
    const distance = levenshteinDistance(
      searchString.toLowerCase(),
      str.toLowerCase(),
    );

    // Only include strings within the specified distance
    if (distance <= maxDistance) {
      results.push({
        string: str,
        distance: distance,
      });
    }
  }

  // Sort by distance (closest first), then alphabetically for ties
  results.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.string.localeCompare(b.string);
  });

  // Return just the strings, not the distance objects
  return results.map((result) => result.string);
}
