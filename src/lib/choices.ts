export const MAX_CHOICES = 8;
export const MAX_CHOICE_LENGTH = 80;
export const MAX_QUESTION_LENGTH = 500;

export function cleanChoices(choices: string[]): string[] {
  const seen = new Set<string>();

  return choices.reduce<string[]>((result, value) => {
    const label = value.trim();
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) return result;
    seen.add(key);
    result.push(label);
    return result;
  }, []);
}

export function validateAskInput(question: string, choices: string[]): string | null {
  if (!question.trim()) return "Enter a question.";
  if (question.trim().length > MAX_QUESTION_LENGTH) {
    return `Keep the question under ${MAX_QUESTION_LENGTH} characters.`;
  }

  const cleaned = cleanChoices(choices);
  if (cleaned.length < 2) return "Add at least two different answers.";
  if (cleaned.length > MAX_CHOICES) return `Use no more than ${MAX_CHOICES} answers.`;
  if (cleaned.some((choice) => choice.length > MAX_CHOICE_LENGTH)) {
    return `Keep each answer under ${MAX_CHOICE_LENGTH} characters.`;
  }

  return null;
}
