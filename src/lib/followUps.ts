// Follow-up questions offered under the latest assistant answer. Picked here
// from the topic of the question and answer instead of asked of the model:
// no extra LLM call, no wait, and they only ever point at questions the
// assistant's documents actually cover.
import { SUGGESTIONS } from "./assistant";

interface Topic {
  match: RegExp;
  questions: string[];
}

const TOPICS: Topic[] = [
  {
    match: /\b(retak\w*|resit\w*|re-sit\w*|fail(ed|s)?|second attempt|repeat\w*)\b/i,
    questions: ["What happens if I fail the resit as well?", "Can I retake an exam I passed to improve my grade?"],
  },
  {
    match: /\b(thesis|master'?s degree module|mam)\b/i,
    questions: ["How do I register my Master's thesis?", "How long do I have to write the thesis?"],
  },
  {
    match: /\b(grade[sd]?|grading|gpa|average|weighted|final mark)\b/i,
    questions: ["How is my final grade calculated?", "Do failed attempts count toward my final grade?"],
  },
  {
    match: /\b(register\w*|registration|deadline|enrol\w*|sign up|withdraw\w*|deregist\w*)\b/i,
    questions: ["When is the exam registration deadline?", "Can I withdraw from an exam after registering?"],
  },
  {
    match: /\b(internship|praktikum|work placement)\b/i,
    questions: ["Does an internship count toward my ECTS?"],
  },
  {
    match: /\b(abroad|exchange|erasmus|recogni[sz]\w*|transfer\w* credits?)\b/i,
    questions: ["How are courses from abroad recognised?", "Which documents do I need for recognition?"],
  },
  {
    match: /\b(leave of absence|semester off|urlaubssemester)\b/i,
    questions: ["Can I take exams during a leave of absence?"],
  },
  {
    match: /\b(specialization|specialisation|elective|further (competenc|qualification)\w*|additional)\b/i,
    questions: ["Which modules count toward Specialization?", "Can a module count in a different category?"],
  },
  {
    match: /\b(ects|credits?|graduat\w*|semesters? left|next semester)\b/i,
    questions: ["Which courses should I take next semester?", "How many ECTS do I need to graduate?"],
  },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/[?.!\s]+$/, "");

/**
 * Up to `max` questions related to the last exchange, skipping anything
 * already asked. Codes mentioned in the answer get a module-specific question.
 */
export function followUps(question: string, answer: string, asked: string[], codes: string[] = [], max = 3): string[] {
  const seen = new Set(asked.map(norm));
  const out: string[] = [];
  const add = (q: string) => {
    if (out.length < max && !seen.has(norm(q))) {
      seen.add(norm(q));
      out.push(q);
    }
  };
  if (codes[0]) add(`When is ${codes[0]} offered, and how is it assessed?`);
  // The question's own topic first, then the answer's.
  for (const text of [question, answer])
    for (const t of TOPICS) if (t.match.test(text)) t.questions.forEach(add);
  SUGGESTIONS.forEach(add);
  return out;
}
