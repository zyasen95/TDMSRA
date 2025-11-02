// lib/getSubsectionMSRA.ts

import taxonomy from './MSRAtopics.json';

type Topic = string;

interface Subsubsection {
  name: string;
  topics: Topic[]; // Changed from subsubsubsection to topics for clarity
}

interface Subsection {
  name: string;
  subsubsections: Subsubsection[];
}

interface Category {
  category: string;
  subsections: Subsection[];
}

interface Taxonomy {
  categories: Category[];
}

/**
 * Generates a hierarchical prompt showing valid subsections, subsubsections, and topics
 * for a given MSRA category, using the nested taxonomy structure.
 */
export function getSubsectionAndSubsubsectionPromptMSRA(category: string): string {
  const taxonomyData = taxonomy as Taxonomy;
  const categoryEntry = taxonomyData.categories.find(
    (cat) => cat.category === category
  );

  if (!categoryEntry) {
    console.warn(`[getSubsectionAndSubsubsectionPromptMSRA] Category not found: ${category}`);
    return '';
  }

  let output = `For the category "${category}", use **only** one of the following subsections, subsubsections, and topics:\n`;

  for (const subsection of categoryEntry.subsections) {
    output += `\n**Subsection: ${subsection.name}**\n`;
    for (const subsub of subsection.subsubsections) {
      output += `  Subsubsection: ${subsub.name}\n`;
      for (const topic of subsub.topics) {
        output += `    • ${topic}\n`;
      }
    }
  }

  return output;
}

/**
 * Validates if a given subsection exists for a category
 */
export function validateSubsection(category: string, subsection: string): boolean {
  const taxonomyData = taxonomy as Taxonomy;
  const categoryEntry = taxonomyData.categories.find(
    (cat) => cat.category === category
  );
  
  if (!categoryEntry) return false;
  
  return categoryEntry.subsections.some(sub => sub.name === subsection);
}

/**
 * Validates if a given subsubsection exists for a category/subsection pair
 */
export function validateSubsubsection(
  category: string, 
  subsection: string, 
  subsubsection: string
): boolean {
  const taxonomyData = taxonomy as Taxonomy;
  const categoryEntry = taxonomyData.categories.find(
    (cat) => cat.category === category
  );
  
  if (!categoryEntry) return false;
  
  const subsectionEntry = categoryEntry.subsections.find(
    sub => sub.name === subsection
  );
  
  if (!subsectionEntry) return false;
  
  return subsectionEntry.subsubsections.some(
    subsub => subsub.name === subsubsection
  );
}

/**
 * Gets all topics for a given category/subsection/subsubsection
 */
export function getTopicsForSubsubsection(
  category: string,
  subsection: string,
  subsubsection: string
): string[] {
  const taxonomyData = taxonomy as Taxonomy;
  const categoryEntry = taxonomyData.categories.find(
    (cat) => cat.category === category
  );
  
  if (!categoryEntry) return [];
  
  const subsectionEntry = categoryEntry.subsections.find(
    sub => sub.name === subsection
  );
  
  if (!subsectionEntry) return [];
  
  const subsubsectionEntry = subsectionEntry.subsubsections.find(
    subsub => subsub.name === subsubsection
  );
  
  return subsubsectionEntry?.topics || [];
}

/**
 * Get coverage statistics for a category
 */
export function getCategoryStats(category: string): {
  subsections: number;
  subsubsections: number;
  topics: number;
} {
  const taxonomyData = taxonomy as Taxonomy;
  const categoryEntry = taxonomyData.categories.find(
    (cat) => cat.category === category
  );
  
  if (!categoryEntry) {
    return { subsections: 0, subsubsections: 0, topics: 0 };
  }
  
  let subsubsectionCount = 0;
  let topicCount = 0;
  
  for (const subsection of categoryEntry.subsections) {
    subsubsectionCount += subsection.subsubsections.length;
    for (const subsub of subsection.subsubsections) {
      topicCount += subsub.topics.length;
    }
  }
  
  return {
    subsections: categoryEntry.subsections.length,
    subsubsections: subsubsectionCount,
    topics: topicCount
  };
}